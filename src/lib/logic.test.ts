import { describe, expect, it } from 'vitest';
import { currentPhase, phaseAt, recommendedDuration } from './sizing';
import { resample, weeklyAllocation } from './curves';
import { computeLoad } from './capacity';
import { balance } from './balancer';
import { parseDelimited } from './csv';
import { quarterForDate, quarterStartAbsWeek, quarterStartUtc, utcToAbsWeek } from './quarters';
import { migrate } from '../store';
import { buildDemo } from './demo';
import type { Project, Schedule } from '../types';

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, workspaceId: 'w', quarter: 2026 * 4, name: id, ticket: '', reference: '', workType: 'Design', size: 'M',
  priority: 'P2', epic: false, pm: '', em: '', goal: '', gaTarget: '', productArea: '', notes: '', createdAt: 0, ...extra,
});
const sched = (extra: Partial<Schedule> = {}): Schedule => ({
  designerId: null, pairDesignerId: null, phaseOverride: null, startWeek: 0, duration: 4, allocation: 50,
  curve: { shape: 'flat' }, confirmed: false, milestones: [], ...extra,
});

describe('sizing', () => {
  it('Large Design at 50% is ~14 calendar weeks', () => {
    expect(recommendedDuration('Design', 'L', 50)).toBe(14);
  });
});

describe('phases', () => {
  const phases = ['Discovery', 'Concepts', 'Design', 'Approve', 'Handoff', 'Build support'];
  it('follows the schedule through the phase breakdown', () => {
    expect(phaseAt(phases, 10, -2)).toBe('Discovery');
    expect(phaseAt(phases, 10, 0)).toBe('Discovery');
    expect(phaseAt(phases, 10, 4)).toBe('Design');
    expect(phaseAt(phases, 10, 6)).toBe('Approve');
    expect(phaseAt(phases, 10, 9.9)).toBe('Build support');
    expect(phaseAt(phases, 10, 30)).toBe('Build support');
    expect(phaseAt([], 10, 3)).toBe('');
  });
  it('lets a manual override win', () => {
    expect(currentPhase(phases, { duration: 10, phaseOverride: null }, 6)).toBe('Approve');
    expect(currentPhase(phases, { duration: 10, phaseOverride: 'Concepts' }, 6)).toBe('Concepts');
  });
});

describe('curves', () => {
  it('flat curve equals max each week', () => {
    expect(weeklyAllocation({ shape: 'flat' }, 3, 40)).toEqual([40, 40, 40]);
  });
  it('front-loaded ramps down, back-loaded ramps up', () => {
    const f = weeklyAllocation({ shape: 'front' }, 5, 100);
    expect(f[0]).toBeGreaterThan(f[4]);
    const b = weeklyAllocation({ shape: 'back' }, 5, 100);
    expect(b[0]).toBeLessThan(b[4]);
  });
  it('resamples custom curves proportionally', () => {
    expect(resample([1, 0], 3)).toEqual([1, 0.5, 0]);
  });
});

describe('quarters', () => {
  it('quarters are contiguous 13-week blocks', () => {
    const q = 2027 * 4;
    expect(quarterStartAbsWeek(q + 1, 1) - quarterStartAbsWeek(q, 1)).toBe(13);
  });
  it('quarterForDate round-trips quarter starts', () => {
    for (const sm of [0, 1, 6]) for (let q = 2026 * 4; q < 2028 * 4; q++) expect(quarterForDate(quarterStartUtc(q, sm) + 86400000, sm)).toBe(q);
  });
});

describe('capacity', () => {
  it('sums projects and disruptions and flags overload', () => {
    const load = computeLoad(
      [{ project: project('a'), schedule: sched({ designerId: 'd', allocation: 80 }) }],
      [{ id: 'x', workspaceId: 'w', designerIds: ['d'], type: 'PTO', label: '', startAbsWeek: quarterStartAbsWeek(2026 * 4, 1) + 1, duration: 1, allocation: 50, curve: { shape: 'flat' } }],
      ['d'], quarterStartAbsWeek(2026 * 4, 1), 13, 1,
    );
    expect(load.d[0].total).toBe(80);
    expect(load.d[1].total).toBe(130);
    expect(load.d[5].total).toBe(0);
  });
});

describe('balancer', () => {
  it('spreads work across designers', () => {
    const items = [project('a'), project('b')].map((p) => ({ project: p, schedule: sched({ duration: 13, allocation: 80 }) }));
    const out = balance(items, [{ id: 'x', name: 'X', color: '' }, { id: 'y', name: 'Y', color: '' }], {}, 'even');
    expect(new Set(out.map((s) => s.designerId)).size).toBe(2);
    expect(out.every((s) => s.overWeeks === 0)).toBe(true);
  });
});

describe('csv', () => {
  it('parses quoted CSV and TSV', () => {
    expect(parseDelimited('a,b\n"x, y","z ""q"""')).toEqual([['a', 'b'], ['x, y', 'z "q"']]);
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('migration', () => {
  it('moves v1 per-project scheduling into Plan A', () => {
    const v1 = {
      workspaces: [{ id: 'w', name: 'W', designers: [], config: undefined }],
      projects: [{ ...project('a'), designerId: 'd', startWeek: 3, duration: 5, allocation: 40, phase: 'Design', confirmed: true }],
    };
    const s = migrate(v1 as never, 1);
    expect(s.plans).toHaveLength(1);
    expect(s.plans[0].schedules.a).toMatchObject({ designerId: 'd', startWeek: 3, duration: 5, allocation: 40, confirmed: true });
    expect('designerId' in s.projects[0]).toBe(false);
  });
});

describe('celebration unlocks', () => {
  it('backfills provable unlocks when migrating v2 data', () => {
    const v2 = {
      version: 2,
      workspaces: [{ id: 'w', name: 'W', designers: [], config: undefined }],
      projects: [project('a')],
      plans: [],
      totalPlansCreated: 12,
    };
    const s = migrate(v2 as never, 2);
    expect(s.unlocked).toEqual({ 'first-initiative': 0, 'ten-plans': 0 });
  });
});

describe('terminology migration', () => {
  it('renames default Initiative labels to Project but keeps custom ones', () => {
    const labels = (initiative: string, initiatives: string) => ({ config: { teamType: 'product', labels: { initiative, initiatives } } });
    const v3 = {
      version: 3,
      workspaces: [
        { id: 'a', name: 'A', designers: [], ...labels('Initiative', 'Initiatives') },
        { id: 'b', name: 'B', designers: [], ...labels('Epic', 'Epics') },
      ],
      projects: [],
      plans: [],
    };
    const s = migrate(v3 as never, 3);
    expect(s.workspaces[0].config.labels).toMatchObject({ initiative: 'Project', initiatives: 'Projects' });
    expect(s.workspaces[1].config.labels).toMatchObject({ initiative: 'Epic', initiatives: 'Epics' });
  });
});

describe('phase migration', () => {
  it('drops stale default phases and keeps deliberate ones as overrides (v4 → v5)', () => {
    const q = quarterForDate(Date.now(), 1);
    // Started eight weeks ago and twenty weeks long, so the schedule says Design.
    const startWeek = utcToAbsWeek(Date.now()) - quarterStartAbsWeek(q, 1) - 8;
    const legacy = (phase: string) => ({ ...sched({ startWeek, duration: 20 }), phaseOverride: undefined, phase });
    const v4 = {
      version: 4,
      settings: { fiscalStartMonth: 1 },
      workspaces: [{ id: 'w', name: 'W', designers: [], config: { teamType: 'product' } }],
      projects: [project('a', { quarter: q }), project('b', { quarter: q }), project('c', { quarter: q })],
      plans: [{ id: 'p', workspaceId: 'w', quarter: q, name: 'Plan A', createdAt: 0, schedules: { a: legacy('Discovery'), b: legacy('Concepts'), c: legacy('Design') } }],
    };
    const s = migrate(v4 as never, 4);
    const out = s.plans[0].schedules;
    expect(out.a.phaseOverride).toBeNull(); // the untouched default now follows the schedule
    expect(out.b.phaseOverride).toBe('Concepts'); // set by hand and disagrees with the schedule
    expect(out.c.phaseOverride).toBeNull(); // matches the schedule anyway
    expect('phase' in out.a).toBe(false);
  });
});

describe('demo data', () => {
  it('builds a 10-designer workspace with two plans and some unassigned work', () => {
    let n = 0;
    const demo = buildDemo(2027 * 4 + 3, 1, () => `id${n++}`);
    expect(demo.workspace.designers).toHaveLength(10);
    expect(demo.projects.length).toBeGreaterThanOrEqual(40);
    expect(demo.plans).toHaveLength(3);
    const a = Object.values(demo.plans[0].schedules);
    // This quarter should be busy but not absurd: average load across the team stays near capacity.
    const q = 2027 * 4 + 3;
    const qs = quarterStartAbsWeek(q, 1);
    const entries = demo.projects.filter((p) => p.quarter === q).map((project) => ({ project, schedule: demo.plans[0].schedules[project.id] }));
    const load = computeLoad(entries, demo.disruptions, demo.workspace.designers.map((d) => d.id), qs, 13, 1);
    const avg = Object.values(load).flat().reduce((s, w) => s + w.total, 0) / (13 * 10);
    expect(avg).toBeGreaterThan(55);
    expect(avg).toBeLessThan(100);
    const overloaded = Object.values(load).filter((w) => w.some((x) => x.total > 100.5)).length;
    expect(overloaded).toBeGreaterThan(0);
    expect(overloaded).toBeLessThan(8);
    expect(a.filter((s) => !s.designerId).length).toBeGreaterThan(0);
    expect(a.filter((s) => s.confirmed).length).toBeGreaterThan(10);
    expect(demo.disruptions.length).toBeGreaterThan(5);
    // Phases mostly follow the schedule, with a couple pinned by hand.
    expect(a.filter((s) => s.phaseOverride).length).toBe(2);
  });
});

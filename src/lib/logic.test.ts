import { describe, expect, it } from 'vitest';
import { currentPhase, phaseAt, recommendedDuration } from './sizing';
import { resample, weeklyAllocation } from './curves';
import { computeLoad } from './capacity';
import { balance } from './balancer';
import { parseDelimited } from './csv';
import { parseLooseDate, quarterForDate, quarterStartAbsWeek, quarterStartUtc, utcToAbsWeek } from './quarters';
import { backlogOf, migrate, useStore } from '../store';
import { buildDemo } from './demo';
import { DESIGNER_COLORS } from './defaults';
import { readableOn } from './motion';
import type { Project, Schedule } from '../types';

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, workspaceId: 'w', quarter: 2026 * 4, backlogRank: null, name: id, ticket: '', reference: '', workType: 'Design', size: 'M',
  priority: 'P2', epic: false, pm: '', em: '', goal: '', gaTargetWeek: null, gaTargetText: '', productArea: '', notes: '', createdAt: 0, ...extra,
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

describe('loose dates', () => {
  const ref = Date.UTC(2026, 10, 2); // Nov 2, 2026
  it('parses common hand-typed formats', () => {
    expect(parseLooseDate('2027-03-15', ref)).toBe(Date.UTC(2027, 2, 15));
    expect(parseLooseDate('Mar 15', ref)).toBe(Date.UTC(2027, 2, 15)); // no year: next one after the reference
    expect(parseLooseDate('Dec 1st', ref)).toBe(Date.UTC(2026, 11, 1));
    expect(parseLooseDate('15 March 2027', ref)).toBe(Date.UTC(2027, 2, 15));
    expect(parseLooseDate('September 30, 2026', ref)).toBe(Date.UTC(2026, 8, 30));
    expect(parseLooseDate('3/15/27', ref)).toBe(Date.UTC(2027, 2, 15));
    expect(parseLooseDate('Jan 2027', ref)).toBe(Date.UTC(2027, 0, 1));
  });
  it('rejects text that is not a date', () => {
    for (const t of ['', 'TBD', 'after Q2 launch', 'Feb 30', '13/45', 'end of quarter']) expect(parseLooseDate(t, ref)).toBeNull();
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

describe('GA target migration', () => {
  it('turns parseable GA text into a week and keeps the rest as text (v5 → v6)', () => {
    const q = 2027 * 4; // FY27 Q1 with a February start begins in Feb 2026
    const v5 = {
      version: 5,
      settings: { fiscalStartMonth: 1 },
      workspaces: [{ id: 'w', name: 'W', designers: [], config: { teamType: 'product' } }],
      projects: [
        { ...project('a', { quarter: q }), gaTargetWeek: undefined, gaTargetText: undefined, gaTarget: 'Mar 16' },
        { ...project('b', { quarter: q }), gaTargetWeek: undefined, gaTargetText: undefined, gaTarget: 'after the pricing review' },
        { ...project('c', { quarter: q }), gaTargetWeek: undefined, gaTargetText: undefined, gaTarget: '' },
      ],
      plans: [],
    };
    const [a, b, c] = migrate(v5 as never, 5).projects;
    expect(a.gaTargetWeek).toBe(utcToAbsWeek(Date.UTC(2026, 2, 16)));
    expect(a.gaTargetText).toBe('');
    expect(b).toMatchObject({ gaTargetWeek: null, gaTargetText: 'after the pricing review' });
    expect(c).toMatchObject({ gaTargetWeek: null, gaTargetText: '' });
    expect('gaTarget' in a).toBe(false);
  });
});

describe('backlog', () => {
  it('migrates v6 projects as planned work with no backlog rank (v6 → v7)', () => {
    const { backlogRank: _r, ...old } = project('a');
    const s = migrate({ version: 6, workspaces: [], projects: [old], plans: [] } as never, 6);
    expect(s.projects[0]).toMatchObject({ quarter: 2026 * 4, backlogRank: null });
  });

  it('ranks unscheduled work, and moves projects between the backlog and quarters', () => {
    const q = 2027 * 4;
    const ws = { id: 'w', name: 'W', designers: [{ id: 'd', name: 'D', color: '#000' }], config: migrate({ workspaces: [{ id: 'w', name: 'W', designers: [] }] } as never, 7).workspaces[0].config };
    useStore.setState({
      workspaces: [ws], activeWorkspaceId: 'w', currentQuarter: q,
      projects: [project('a', { quarter: q })],
      plans: [{ id: 'p', workspaceId: 'w', quarter: q, name: 'Plan A', createdAt: 0, schedules: { a: sched({ designerId: 'd', confirmed: true }) } }],
      activePlan: { [`w:${q}`]: 'p' },
    });
    const st = useStore.getState();
    const [x, y] = st.addToBacklog(['X', 'Y']);
    expect(backlogOf(useStore.getState().projects, 'w').map((p) => p.id)).toEqual([x, y]);
    st.moveInBacklog(y, -1);
    expect(backlogOf(useStore.getState().projects, 'w').map((p) => p.id)).toEqual([y, x]);

    // Unschedule: out of every plan, onto the bottom of the backlog.
    st.moveToQuarter(['a'], null);
    let s = useStore.getState();
    expect(s.plans[0].schedules.a).toBeUndefined();
    expect(backlogOf(s.projects, 'w').map((p) => p.id)).toEqual([y, x, 'a']);

    // Plan into a quarter with no plan yet: it gets a Plan A with the project unassigned.
    st.moveToQuarter([x], q + 1);
    s = useStore.getState();
    const next = s.plans.find((p) => p.quarter === q + 1)!;
    expect(next.schedules[x]).toMatchObject({ designerId: null });
    expect(s.activePlan[`w:${q + 1}`]).toBe(next.id);
    expect(s.projects.find((p) => p.id === x)).toMatchObject({ quarter: q + 1, backlogRank: null });
  });
});

describe('designer color migration', () => {
  it('darkens retired palette colors and keeps custom ones (v7 → v8)', () => {
    const v7 = { version: 7, projects: [], plans: [], workspaces: [{ id: 'w', name: 'W', config: { teamType: 'product' }, designers: [
      { id: 'a', name: 'A', color: '#6366F1' }, { id: 'b', name: 'B', color: '#8b5cf6' }, { id: 'c', name: 'C', color: '#123456' },
    ] }] };
    expect(migrate(v7 as never, 7).workspaces[0].designers.map((d) => d.color)).toEqual(['#4f46e5', '#7c3aed', '#123456']);
  });
  it('every palette color has a readable bar text color', () => {
    const lum = (h: string) => {
      const hex = h.length === 4 ? h.slice(1).replace(/./g, '$&$&') : h.slice(1);
      const n = parseInt(hex, 16);
      const l = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * l((n >> 16) & 255) + 0.7152 * l((n >> 8) & 255) + 0.0722 * l(n & 255);
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const c of DESIGNER_COLORS) expect(ratio(c, readableOn(c))).toBeGreaterThanOrEqual(4.5);
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
    // A ranked backlog of unscheduled ideas.
    const unscheduled = demo.projects.filter((p) => p.quarter == null);
    expect(unscheduled.length).toBeGreaterThanOrEqual(3);
    expect(unscheduled.map((p) => p.backlogRank)).toEqual(unscheduled.map((_, i) => i));
    // Phases mostly follow the schedule, with a couple pinned by hand.
    expect(a.filter((s) => s.phaseOverride).length).toBe(2);
    // Some launches have GA dates, and at least one design schedule runs past its GA.
    const thisQ = demo.projects.filter((p) => p.quarter === q);
    expect(thisQ.filter((p) => p.gaTargetWeek != null).length).toBeGreaterThan(5);
    expect(thisQ.some((p) => p.gaTargetWeek != null && qs + demo.plans[0].schedules[p.id].startWeek + demo.plans[0].schedules[p.id].duration - 1 > p.gaTargetWeek)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizePhase, normalizePriority, normalizeSize, parseInput, parseLink, parseQuickLine, planImport, rowsToItems, SAMPLES } from './ingest';
import { defaultConfig } from './defaults';
import type { Project } from '../types';

const designers = [
  { id: 'm', name: 'Maya Chen', color: '#000' },
  { id: 'j', name: 'Jordan Lee', color: '#000' },
];
const ctx = (projects: Project[] = []) => ({ projects, designers, config: defaultConfig('product'), quarterStartAbs: 0 });

describe('quick-add lines', () => {
  it('pulls designer, priority, size, area, duration and allocation out of a line', () => {
    expect(parseQuickLine('- Checkout redesign @Maya !P0 ~L #Checkout 6w 50%')).toMatchObject({
      title: 'Checkout redesign', assignee: 'Maya', priority: 'P0', size: 'L', area: 'Checkout', durationWeeks: 6, allocation: 50,
    });
    expect(parseQuickLine('Search @"Jordan Lee"')).toMatchObject({ title: 'Search', assignee: 'Jordan Lee' });
  });
  it('recognises tracker links', () => {
    expect(parseLink('https://acme.atlassian.net/browse/DSN-142 Pricing page')).toMatchObject({ source: 'jira', externalId: 'DSN-142', title: 'Pricing page' });
    expect(parseLink('https://app.asana.com/0/111/222')).toMatchObject({ source: 'asana', externalId: '222' });
  });
});

describe('parseInput', () => {
  it('detects a Jira CSV export and maps its columns', () => {
    const p = parseInput(SAMPLES.jira.text, 'jira.csv');
    expect(p.kind).toBe('table');
    expect(p.source).toBe('jira');
    expect(p.mapping).toEqual(['externalId', 'title', 'assignee', 'priority', 'status', 'size', 'due', 'area']);
    const items = rowsToItems(p.rows!, p.mapping!, p.source);
    expect(items[0]).toMatchObject({ externalId: 'DSN-201', title: 'Saved payment methods', size: '5' });
  });
  it('reads Asana and ServiceNow JSON', () => {
    expect(parseInput(SAMPLES.asana.text).items?.[0]).toMatchObject({ source: 'asana', externalId: '120001', assignee: 'Sam Rivera' });
    expect(parseInput(SAMPLES.servicenow.text).items?.[0]).toMatchObject({ source: 'servicenow', externalId: 'DMND0001042', assignee: 'Jordan Lee', priority: '2 - High' });
  });
  it('treats headerless pasted cells as names in the first column', () => {
    const p = parseInput('Alpha\tx\nBeta\ty');
    expect(p.mapping?.[0]).toBe('title');
    expect(p.rows).toHaveLength(2);
  });
});

describe('normalization', () => {
  it('maps priorities, sizes and statuses from trackers', () => {
    expect(['Highest', '2 - High', 'Medium', 'Low', 'p1'].map(normalizePriority)).toEqual(['P0', 'P1', 'P2', 'P3', 'P1']);
    expect(['3', '5', '8', '13', 'xl', 'Medium'].map(normalizeSize)).toEqual(['M', 'M', 'L', 'XL', 'XL', 'M']);
    const phases = defaultConfig('product').phases;
    expect(normalizePhase('In Review', phases)).toBe('Approve');
    expect(normalizePhase('Done', phases)).toBe(phases[phases.length - 1]);
    expect(normalizePhase('To Do', phases)).toBe(phases[0]);
  });
});

describe('planImport', () => {
  it('updates by ticket, creates new ones, and matches designers by first name', () => {
    const existing = { id: 'p1', name: 'Old name', ticket: 'DSN-201' } as Project;
    const rows = planImport(
      [
        { source: 'jira', externalId: 'DSN-201', title: 'Saved payment methods', assignee: 'Maya', priority: 'High' },
        { source: 'jira', externalId: 'DSN-999', title: 'Brand new', assignee: 'Nobody' },
      ],
      ctx([existing]),
    );
    expect(rows[0]).toMatchObject({ action: 'update', matchedBy: 'ticket', schedule: { designerId: 'm' }, project: { priority: 'P1', name: 'Saved payment methods' } });
    expect(rows[1].action).toBe('create');
    expect(rows[1].warnings[0]).toMatch(/isn’t on the team/);
  });
  it('turns start and due dates into a start week and duration', () => {
    const DAY = 86400000;
    const epochMonday = Date.UTC(1970, 0, 5);
    const iso = (w: number) => new Date(epochMonday + w * 7 * DAY).toISOString().slice(0, 10);
    const [r] = planImport([{ source: 'sheet', title: 'X', start: iso(2), due: iso(5) }], ctx());
    expect(r.schedule).toMatchObject({ startWeek: 2, duration: 4 });
    // Due date only: duration from size (M Design at 50% = 8 weeks), ending on the due week.
    const [d] = planImport([{ source: 'sheet', title: 'Y', due: iso(10), size: 'M' }], ctx());
    expect(d.schedule).toMatchObject({ duration: 8, startWeek: 3 });
  });
});

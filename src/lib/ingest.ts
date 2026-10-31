import type { Designer, ExternalSource, Priority, Project, Schedule, Size, WorkspaceConfig } from '../types';
import { PRIORITIES, SIZES, WEEKS_PER_QUARTER } from '../types';
import { parseDelimited } from './csv';
import { utcToAbsWeek } from './quarters';
import { defaultAllocation, recommendedDuration } from './sizing';

/**
 * Ingest pipeline: anything the user brings in (a pasted spreadsheet, a Jira
 * or Asana export, a ServiceNow JSON dump, a list of tracker links, or quick
 * one-line-per-project text) is normalized to `ExternalItem`, then planned
 * against the current workspace (create vs update, designer matching) before
 * anything is written.
 *
 * Live integrations later only need to produce `ExternalItem[]` (e.g. from a
 * Jira REST search or Asana tasks API) and reuse `planImport` + the store's
 * `applyImport`.
 */

export interface ExternalItem {
  source: ExternalSource;
  externalId?: string;
  url?: string;
  title: string;
  notes?: string;
  assignee?: string;
  assigneeEmail?: string;
  /** Free-form priority from the source ("High", "2 - High", "P1"…). */
  priority?: string;
  /** Free-form status ("In Progress", "Done"…). */
  status?: string;
  /** Story points or a t-shirt size. */
  size?: string;
  workType?: string;
  start?: string;
  due?: string;
  area?: string;
  pm?: string;
  em?: string;
  goal?: string;
  allocation?: number;
  durationWeeks?: number;
}

export type ItemField = Exclude<keyof ExternalItem, 'source'>;

export interface ConnectorInfo {
  id: Exclude<ExternalSource, 'paste' | 'sheet'>;
  name: string;
  color: string;
  blurb: string;
  /** Steps to export data today, shown until live sync exists. */
  exportSteps: string[];
  status: 'file-import' | 'planned';
}

export const CONNECTORS: ConnectorInfo[] = [
  {
    id: 'jira',
    name: 'Jira',
    color: '#2684ff',
    blurb: 'Epics and issues with assignee, priority, status and story points.',
    exportSteps: ['Run a filter (e.g. project = DSN AND type = Epic).', 'Export → CSV (current fields), or paste issue links.', 'Drop the file here.'],
    status: 'file-import',
  },
  {
    id: 'asana',
    name: 'Asana',
    color: '#f06a6a',
    blurb: 'Tasks or projects with assignee, dates, section and tags.',
    exportSteps: ['Open the project.', 'Project menu → Export / Print → CSV (or JSON).', 'Drop the file here.'],
    status: 'file-import',
  },
  {
    id: 'servicenow',
    name: 'ServiceNow',
    color: '#62d84e',
    blurb: 'Demands, stories or requests with assignment group and priority.',
    exportSteps: ['Open a list view (e.g. dmn_demand).', 'Right-click a column header → Export → CSV or JSON.', 'Drop the file here.'],
    status: 'file-import',
  },
  {
    id: 'linear',
    name: 'Linear',
    color: '#5e6ad2',
    blurb: 'Projects and issues with lead, priority and target date.',
    exportSteps: ['Settings → Import/Export → Export CSV.', 'Drop the file here.'],
    status: 'file-import',
  },
];

/* ---------- column header recognition ---------- */

/** Header aliases (lower-cased, punctuation-insensitive) used by every tabular source. */
const FIELD_ALIASES: Record<ItemField, string[]> = {
  title: ['name', 'title', 'summary', 'project', 'initiative', 'task', 'task name', 'short description', 'shortdescription', 'epic name', 'issue'],
  externalId: ['issue key', 'key', 'task id', 'gid', 'number', 'id', 'sys id', 'sysid', 'ticket', 'jira', 'identifier'],
  url: ['url', 'link', 'permalink', 'permalink url', 'reference', 'figma', 'doc'],
  notes: ['description', 'notes', 'details', 'comments'],
  assignee: ['assignee', 'designer', 'owner', 'assigned to', 'assignedto', 'lead', 'responsible'],
  assigneeEmail: ['assignee email', 'email', 'owner email'],
  priority: ['priority', 'pri', 'urgency', 'impact'],
  status: ['status', 'state', 'phase', 'stage', 'section', 'section column', 'column'],
  size: ['size', 'story points', 'custom field story points', 'estimate', 'points', 't shirt', 'tshirt', 'effort'],
  workType: ['work type', 'type', 'issue type', 'category'],
  start: ['start', 'start date', 'start on', 'planned start date', 'created'],
  due: ['due', 'due date', 'due on', 'target date', 'end date', 'planned end date', 'ga', 'ga target', 'launch'],
  area: ['product area', 'area', 'component', 'components', 'team', 'pillar', 'projects', 'project name', 'assignment group', 'labels', 'tags'],
  pm: ['pm', 'product manager', 'reporter', 'requested by'],
  em: ['em', 'engineering manager', 'eng lead'],
  goal: ['goal', 'okr', 'objective', 'quarterly goal'],
  allocation: ['allocation', 'alloc', 'percent', '%'],
  durationWeeks: ['duration', 'weeks', 'duration weeks'],
};

export const FIELD_LABELS: Record<ItemField, string> = {
  title: 'Name', externalId: 'Ticket / key', url: 'Link', notes: 'Notes', assignee: 'Designer', assigneeEmail: 'Designer email',
  priority: 'Priority', status: 'Status / phase', size: 'Size or points', workType: 'Work type', start: 'Start date', due: 'Due date',
  area: 'Product area', pm: 'PM', em: 'EM', goal: 'Goal', allocation: 'Allocation %', durationWeeks: 'Duration (weeks)',
};

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

/** Guess a field for each column. Exact alias matches win over partial ones; each field is used once. */
export function guessMapping(headers: string[]): (ItemField | '')[] {
  const used = new Set<ItemField>();
  const out: (ItemField | '')[] = headers.map(() => '');
  for (const exact of [true, false]) {
    headers.forEach((h, i) => {
      if (out[i]) return;
      const n = norm(h);
      for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [ItemField, string[]][]) {
        if (used.has(field)) continue;
        if (aliases.some((a) => (exact ? n === a : n.includes(a) && a.length > 3))) {
          out[i] = field;
          used.add(field);
          return;
        }
      }
    });
  }
  return out;
}

/** Which tracker a set of headers most likely came from. */
export function detectSource(headers: string[]): ExternalSource {
  const h = headers.map(norm).join('|');
  if (/issue key|issue type|story points|sprint/.test(h)) return 'jira';
  if (/task id|section column|assignee email|parent task/.test(h)) return 'asana';
  if (/short description|assignment group|sys id|number\|/.test(h) || /\bsys_/.test(headers.join('|'))) return 'servicenow';
  if (/identifier|cycle|team\|/.test(h) && /linear/.test(h)) return 'linear';
  return 'sheet';
}

/* ---------- parsing ---------- */

export interface ParsedInput {
  kind: 'table' | 'items';
  source: ExternalSource;
  /** For tables: raw headers/rows so the user can adjust mapping. */
  headers?: string[];
  rows?: string[][];
  mapping?: (ItemField | '')[];
  items?: ExternalItem[];
  note?: string;
}

const LINK_PATTERNS: { source: ExternalSource; re: RegExp; id: (m: RegExpMatchArray) => string }[] = [
  { source: 'jira', re: /https?:\/\/[^\s]+\/browse\/([A-Z][A-Z0-9]+-\d+)/, id: (m) => m[1] },
  { source: 'jira', re: /https?:\/\/[^\s]*atlassian\.net[^\s]*selectedIssue=([A-Z][A-Z0-9]+-\d+)/, id: (m) => m[1] },
  { source: 'asana', re: /https?:\/\/app\.asana\.com\/\d+\/\d+\/(\d+)/, id: (m) => m[1] },
  { source: 'asana', re: /https?:\/\/app\.asana\.com\/[^\s]*\/task\/(\d+)/, id: (m) => m[1] },
  { source: 'servicenow', re: /https?:\/\/[^\s]*service-now\.com[^\s]*(?:sys_id=|sysparm_query=number=)([A-Za-z0-9]+)/, id: (m) => m[1] },
  { source: 'linear', re: /https?:\/\/linear\.app\/[^\s]+\/issue\/([A-Z]+-\d+)/, id: (m) => m[1] },
];

/** Parse a tracker link into an item, if it is one. */
export function parseLink(line: string): ExternalItem | null {
  for (const p of LINK_PATTERNS) {
    const m = line.match(p.re);
    if (m) {
      const id = p.id(m);
      const rest = line.replace(m[0], '').replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '');
      return { source: p.source, externalId: id, url: m[0], title: rest || id };
    }
  }
  return null;
}

/**
 * Quick-add syntax, one project per line:
 *   Checkout redesign @maya !P1 ~L #Checkout 6w 50%
 * @designer, !priority, ~size, #area, Nw duration, N% allocation. Everything else is the name.
 */
export function parseQuickLine(line: string): ExternalItem | null {
  const link = parseLink(line);
  if (link) return link;
  let text = ` ${line.trim()} `;
  if (!text.trim()) return null;
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (!m) return undefined;
    text = text.replace(m[0], ' ');
    return m[1];
  };
  const item: ExternalItem = { source: 'paste', title: '' };
  // @maya, @maya.chen or @"Maya Chen"
  item.assignee = take(/\s@"([^"]+)"/) ?? take(/\s@(\S+)/)?.replace(/[._]/g, ' ');
  item.priority = take(/\s!(p?[0-3]|high|highest|medium|low|lowest|critical)\b/i);
  item.size = take(/\s~(xs|s|m|l|xl|\d+)\b/i);
  item.area = take(/\s#([\p{L}][\p{L}\d-]*)/u);
  const weeks = take(/\s(\d{1,2})\s?w(?:ks?|eeks?)?\b/i);
  const pct = take(/\s(\d{1,3})%/);
  const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/;
  item.title = text.replace(bullet, '').replace(/\s+/g, ' ').trim();
  if (weeks) item.durationWeeks = Number(weeks);
  if (pct) item.allocation = Number(pct);
  return item.title ? item : null;
}

function itemsFromRows(rows: string[][], mapping: (ItemField | '')[], source: ExternalSource): ExternalItem[] {
  return rows
    .map((r) => {
      const item: ExternalItem = { source, title: '' };
      mapping.forEach((f, i) => {
        if (!f) return;
        const v = (r[i] ?? '').trim();
        if (!v) return;
        if (f === 'allocation' || f === 'durationWeeks') {
          const n = parseFloat(v);
          if (!Number.isNaN(n)) item[f] = n;
        } else (item as unknown as Record<string, string>)[f] = v;
      });
      return item;
    })
    .filter((i) => i.title);
}

export const rowsToItems = itemsFromRows;

/* JSON exports / API payloads */

type Json = Record<string, unknown>;
const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string') return v || undefined;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as Json;
    return str(o.displayName ?? o.display_value ?? o.name ?? o.value ?? o.emailAddress ?? o.email);
  }
  return undefined;
};

function fromJiraIssue(i: Json): ExternalItem {
  const f = (i.fields ?? {}) as Json;
  const assignee = f.assignee as Json | undefined;
  const base = typeof i.self === 'string' ? String(i.self).replace(/\/rest\/api\/.*/, '') : '';
  return {
    source: 'jira',
    externalId: str(i.key),
    url: base && i.key ? `${base}/browse/${i.key}` : undefined,
    title: str(f.summary) ?? str(i.key) ?? '',
    assignee: str(assignee?.displayName),
    assigneeEmail: str(assignee?.emailAddress),
    priority: str(f.priority),
    status: str(f.status),
    size: str(f.customfield_10016 ?? f.customfield_10026 ?? f.story_points),
    workType: str(f.issuetype),
    due: str(f.duedate),
    start: str(f.customfield_10015),
    area: (f.components as Json[] | undefined)?.map((c) => str(c)).filter(Boolean)[0] ?? (f.labels as string[] | undefined)?.[0],
    pm: str(f.reporter),
    notes: typeof f.description === 'string' ? f.description : undefined,
  };
}

function fromAsanaTask(t: Json): ExternalItem {
  const assignee = t.assignee as Json | undefined;
  return {
    source: 'asana',
    externalId: str(t.gid),
    url: str(t.permalink_url),
    title: str(t.name) ?? '',
    assignee: str(assignee?.name),
    assigneeEmail: str(assignee?.email),
    status: t.completed ? 'Done' : str((t.memberships as Json[] | undefined)?.[0]?.section),
    due: str(t.due_on),
    start: str(t.start_on),
    area: str((t.projects as Json[] | undefined)?.[0]) ?? str((t.tags as Json[] | undefined)?.[0]),
    notes: str(t.notes),
  };
}

function fromServiceNow(r: Json): ExternalItem {
  return {
    source: 'servicenow',
    externalId: str(r.number) ?? str(r.sys_id),
    title: str(r.short_description) ?? str(r.name) ?? str(r.number) ?? '',
    assignee: str(r.assigned_to),
    priority: str(r.priority),
    status: str(r.state),
    due: str(r.due_date ?? r.end_date),
    start: str(r.start_date),
    area: str(r.assignment_group),
    notes: str(r.description),
  };
}

function fromGenericObject(o: Json, source: ExternalSource): ExternalItem {
  const keys = Object.keys(o);
  const mapping = guessMapping(keys);
  const row = keys.map((k) => str(o[k]) ?? '');
  return itemsFromRows([row], mapping, source)[0] ?? { source, title: '' };
}

export function parseJson(text: string): ParsedInput | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const d = data as Json;
  if (Array.isArray(d?.issues)) return { kind: 'items', source: 'jira', items: (d.issues as Json[]).map(fromJiraIssue).filter((i) => i.title) };
  if (Array.isArray(d?.data) && (d.data as Json[])[0]?.gid) return { kind: 'items', source: 'asana', items: (d.data as Json[]).map(fromAsanaTask).filter((i) => i.title) };
  if (Array.isArray(d?.records) || Array.isArray(d?.result)) {
    const rows = (d.records ?? d.result) as Json[];
    return { kind: 'items', source: 'servicenow', items: rows.map(fromServiceNow).filter((i) => i.title) };
  }
  const arr = Array.isArray(data) ? (data as Json[]) : null;
  if (arr && arr.length && typeof arr[0] === 'object') {
    if (arr[0].fields && arr[0].key) return { kind: 'items', source: 'jira', items: arr.map(fromJiraIssue).filter((i) => i.title) };
    if (arr[0].gid) return { kind: 'items', source: 'asana', items: arr.map(fromAsanaTask).filter((i) => i.title) };
    if (arr[0].short_description || arr[0].sys_id) return { kind: 'items', source: 'servicenow', items: arr.map(fromServiceNow).filter((i) => i.title) };
    return { kind: 'items', source: 'sheet', items: arr.map((o) => fromGenericObject(o, 'sheet')).filter((i) => i.title) };
  }
  return null;
}

/**
 * Figure out what was pasted or dropped. JSON → tracker payloads; tab/comma
 * tables with a header row → mappable table; otherwise one project per line
 * (quick-add syntax and tracker links).
 */
export function parseInput(text: string, filename?: string): ParsedInput {
  const t = text.replace(/^﻿/, '').trim();
  if (!t) return { kind: 'items', source: 'paste', items: [] };
  if (/^[[{]/.test(t) || filename?.endsWith('.json')) {
    const j = parseJson(t);
    if (j) return j;
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  const looksTabular =
    !!filename?.match(/\.(csv|tsv)$/i) ||
    (lines.length > 1 && (lines[0].includes('\t') || (lines[0].split(',').length >= 3 && lines[1].split(',').length >= 3)));
  if (looksTabular) {
    const rows = parseDelimited(t);
    const headers = rows[0] ?? [];
    const mapping = guessMapping(headers);
    // With no recognisable header, treat the first column as names and keep row 1.
    if (!mapping.includes('title')) {
      const m: (ItemField | '')[] = headers.map((_, i) => (i === 0 ? 'title' : ''));
      return { kind: 'table', source: 'paste', headers: headers.map((_, i) => `Column ${i + 1}`), rows, mapping: m, note: 'No header row recognised, so the first column is used as the name.' };
    }
    return { kind: 'table', source: detectSource(headers), headers, rows: rows.slice(1), mapping };
  }
  const items = lines.map(parseQuickLine).filter((x): x is ExternalItem => !!x);
  const linkSource = items.find((i) => i.source !== 'paste')?.source;
  return { kind: 'items', source: linkSource ?? 'paste', items };
}

/* ---------- normalization ---------- */

export function normalizePriority(v?: string): Priority | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase().trim();
  if (/^p?0$|highest|critical|blocker|urgent|^1\s*-/.test(s)) return 'P0';
  if (/^p?1$|^high|major|^2\s*-/.test(s)) return 'P1';
  if (/^p?2$|medium|normal|moderate|^3\s*-/.test(s)) return 'P2';
  if (/^p?3$|low|minor|trivial|planning|^[45]\s*-/.test(s)) return 'P3';
  const up = s.toUpperCase() as Priority;
  return PRIORITIES.includes(up) ? up : undefined;
}

export function normalizeSize(v?: string): Size | undefined {
  if (!v) return undefined;
  const s = v.trim().toUpperCase();
  if (s === 'XS') return 'S';
  if ((SIZES as string[]).includes(s)) return s as Size;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return /SMALL/.test(s) ? 'S' : /MED/.test(s) ? 'M' : /LARGE/.test(s) ? (/X/.test(s) ? 'XL' : 'L') : undefined;
  return n <= 2 ? 'S' : n <= 5 ? 'M' : n <= 8 ? 'L' : 'XL';
}

/** Map a tracker status onto the workspace's phases by intent, not exact wording. */
export function normalizePhase(v: string | undefined, phases: string[]): string | undefined {
  if (!v || !phases.length) return undefined;
  const s = v.toLowerCase();
  const exact = phases.find((p) => p.toLowerCase() === s);
  if (exact) return exact;
  const find = (re: RegExp) => phases.find((p) => re.test(p.toLowerCase()));
  if (/done|closed|resolved|complete|shipped|launched/.test(s)) return phases[phases.length - 1];
  if (/review|approv|sign.?off|pending/.test(s)) return find(/approv|review/) ?? phases[Math.floor(phases.length * 0.6)];
  if (/progress|doing|active|work|wip|design/.test(s)) return find(/design/) ?? phases[Math.floor(phases.length / 2)];
  if (/backlog|to ?do|new|open|draft|discover|research|idea/.test(s)) return phases[0];
  return undefined;
}

function parseDate(v?: string): number | null {
  if (!v) return null;
  const t = Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(t) ? null : t;
}

/* ---------- planning ---------- */

export interface DesignerMatch {
  designer?: Designer;
  how?: 'email' | 'name' | 'first name';
}

export function matchDesigner(designers: Designer[], name?: string, email?: string): DesignerMatch {
  const n = name?.trim().toLowerCase();
  if (email) {
    const local = email.toLowerCase().split('@')[0].replace(/[._-]+/g, ' ');
    const d = designers.find((x) => x.name.toLowerCase() === local || x.name.toLowerCase().replace(/\s+/g, ' ') === local);
    if (d) return { designer: d, how: 'email' };
  }
  if (!n) return {};
  const exact = designers.find((x) => x.name.toLowerCase() === n);
  if (exact) return { designer: exact, how: 'name' };
  const first = designers.filter((x) => x.name.toLowerCase().split(' ')[0] === n.split(/[\s.]/)[0]);
  if (first.length === 1) return { designer: first[0], how: 'first name' };
  return {};
}

export interface PlannedRow {
  item: ExternalItem;
  action: 'create' | 'update';
  /** Existing project when updating. */
  existing?: Project;
  matchedBy?: 'external id' | 'ticket' | 'name';
  designer: DesignerMatch;
  project: Partial<Project>;
  schedule: Partial<Schedule>;
  warnings: string[];
}

export interface PlanContext {
  projects: Project[];
  designers: Designer[];
  config: WorkspaceConfig;
  quarterStartAbs: number;
}

/** Decide, for each item, whether it creates or updates a project and what fields change. */
export function planImport(items: ExternalItem[], ctx: PlanContext): PlannedRow[] {
  const byExternal = new Map(ctx.projects.filter((p) => p.external).map((p) => [`${p.external!.source}:${p.external!.id}`.toLowerCase(), p]));
  const byTicket = new Map(ctx.projects.filter((p) => p.ticket).map((p) => [p.ticket.toLowerCase(), p]));
  const byName = new Map(ctx.projects.map((p) => [p.name.trim().toLowerCase(), p]));
  const seen = new Set<string>();

  return items.map((item) => {
    const warnings: string[] = [];
    let existing: Project | undefined;
    let matchedBy: PlannedRow['matchedBy'];
    if (item.externalId) {
      existing = byExternal.get(`${item.source}:${item.externalId}`.toLowerCase());
      if (existing) matchedBy = 'external id';
      else if ((existing = byTicket.get(item.externalId.toLowerCase()))) matchedBy = 'ticket';
    }
    if (!existing && (existing = byName.get(item.title.trim().toLowerCase()))) matchedBy = 'name';
    const dupKey = (item.externalId ?? item.title).toLowerCase();
    if (seen.has(dupKey)) warnings.push('Appears more than once in this import');
    seen.add(dupKey);

    const designer = matchDesigner(ctx.designers, item.assignee, item.assigneeEmail);
    if ((item.assignee || item.assigneeEmail) && !designer.designer) warnings.push(`“${item.assignee ?? item.assigneeEmail}” isn’t on the team, so this goes to the backlog`);

    const project: Partial<Project> = {};
    if (!existing || existing.name !== item.title) project.name = item.title;
    const priority = normalizePriority(item.priority);
    if (priority) project.priority = priority;
    const size = normalizeSize(item.size);
    if (size) project.size = size;
    const wt = item.workType && ctx.config.workTypes.find((w) => w.toLowerCase() === item.workType!.toLowerCase());
    if (wt) project.workType = wt;
    if (item.externalId) project.ticket = item.externalId;
    if (item.url) project.reference = item.url;
    if (item.area) project.productArea = item.area;
    if (item.pm) project.pm = item.pm;
    if (item.em) project.em = item.em;
    if (item.goal) project.goal = item.goal;
    if (item.notes) project.notes = item.notes;
    if (item.source !== 'paste' && item.source !== 'sheet' && item.externalId) project.external = { source: item.source, id: item.externalId, url: item.url, syncedAt: Date.now() };

    const schedule: Partial<Schedule> = {};
    if (designer.designer) schedule.designerId = designer.designer.id;
    const phase = normalizePhase(item.status, ctx.config.phases);
    if (phase) schedule.phase = phase;
    if (item.allocation) schedule.allocation = Math.max(5, Math.min(100, item.allocation));
    if (item.durationWeeks) schedule.duration = Math.max(1, Math.round(item.durationWeeks));
    const start = parseDate(item.start);
    const due = parseDate(item.due);
    if (start) schedule.startWeek = utcToAbsWeek(start) - ctx.quarterStartAbs;
    if (due) {
      const dueWeek = utcToAbsWeek(due) - ctx.quarterStartAbs;
      if (start) schedule.duration = Math.max(1, dueWeek - schedule.startWeek! + 1);
      else {
        // Only a due date: size the work the usual way and end it on the due week.
        const wtype = project.workType ?? existing?.workType ?? ctx.config.workTypes[0] ?? 'Design';
        schedule.duration ??= recommendedDuration(wtype, project.size ?? existing?.size ?? 'M', schedule.allocation ?? defaultAllocation(wtype));
        schedule.startWeek = dueWeek - schedule.duration + 1;
      }
      if (dueWeek < 0 || dueWeek > WEEKS_PER_QUARTER * 2) warnings.push('Due date is far outside this quarter');
    }

    return { item, action: existing ? 'update' : 'create', existing, matchedBy, designer, project, schedule, warnings };
  });
}

/** Example rows for the "try an example" buttons and docs. */
export const SAMPLES: Record<string, { label: string; text: string; filename?: string }> = {
  quick: {
    label: 'Quick-add lines',
    text: ['Checkout redesign @Maya !P0 ~L #Checkout', 'Search filters v2 @Jordan !P1 6w 50%', 'Empty states audit ~S', 'https://acme.atlassian.net/browse/DSN-142 Pricing page experiment'].join('\n'),
  },
  sheet: {
    label: 'Spreadsheet (TSV)',
    text: ['Name\tDesigner\tSize\tPriority\tArea\tDue', 'Mobile nav audit\tSam\tM\tP2\tMobile\t2026-12-18', 'Notifications center\tJordan\tL\tP1\tPlatform\t', 'Pricing page refresh\t\tS\tP2\tGrowth\t'].join('\n'),
  },
  jira: {
    label: 'Jira CSV export',
    filename: 'jira.csv',
    text: ['Issue key,Summary,Assignee,Priority,Status,Custom field (Story Points),Due date,Component/s', 'DSN-201,Saved payment methods,Maya Chen,High,In Progress,5,2026-12-11,Checkout', 'DSN-202,Admin console IA,,Medium,To Do,8,,Platform', 'DSN-203,Typeahead suggestions,Jordan Lee,Highest,In Review,3,2026-11-27,Search'].join('\n'),
  },
  asana: {
    label: 'Asana JSON',
    filename: 'asana.json',
    text: JSON.stringify({ data: [
      { gid: '120001', name: 'Workspace templates', assignee: { name: 'Sam Rivera' }, due_on: '2026-12-04', start_on: '2026-11-02', permalink_url: 'https://app.asana.com/0/1/120001', notes: 'From onboarding roadmap' },
      { gid: '120002', name: 'Invite teammates flow', assignee: null, due_on: null, completed: false },
    ] }, null, 2),
  },
  servicenow: {
    label: 'ServiceNow JSON',
    filename: 'servicenow.json',
    text: JSON.stringify({ result: [
      { number: 'DMND0001042', short_description: 'Self-service SSO setup', assigned_to: { display_value: 'Jordan Lee' }, priority: '2 - High', state: 'Work in Progress', assignment_group: { display_value: 'Platform Design' } },
      { number: 'DMND0001043', short_description: 'Audit log viewer', assigned_to: '', priority: '4 - Low', state: 'New' },
    ] }, null, 2),
  },
};

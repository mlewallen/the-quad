import { useCallback, useEffect, useMemo, useState } from 'react';
import { planKey, useStore } from './store';
import type { Designer, ID, Plan, Project, Schedule } from './types';
import { WEEKS_PER_QUARTER } from './types';
import { computeLoad, type Entry, type WeekLoad } from './lib/capacity';
import { quarterStartAbsWeek } from './lib/quarters';
import { currentPhase, weeksIntoSchedule } from './lib/sizing';

export function useWorkspace() {
  const workspaces = useStore((s) => s.workspaces);
  const id = useStore((s) => s.activeWorkspaceId);
  return workspaces.find((w) => w.id === id);
}

export function useDesigners(): Designer[] {
  return useWorkspace()?.designers ?? EMPTY;
}
const EMPTY: never[] = [];

export function useDesignerMap(): Record<ID, Designer> {
  const designers = useDesigners();
  return useMemo(() => Object.fromEntries(designers.map((d) => [d.id, d])), [designers]);
}

export function useQuarterPlans(): Plan[] {
  const plans = useStore((s) => s.plans);
  const ws = useStore((s) => s.activeWorkspaceId);
  const q = useStore((s) => s.currentQuarter);
  return useMemo(() => plans.filter((p) => p.workspaceId === ws && p.quarter === q).sort((a, b) => a.createdAt - b.createdAt), [plans, ws, q]);
}

export function useActivePlan(): Plan | undefined {
  const plans = useQuarterPlans();
  const activePlan = useStore((s) => s.activePlan);
  const ws = useStore((s) => s.activeWorkspaceId);
  const q = useStore((s) => s.currentQuarter);
  return plans.find((p) => ws && p.id === activePlan[planKey(ws, q)]) ?? plans[0];
}

export function useQuarterProjects(): Project[] {
  const projects = useStore((s) => s.projects);
  const ws = useStore((s) => s.activeWorkspaceId);
  const q = useStore((s) => s.currentQuarter);
  return useMemo(() => projects.filter((p) => p.workspaceId === ws && p.quarter === q), [projects, ws, q]);
}

export function entriesFor(projects: Project[], plan: Plan | undefined): Entry[] {
  if (!plan) return [];
  return projects.filter((p) => plan.schedules[p.id]).map((project) => ({ project, schedule: plan.schedules[project.id] }));
}

/** Current quarter's projects joined to the active plan's schedules. */
export function useEntries(): Entry[] {
  const projects = useQuarterProjects();
  const plan = useActivePlan();
  return useMemo(() => entriesFor(projects, plan), [projects, plan]);
}

export interface ProjectPlan {
  project: Project;
  schedule: Schedule;
  /** The plan the schedule lives in; undefined for an unscheduled project's draft. */
  planId?: ID;
  /** Absolute start week, or null for unscheduled work (no dates yet). */
  startAbs: number | null;
  update: (patch: Partial<Schedule>) => void;
}

/**
 * A project's plan wherever it lives: the active plan of its own quarter (this
 * quarter or a later one), or its draft while it's unscheduled in the backlog.
 */
export function useProjectPlan(projectId: ID | null | undefined): ProjectPlan | undefined {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const plans = useStore((s) => s.plans);
  const activePlan = useStore((s) => s.activePlan);
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const { updateSchedule, updateDraft } = useStore.getState();
  return useMemo(() => {
    if (!project) return undefined;
    if (project.quarter == null) {
      if (!project.draft) return undefined;
      return { project, schedule: project.draft, startAbs: null, update: (patch) => updateDraft(project.id, patch) };
    }
    const q = project.quarter;
    const own = plans.filter((p) => p.workspaceId === project.workspaceId && p.quarter === q);
    const plan = own.find((p) => p.id === activePlan[planKey(project.workspaceId, q)]) ?? own[0];
    const schedule = plan?.schedules[project.id];
    if (!plan || !schedule) return undefined;
    return { project, schedule, planId: plan.id, startAbs: quarterStartAbsWeek(q, sm) + schedule.startWeek, update: (patch) => updateSchedule(project.id, patch, plan.id) };
  }, [project, plans, activePlan, sm, updateSchedule, updateDraft]);
}

/** Open a project's full planning page (works for any quarter, and for unscheduled backlog work). */
export function openProjectPage(id: ID) {
  navigate({ project: id, page: true, settings: null });
}

export function useEntry(projectId: ID | null | undefined): { project: Project; schedule: Schedule } | undefined {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const plan = useActivePlan();
  if (!project || !plan?.schedules[project.id]) return undefined;
  return { project, schedule: plan.schedules[project.id] };
}

/**
 * All of the workspace's scheduled work, every quarter, each via that
 * quarter's active plan — the current quarter uses the active plan.
 */
export function useWorkspaceEntries(): Entry[] {
  const projects = useStore((s) => s.projects);
  const plans = useStore((s) => s.plans);
  const activePlan = useStore((s) => s.activePlan);
  const ws = useStore((s) => s.activeWorkspaceId);
  return useMemo(() => {
    if (!ws) return [];
    const byQuarter = new Map<number, Plan>();
    for (const p of plans) {
      if (p.workspaceId !== ws) continue;
      const cur = byQuarter.get(p.quarter);
      if (activePlan[planKey(ws, p.quarter)] === p.id || !cur) byQuarter.set(p.quarter, p);
    }
    const out: Entry[] = [];
    for (const project of projects) {
      if (project.workspaceId !== ws || project.quarter == null) continue;
      const sched = byQuarter.get(project.quarter)?.schedules[project.id];
      if (sched) out.push({ project, schedule: sched });
    }
    return out;
  }, [projects, plans, activePlan, ws]);
}

export function useQuarterStart(): number {
  const q = useStore((s) => s.currentQuarter);
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  return quarterStartAbsWeek(q, sm);
}

export function useWorkspaceDisruptions() {
  const all = useStore((s) => s.disruptions);
  const ws = useStore((s) => s.activeWorkspaceId);
  return useMemo(() => all.filter((d) => d.workspaceId === ws), [all, ws]);
}

/**
 * Resolves each entry's current phase: its manual override, or where today
 * falls in the schedule's phase breakdown.
 */
export function usePhase(): (e: { project: Project; schedule: Schedule }) => string {
  const phases = useWorkspace()?.config.phases ?? EMPTY;
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  return useCallback((e) => currentPhase(phases, e.schedule, weeksIntoSchedule(e.project, e.schedule, sm)), [phases, sm]);
}

/** Per-designer weekly load over a window relative to the quarter start. */
export function useLoad(weeksBefore = 0, weeksAfter = 0): { load: Record<ID, WeekLoad[]>; fromAbs: number; n: number } {
  const entries = useWorkspaceEntries();
  const disruptions = useWorkspaceDisruptions();
  const designers = useDesigners();
  const qStart = useQuarterStart();
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const fromAbs = qStart - weeksBefore;
  const n = WEEKS_PER_QUARTER + weeksBefore + weeksAfter;
  const load = useMemo(
    () => computeLoad(entries, disruptions, designers.map((d) => d.id), fromAbs, n, sm),
    [entries, disruptions, designers, fromAbs, n, sm],
  );
  return { load, fromAbs, n };
}

/* ---------- Hash routing ---------- */

export type View = 'home' | 'gantt' | 'team' | 'projects' | 'disruptions' | 'backlog' | 'designer';
/** Views shown in the sidebar nav; 'designer' is reached per person. */
export type NavView = Exclude<View, 'designer'>;
export const VIEWS: { id: NavView; label: string; description: string; keywords?: string }[] = [
  { id: 'home', label: 'Home', description: 'Plan readiness, next steps and team load at a glance' },
  { id: 'gantt', label: 'Gantt', description: 'Drag to schedule, resize to change duration' },
  { id: 'team', label: 'Team', description: 'Each designer’s load, projects and allocation', keywords: 'allocation focus load people' },
  { id: 'projects', label: 'Projects', description: 'Every project this quarter, bulk-editable', keywords: 'manage table list' },
  { id: 'disruptions', label: 'Disruptions', description: 'PTO, on-call and other non-project time' },
  { id: 'backlog', label: 'Backlog', description: 'Unassigned, unscheduled and future work, plus the auto-balancer', keywords: 'ideas requests later unscheduled' },
];

/** Views that were merged or renamed; their old hash routes still resolve. */
const VIEW_ALIASES: Record<string, NavView> = { focus: 'team', allocation: 'team', manage: 'projects' };

function resolveView(id: string | null | undefined): View | undefined {
  if (!id) return undefined;
  if (id === 'designer') return 'designer';
  return VIEWS.find((v) => v.id === id)?.id ?? VIEW_ALIASES[id];
}

/** True when the hash uses a retired view name and should be rewritten to the canonical route. */
export function isLegacyHash(hash: string): boolean {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const from = new URLSearchParams(query).get('from');
  return path.split('/')[0] in VIEW_ALIASES || (!!from && from in VIEW_ALIASES);
}

export interface Route {
  view: View;
  /** Open project detail (panel/modal), or the full-page project. */
  project: ID | null;
  page: boolean;
  settings: string | null;
  /** Designer id for the personal designer view. */
  designer: ID | null;
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'project' && parts[1]) {
    return { view: resolveView(params.get('from')) ?? 'gantt', project: parts[1], page: true, settings: null, designer: params.get('d') };
  }
  if (parts[0] === 'designer' && parts[1]) {
    return { view: 'designer', project: params.get('p'), page: false, settings: params.get('settings'), designer: parts[1] };
  }
  const found = resolveView(parts[0]);
  const view = found && found !== 'designer' ? found : 'gantt';
  return { view, project: params.get('p'), page: false, settings: params.get('settings'), designer: null };
}

export function buildHash(r: Route): string {
  if (r.page && r.project) return `#/project/${r.project}?from=${r.view}${r.view === 'designer' && r.designer ? `&d=${r.designer}` : ''}`;
  const params = new URLSearchParams();
  if (r.project) params.set('p', r.project);
  if (r.settings) params.set('settings', r.settings);
  const q = params.toString();
  const path = r.view === 'designer' && r.designer ? `designer/${r.designer}` : r.view === 'designer' ? 'home' : r.view;
  return `#/${path}${q ? `?${q}` : ''}`;
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      // Old bookmarks (#/focus, #/allocation, #/manage) land on the view that replaced them.
      if (isLegacyHash(window.location.hash)) history.replaceState(null, '', buildHash(parseHash(window.location.hash)));
      setHash(window.location.hash);
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return useMemo(() => parseHash(hash), [hash]);
}

export function navigate(patch: Partial<Route>, replace = false) {
  const next = buildHash({ ...parseHash(window.location.hash), ...patch });
  if (next === window.location.hash) return;
  if (replace) {
    history.replaceState(null, '', next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else window.location.hash = next;
}

export function openProject(id: ID) {
  const mode = useStore.getState().settings.detailMode;
  navigate({ project: id, page: mode === 'page', settings: null });
}

export function openDesigner(id: ID) {
  navigate({ view: 'designer', designer: id, project: null, page: false, settings: null });
}

export function closeProject() {
  navigate({ project: null, page: false });
}

/** Phone layout breakpoint. Kept in sync with the `@media (max-width: 720px)` block in styles.css. */
export const MOBILE_QUERY = '(max-width: 720px)';

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

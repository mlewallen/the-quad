import { useEffect, useMemo, useState } from 'react';
import { planKey, useStore } from './store';
import type { Designer, ID, Plan, Project, Schedule } from './types';
import { WEEKS_PER_QUARTER } from './types';
import { computeLoad, type Entry, type WeekLoad } from './lib/capacity';
import { quarterStartAbsWeek } from './lib/quarters';

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
      if (project.workspaceId !== ws) continue;
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

export type View = 'home' | 'gantt' | 'allocation' | 'disruptions' | 'focus' | 'manage' | 'backlog';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'gantt', label: 'Gantt' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'disruptions', label: 'Disruptions' },
  { id: 'focus', label: 'Focus' },
  { id: 'manage', label: 'Manage' },
  { id: 'backlog', label: 'Backlog' },
];

export interface Route {
  view: View;
  /** Open project detail (panel/modal), or the full-page project. */
  project: ID | null;
  page: boolean;
  settings: string | null;
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'project' && parts[1]) {
    return { view: (params.get('from') as View) || 'gantt', project: parts[1], page: true, settings: null };
  }
  const view = (VIEWS.find((v) => v.id === parts[0])?.id ?? 'gantt') as View;
  return { view, project: params.get('p'), page: false, settings: params.get('settings') };
}

export function buildHash(r: Route): string {
  if (r.page && r.project) return `#/project/${r.project}?from=${r.view}`;
  const params = new URLSearchParams();
  if (r.project) params.set('p', r.project);
  if (r.settings) params.set('settings', r.settings);
  const q = params.toString();
  return `#/${r.view}${q ? `?${q}` : ''}`;
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
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

export function closeProject() {
  navigate({ project: null, page: false });
}

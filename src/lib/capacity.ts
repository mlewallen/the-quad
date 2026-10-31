import type { Disruption, ID, Project, Schedule } from '../types';
import { weeklyAllocation } from './curves';
import { quarterStartAbsWeek } from './quarters';

/** A pair designer is counted at this share of the primary's weekly allocation. */
export const PAIR_SHARE = 0.5;

export interface Entry {
  project: Project;
  schedule: Schedule;
}

export interface LoadItem {
  kind: 'project' | 'disruption';
  id: ID;
  pct: number;
}

export interface WeekLoad {
  absWeek: number;
  total: number;
  projects: number;
  disruptions: number;
  items: LoadItem[];
}

export type LoadLevel = 'idle' | 'ok' | 'warn' | 'over';

export function loadLevel(pct: number): LoadLevel {
  if (pct <= 0.5) return 'idle';
  if (pct <= 85) return 'ok';
  if (pct <= 100.5) return 'warn';
  return 'over';
}

export function absStart(entry: Entry, startMonth: number): number {
  return quarterStartAbsWeek(entry.project.quarter, startMonth) + entry.schedule.startWeek;
}

/** Weekly load for each designer over [fromAbs, fromAbs + n). */
export function computeLoad(
  entries: Entry[],
  disruptions: Disruption[],
  designerIds: ID[],
  fromAbs: number,
  n: number,
  startMonth: number,
): Record<ID, WeekLoad[]> {
  const out: Record<ID, WeekLoad[]> = {};
  for (const id of designerIds) {
    out[id] = Array.from({ length: n }, (_, i) => ({
      absWeek: fromAbs + i,
      total: 0,
      projects: 0,
      disruptions: 0,
      items: [],
    }));
  }
  const add = (designer: ID, abs: number, pct: number, item: Omit<LoadItem, 'pct'>, kind: 'projects' | 'disruptions') => {
    const row = out[designer];
    const i = abs - fromAbs;
    if (!row || i < 0 || i >= n || pct <= 0) return;
    row[i].total += pct;
    row[i][kind] += pct;
    row[i].items.push({ ...item, pct });
  };

  for (const e of entries) {
    const s = e.schedule;
    if (!s.designerId) continue;
    const start = absStart(e, startMonth);
    const weekly = weeklyAllocation(s.curve, s.duration, s.allocation);
    weekly.forEach((pct, i) => {
      add(s.designerId!, start + i, pct, { kind: 'project', id: e.project.id }, 'projects');
      if (s.pairDesignerId && s.pairDesignerId !== s.designerId) {
        add(s.pairDesignerId, start + i, pct * PAIR_SHARE, { kind: 'project', id: e.project.id }, 'projects');
      }
    });
  }
  for (const d of disruptions) {
    const weekly = weeklyAllocation(d.curve, d.duration, d.allocation);
    for (const designer of d.designerIds) {
      weekly.forEach((pct, i) => add(designer, d.startAbsWeek + i, pct, { kind: 'disruption', id: d.id }, 'disruptions'));
    }
  }
  return out;
}

export function summarize(weeks: WeekLoad[]) {
  const totals = weeks.map((w) => w.total);
  const peak = totals.length ? Math.max(...totals) : 0;
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const over = totals.filter((t) => t > 100.5).length;
  return { peak, avg, over };
}

/** Weekly load for one designer, ignoring a given project — used to show "what else is going on". */
export function loadExcluding(weeks: WeekLoad[], projectId: ID): number[] {
  return weeks.map((w) => w.items.filter((it) => !(it.kind === 'project' && it.id === projectId)).reduce((a, it) => a + it.pct, 0));
}

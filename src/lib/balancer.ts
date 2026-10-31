import type { Designer, ID, Priority, Project, Schedule } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { weeklyAllocation } from './curves';
import { effortFor } from './sizing';

export type Strategy = 'even' | 'priority' | 'conflict';

export const STRATEGY_LABELS: Record<Strategy, { name: string; blurb: string }> = {
  even: { name: 'Even load', blurb: 'Spread work so no one designer peaks far above the rest.' },
  priority: { name: 'Priority first', blurb: 'Place P0/P1 work first and as early as it fits without overload.' },
  conflict: { name: 'Minimize conflicts', blurb: 'Avoid weeks over 100% above all else.' },
};

export interface Suggestion {
  projectId: ID;
  designerId: ID;
  startWeek: number;
  peak: number;
  overWeeks: number;
  reasoning: string;
}

const PRI_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Greedy placement. `baseLoad` is each designer's existing weekly load over
 * the quarter (weeks 0..12, plus spill weeks after). Every project is tried
 * at every start week for every designer; the best placement by strategy is
 * kept and its load is folded in before placing the next project.
 */
export function balance(
  items: { project: Project; schedule: Schedule }[],
  designers: Designer[],
  baseLoad: Record<ID, number[]>,
  strategy: Strategy,
): Suggestion[] {
  if (!designers.length) return [];
  const horizon = Math.max(WEEKS_PER_QUARTER, ...items.map((i) => i.schedule.duration)) + WEEKS_PER_QUARTER;
  const load: Record<ID, number[]> = {};
  for (const d of designers) {
    const base = baseLoad[d.id] ?? [];
    load[d.id] = Array.from({ length: horizon }, (_, i) => base[i] ?? 0);
  }

  const order = items.slice().sort((a, b) => {
    const ea = effortFor(a.project.workType, a.project.size);
    const eb = effortFor(b.project.workType, b.project.size);
    if (strategy === 'priority') {
      const pa = PRI_RANK[a.project.priority] - PRI_RANK[b.project.priority];
      if (pa) return pa;
    }
    return eb - ea;
  });

  const out: Suggestion[] = [];
  for (const { project, schedule } of order) {
    const weekly = weeklyAllocation(schedule.curve, schedule.duration, schedule.allocation);
    const lastStart = Math.max(0, WEEKS_PER_QUARTER - schedule.duration);
    let best: { score: number; designer: Designer; start: number; peak: number; over: number; avg: number } | null = null;

    for (const d of designers) {
      const row = load[d.id];
      const avg = row.slice(0, WEEKS_PER_QUARTER).reduce((a, b) => a + b, 0) / WEEKS_PER_QUARTER;
      for (let start = 0; start <= lastStart; start++) {
        let peak = 0;
        let over = 0;
        for (let i = 0; i < weekly.length; i++) {
          const v = row[start + i] + weekly[i];
          if (v > peak) peak = v;
          if (v > 100.5) over++;
        }
        let score: number;
        if (strategy === 'conflict') score = over * 10_000 + peak * 10 + avg + start * 0.01;
        else if (strategy === 'priority') score = (peak > 100.5 ? 10_000 + peak * 10 : 0) + start * 100 + avg + peak * 0.1;
        else score = peak * 10 + avg + start * 0.01;
        if (!best || score < best.score) best = { score, designer: d, start, peak, over, avg };
      }
    }
    if (!best) continue;
    weekly.forEach((v, i) => (load[best!.designer.id][best!.start + i] += v));
    out.push({
      projectId: project.id,
      designerId: best.designer.id,
      startWeek: best.start,
      peak: Math.round(best.peak),
      overWeeks: best.over,
      reasoning: explain(strategy, project, best),
    });
  }
  return out;
}

function explain(
  strategy: Strategy,
  project: Project,
  b: { designer: Designer; start: number; peak: number; over: number; avg: number },
): string {
  const who = b.designer.name;
  const wk = `week ${b.start + 1}`;
  const peak = `${Math.round(b.peak)}% peak`;
  const avg = `${Math.round(b.avg)}% avg load before this`;
  const overNote = b.over ? ` Still ${b.over} week${b.over > 1 ? 's' : ''} over capacity — no better slot exists.` : '';
  switch (strategy) {
    case 'priority':
      return `${project.priority} placed early: ${who} can start ${wk} at ${peak} (${avg}).${overNote}`;
    case 'conflict':
      return `${who} from ${wk} adds ${b.over ? b.over : 'no'} overloaded weeks; ${peak}.${overNote}`;
    default:
      return `${who} has the most room (${avg}); starting ${wk} keeps them at ${peak}.${overNote}`;
  }
}

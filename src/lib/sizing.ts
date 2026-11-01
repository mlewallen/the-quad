import type { Curve, Project, Schedule, Size } from '../types';
import { effortWeeks } from './curves';
import { absWeekToUtc, quarterStartAbsWeek } from './quarters';

/**
 * Expected full-time effort weeks per work type at each size.
 * Unknown (custom) work types fall back to the Design profile.
 */
export const SIZE_PROFILES: Record<string, Record<Size, number>> = {
  Design: { S: 2, M: 4, L: 7, XL: 10 },
  Consult: { S: 1, M: 2, L: 3, XL: 5 },
  Monitor: { S: 0.5, M: 1, L: 1.5, XL: 2 },
};

export const DEFAULT_ALLOCATION: Record<string, number> = {
  Design: 50,
  Consult: 25,
  Monitor: 10,
};

export function profileFor(workType: string): Record<Size, number> {
  return SIZE_PROFILES[workType] ?? SIZE_PROFILES.Design;
}

export function defaultAllocation(workType: string): number {
  return DEFAULT_ALLOCATION[workType] ?? 50;
}

export function effortFor(workType: string, size: Size): number {
  return profileFor(workType)[size];
}

/** Calendar weeks = effort weeks ÷ allocation fraction. */
export function recommendedDuration(workType: string, size: Size, allocationPct: number): number {
  const frac = Math.max(0.05, allocationPct / 100);
  return Math.max(1, Math.ceil(effortFor(workType, size) / frac - 1e-9));
}

/**
 * Rough phase breakdown across a duration, using the workspace's phase list.
 * Earlier "thinking" phases get a little more time than later support phases.
 */
export function phaseBreakdown(phases: string[], duration: number): { phase: string; start: number; weeks: number }[] {
  if (!phases.length || duration <= 0) return [];
  const weights = phases.map((_, i) => (i === phases.length - 1 ? 0.6 : i === 0 ? 1 : 1.2));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return phases.map((phase, i) => {
    const weeks = (weights[i] / total) * duration;
    const seg = { phase, start: cursor, weeks };
    cursor += weeks;
    return seg;
  });
}

/**
 * Like recommendedDuration, but for a shaped curve: the shortest duration whose
 * curve delivers the expected effort (a bell or ramp delivers less per week than flat).
 */
export function recommendedDurationForCurve(workType: string, size: Size, allocationPct: number, curve: Curve): number {
  const flat = recommendedDuration(workType, size, allocationPct);
  if (curve.shape === 'flat') return flat;
  const target = effortFor(workType, size);
  for (let d = flat; d < flat * 3 + 4; d++) if (effortWeeks(curve, d, allocationPct) >= target - 1e-6) return d;
  return flat;
}

/**
 * The phase a project is in `weeksIn` weeks after it starts, read off
 * phaseBreakdown. Before the start it's the first phase; after the end, the last.
 */
export function phaseAt(phases: string[], duration: number, weeksIn: number): string {
  const segs = phaseBreakdown(phases, duration);
  if (!segs.length) return '';
  if (weeksIn < 0) return segs[0].phase;
  return segs.find((s) => weeksIn < s.start + s.weeks)?.phase ?? segs[segs.length - 1].phase;
}

/** The phase to show for a schedule: a manual override wins, otherwise it follows the schedule. */
export function currentPhase(phases: string[], s: Pick<Schedule, 'duration' | 'phaseOverride'>, weeksIn: number): string {
  return s.phaseOverride || phaseAt(phases, s.duration, weeksIn);
}

const WEEK_MS = 7 * 86_400_000;

/** Weeks elapsed (fractional) between a schedule's start and `now`. */
export function weeksIntoSchedule(project: Pick<Project, 'quarter'>, s: Pick<Schedule, 'startWeek'>, startMonth: number, now = Date.now()): number {
  if (project.quarter == null) return -1; // unscheduled work hasn't started
  return (now - absWeekToUtc(quarterStartAbsWeek(project.quarter, startMonth) + s.startWeek)) / WEEK_MS;
}

/**
 * How many weeks the design schedule runs past the GA target: positive means
 * design is still going after GA, zero or less is on time, null if no target.
 */
export function gaSlipWeeks(project: Pick<Project, 'quarter' | 'gaTargetWeek'>, s: Pick<Schedule, 'startWeek' | 'duration'>, startMonth: number): number | null {
  if (project.gaTargetWeek == null || project.quarter == null) return null;
  const designEnd = quarterStartAbsWeek(project.quarter, startMonth) + s.startWeek + s.duration - 1;
  return designEnd - project.gaTargetWeek;
}

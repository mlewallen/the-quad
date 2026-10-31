import type { Curve, Size } from '../types';
import { effortWeeks } from './curves';

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

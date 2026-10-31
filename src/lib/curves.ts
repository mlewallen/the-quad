import type { Curve, CurveShape } from '../types';

export const CURVE_LABELS: Record<CurveShape, string> = {
  flat: 'Flat',
  front: 'Front-loaded',
  back: 'Back-loaded',
  bell: 'Bell curve',
  custom: 'Custom',
};

/** Shape factors (0..1, fraction of max allocation) for each week. */
export function shapeFactors(shape: CurveShape, n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    switch (shape) {
      case 'front':
        out.push(1 - 0.7 * t);
        break;
      case 'back':
        out.push(0.3 + 0.7 * t);
        break;
      case 'bell':
        out.push(0.25 + 0.75 * Math.sin(Math.PI * t));
        break;
      default:
        out.push(1);
    }
  }
  return out;
}

/** Linearly resample a custom curve to a new length so its shape is preserved. */
export function resample(values: number[], n: number): number[] {
  if (n <= 0) return [];
  if (values.length === 0) return Array(n).fill(1);
  if (values.length === n) return values.slice();
  if (values.length === 1) return Array(n).fill(values[0]);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i / (n - 1)) * (values.length - 1);
    const lo = Math.floor(x);
    const hi = Math.min(values.length - 1, lo + 1);
    const f = x - lo;
    out.push(values[lo] * (1 - f) + values[hi] * f);
  }
  return out;
}

export function curveFactors(curve: Curve, n: number): number[] {
  if (curve.shape === 'custom' && curve.values?.length) return resample(curve.values, n);
  return shapeFactors(curve.shape, n);
}

/** Weekly allocation percentages for a run of `duration` weeks peaking at `max`. */
export function weeklyAllocation(curve: Curve, duration: number, max: number): number[] {
  return curveFactors(curve, duration).map((f) => Math.round(f * max * 10) / 10);
}

/** Total effort in "full-time weeks" represented by a schedule. */
export function effortWeeks(curve: Curve, duration: number, max: number): number {
  return weeklyAllocation(curve, duration, max).reduce((a, b) => a + b, 0) / 100;
}

import { WEEKS_PER_QUARTER } from '../types';

/**
 * Quarters are identified by an integer index: fiscalYear * 4 + (q - 1).
 * A fiscal year is named for the calendar year in which it ends, so with a
 * February start, FY27 Q1 begins in February 2026. Each fiscal year is
 * anchored to the Monday on/before the 1st of its start month, and each
 * quarter is exactly 13 weeks from there.
 *
 * Absolute weeks count Mondays since 1970-01-05, which lets disruptions and
 * cross-quarter load line up regardless of which quarter is being viewed.
 */

const DAY = 86_400_000;
const EPOCH_MONDAY = Date.UTC(1970, 0, 5);

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function mondayOnOrBefore(utc: number): number {
  const dow = (new Date(utc).getUTCDay() + 6) % 7; // 0 = Monday
  return utc - dow * DAY;
}

export function fiscalYearStart(fy: number, startMonth: number): number {
  const calYear = startMonth === 0 ? fy : fy - 1;
  return mondayOnOrBefore(Date.UTC(calYear, startMonth, 1));
}

export function quarterParts(q: number) {
  return { fy: Math.floor(q / 4), q: (q % 4) + 1 };
}

export function quarterLabel(q: number): string {
  const p = quarterParts(q);
  return `FY${String(p.fy).slice(-2)} Q${p.q}`;
}

export function quarterStartUtc(q: number, startMonth: number): number {
  const p = quarterParts(q);
  return fiscalYearStart(p.fy, startMonth) + (p.q - 1) * WEEKS_PER_QUARTER * 7 * DAY;
}

export function quarterStartAbsWeek(q: number, startMonth: number): number {
  return Math.round((quarterStartUtc(q, startMonth) - EPOCH_MONDAY) / (7 * DAY));
}

export function absWeekToUtc(absWeek: number): number {
  return EPOCH_MONDAY + absWeek * 7 * DAY;
}

export function utcToAbsWeek(utc: number): number {
  return Math.floor((mondayOnOrBefore(utc) - EPOCH_MONDAY) / (7 * DAY));
}

export function quarterForDate(utc: number, startMonth: number): number {
  const d = new Date(utc);
  let fy = startMonth === 0 ? d.getUTCFullYear() : d.getUTCFullYear() + (d.getUTCMonth() >= startMonth ? 1 : 0);
  // Edge: FY starts are anchored to a Monday, which can fall a few days either side of the 1st.
  if (utc < fiscalYearStart(fy, startMonth)) fy -= 1;
  else if (utc >= fiscalYearStart(fy + 1, startMonth)) fy += 1;
  const weeks = Math.floor((utc - fiscalYearStart(fy, startMonth)) / (7 * DAY));
  return fy * 4 + Math.min(3, Math.floor(weeks / WEEKS_PER_QUARTER));
}

export function currentQuarter(startMonth: number): number {
  return quarterForDate(Date.now(), startMonth);
}

const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function formatDate(utc: number, withYear = false): string {
  return (withYear ? fmtY : fmt).format(new Date(utc));
}

export function formatAbsWeek(absWeek: number, withYear = false) {
  return formatDate(absWeekToUtc(absWeek), withYear);
}

/** Inclusive calendar range for a run of weeks: Monday of first to Friday of last. */
export function formatWeekRange(startAbs: number, duration: number): string {
  const start = absWeekToUtc(startAbs);
  const end = absWeekToUtc(startAbs + Math.max(1, duration) - 1) + 4 * DAY;
  return `${formatDate(start)} – ${formatDate(end, true)}`;
}

export function dateInputValue(absWeek: number): string {
  return new Date(absWeekToUtc(absWeek)).toISOString().slice(0, 10);
}

export function absWeekFromInput(value: string): number | null {
  const t = Date.parse(value + 'T00:00:00Z');
  return Number.isNaN(t) ? null : utcToAbsWeek(t);
}

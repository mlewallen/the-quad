import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';
import { absWeekToUtc, formatAbsWeek, MONTHS, quarterForDate, quarterLabel, quarterStartAbsWeek, utcToAbsWeek } from '../lib/quarters';
import { Popover } from './Popover';

const DAY = 86_400_000;
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Week-granular date picker. Everything in the planner snaps to Monday-start
 * weeks, so the calendar selects whole rows rather than single days; the left
 * column shows each week's number within its fiscal quarter.
 */
export function WeekPicker({
  value, onChange, min, max, label, size, ariaLabel,
}: {
  value: number;
  onChange: (absWeek: number) => void;
  min?: number;
  max?: number;
  /** Trigger text; defaults to "Week of <date>". */
  label?: string;
  size?: 'sm';
  ariaLabel?: string;
}) {
  return (
    <Popover
      width={292}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`select week-trigger ${size ?? ''} ${open ? 'open' : ''}`}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel}: ${label ?? formatAbsWeek(value, true)}` : undefined}
        >
          <CalendarDays size={size ? 13 : 14} className="week-trigger-icon" />
          <span className="ellipsis">{label ?? `Week of ${formatAbsWeek(value, true)}`}</span>
        </button>
      )}
    >
      {(close) => <Calendar value={value} min={min} max={max} onPick={(w) => { onChange(w); close(); }} />}
    </Popover>
  );
}

function monthOf(absWeek: number) {
  const d = new Date(absWeekToUtc(absWeek) + 3 * DAY); // Thursday decides which month a week belongs to
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}

function Calendar({ value, min, max, onPick }: { value: number; min?: number; max?: number; onPick: (w: number) => void }) {
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const [view, setView] = useState(() => monthOf(value));
  const [focus, setFocus] = useState(value);
  const grid = useRef<HTMLDivElement>(null);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = utcToAbsWeek(todayUtc);
  const allowed = (w: number) => (min == null || w >= min) && (max == null || w <= max);

  // Weeks whose Thursday falls in the viewed month (ISO-style), so no week shows up in two months.
  const first = utcToAbsWeek(Date.UTC(view.y, view.m, 1) + 3 * DAY);
  const weeks: number[] = [];
  for (let w = first; monthOf(w).m === view.m; w++) weeks.push(w);
  const tabStop = weeks.includes(focus) ? focus : weeks.includes(value) ? value : weeks[0];

  const step = (delta: number) => setView((v) => {
    const d = new Date(Date.UTC(v.y, v.m + delta, 1));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const moveFocus = (w: number) => {
    setFocus(w);
    const mo = monthOf(w);
    if (mo.m !== view.m || mo.y !== view.y) setView(mo);
  };

  // Keep keyboard focus on the focused row as months change.
  const mounted = useRef(false);
  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>(`[data-week="${focus}"]`)?.focus({ preventScroll: !mounted.current });
    mounted.current = true;
  }, [focus, view]);

  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(focus + map[e.key]);
    }
  };

  return (
    <div className="week-cal">
      <div className="week-cal-head">
        <span className="week-cal-title">{MONTHS[view.m]} <span className="faint">{view.y}</span></span>
        <span className="spacer" />
        <button type="button" className="btn sm ghost" onClick={() => moveFocus(thisWeek)} disabled={!allowed(thisWeek)}>Today</button>
        <button type="button" className="btn sm ghost icon" onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
        <button type="button" className="btn sm ghost icon" onClick={() => step(1)} aria-label="Next month"><ChevronRight size={15} /></button>
      </div>
      <div className="week-cal-row week-cal-dow" aria-hidden>
        <span className="week-cal-wk">Wk</span>
        {DOW.map((d, i) => <span key={i} className={i > 4 ? 'weekend' : ''}>{d}</span>)}
      </div>
      <div ref={grid} role="listbox" aria-label={`${MONTHS[view.m]} ${view.y}`} onKeyDown={onKey}>
        {weeks.map((w) => {
          const start = absWeekToUtc(w);
          const q = quarterForDate(start, sm);
          const n = w - quarterStartAbsWeek(q, sm) + 1;
          const ok = allowed(w);
          return (
            <button
              key={w}
              type="button"
              role="option"
              data-week={w}
              aria-selected={w === value}
              aria-label={`Week ${n} of ${quarterLabel(q)}, starting ${formatAbsWeek(w, true)}`}
              tabIndex={w === tabStop ? 0 : -1}
              disabled={!ok}
              className={`week-cal-row week ${w === value ? 'on' : ''} ${w === thisWeek ? 'now' : ''} ${n === 1 ? 'q-start' : ''}`}
              title={n === 1 ? `${quarterLabel(q)} starts` : undefined}
              onClick={() => onPick(w)}
            >
              <span className="week-cal-wk">{n === 1 ? quarterLabel(q).slice(-2) : n}</span>
              {DOW.map((_, i) => {
                const t = start + i * DAY;
                const d = new Date(t);
                return (
                  <span key={i} className={`${d.getUTCMonth() !== view.m ? 'out' : ''} ${i > 4 ? 'weekend' : ''} ${t === todayUtc ? 'today' : ''}`}>
                    {d.getUTCDate()}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}

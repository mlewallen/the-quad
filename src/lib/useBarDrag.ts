import { useEffect, useState } from 'react';
import type { ID, Schedule } from '../types';

/**
 * Shared drag/resize behaviour for schedule bars in any Gantt-style view
 * (main Gantt, designer timelines). Drag the body to move, either end to
 * resize; a press without movement counts as a click. Optional row
 * reassignment reads a data attribute from whatever row is under the pointer.
 *
 * Touch works differently so a swipe can still scroll the timeline: a quick
 * tap opens the bar, a swipe scrolls, and a ~300ms long-press picks the bar up.
 */

const LONG_PRESS_MS = 300;
const TOUCH_SLOP = 8;

/** True while a touch drag is live; a non-passive touchmove listener then blocks scrolling. */
let touchDragging = false;
let touchGuardInstalled = false;
function installTouchGuard() {
  if (touchGuardInstalled || typeof window === 'undefined') return;
  touchGuardInstalled = true;
  window.addEventListener('touchmove', (e) => touchDragging && e.cancelable && e.preventDefault(), { passive: false });
}

export type DragKind = 'move' | 'l' | 'r';

export interface BarDragState {
  id: ID;
  kind: DragKind;
  startX: number;
  pxPerWeek: number;
  orig: { startWeek: number; duration: number; designerId: ID | null };
  dWeeks: number;
  /** undefined = row not changed; null = dropped on the "unassigned" row. */
  targetDesigner: ID | null | undefined;
  moved: boolean;
}

export interface BarDragOptions {
  /** Number of week columns the track element spans. */
  weeks: number;
  /** Selector for the ancestor whose width maps to `weeks`. */
  trackSelector: string;
  /** Data attribute (without `data-`) marking droppable rows, e.g. "designer-row". */
  rowAttr?: string;
  onCommit: (id: ID, patch: Partial<Schedule>) => void;
  onClick?: (id: ID) => void;
  onStart?: () => void;
}

const camel = (attr: string) => attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function useBarDrag(opts: BarDragOptions) {
  const [drag, setDrag] = useState<BarDragState | null>(null);

  /** The schedule as it should render right now, including any in-flight drag. */
  const effective = (id: ID, s: Schedule): Schedule => {
    if (!drag || drag.id !== id) return s;
    const o = drag.orig;
    if (drag.kind === 'move')
      return { ...s, startWeek: o.startWeek + drag.dWeeks, designerId: drag.targetDesigner === undefined ? o.designerId : drag.targetDesigner };
    if (drag.kind === 'l') {
      const d = Math.min(drag.dWeeks, o.duration - 1);
      return { ...s, startWeek: o.startWeek + d, duration: o.duration - d };
    }
    return { ...s, duration: Math.max(1, o.duration + drag.dWeeks) };
  };

  useEffect(installTouchGuard, []);

  const onPointerDown = (e: React.PointerEvent, id: ID, s: Schedule, kind: DragKind) => {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') return onTouchDown(e, id, s, kind);
    e.preventDefault();
    e.stopPropagation();
    begin(e, id, s, kind);
  };

  /** Touch: wait for a long-press before dragging; movement first means the user is scrolling. */
  const onTouchDown = (e: React.PointerEvent, id: ID, s: Schedule, kind: DragKind) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const pointerId = e.pointerId;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId && Math.hypot(ev.clientX - x0, ev.clientY - y0) > TOUCH_SLOP) cleanup();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      cleanup();
      opts.onClick?.(id);
    };
    const timer = setTimeout(() => {
      cleanup();
      navigator.vibrate?.(10);
      begin({ clientX: x0, currentTarget: el }, id, s, kind, true);
    }, LONG_PRESS_MS);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cleanup);
  };

  const begin = (e: { clientX: number; currentTarget: EventTarget | null }, id: ID, s: Schedule, kind: DragKind, touch = false) => {
    opts.onStart?.();
    const track = (e.currentTarget as HTMLElement).closest(opts.trackSelector) as HTMLElement | null;
    if (!track) return;
    if (touch) touchDragging = true;
    const key = opts.rowAttr ? camel(opts.rowAttr) : null;
    let state: BarDragState = {
      id,
      kind,
      startX: e.clientX,
      pxPerWeek: track.getBoundingClientRect().width / opts.weeks,
      orig: { startWeek: s.startWeek, duration: s.duration, designerId: s.designerId },
      dWeeks: 0,
      targetDesigner: undefined,
      moved: false,
    };
    setDrag(state);
    const move = (ev: PointerEvent) => {
      const dWeeks = Math.round((ev.clientX - state.startX) / state.pxPerWeek);
      let targetDesigner = state.targetDesigner;
      if (kind === 'move' && key) {
        const row = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => (el as HTMLElement).dataset?.[key] !== undefined) as HTMLElement | undefined;
        if (row) targetDesigner = row.dataset[key] || null;
      }
      const moved = state.moved || Math.abs(ev.clientX - state.startX) > 3 || (targetDesigner !== undefined && targetDesigner !== state.orig.designerId);
      state = { ...state, dWeeks, targetDesigner, moved };
      setDrag(state);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      touchDragging = false;
      setDrag(null);
      // A long-press released in place is a pick-up, not a tap.
      if (!state.moved) {
        if (touch) return;
        opts.onClick?.(state.id);
        return;
      }
      const o = state.orig;
      if (state.kind === 'move') {
        const patch: Partial<Schedule> = { startWeek: o.startWeek + state.dWeeks };
        if (state.targetDesigner !== undefined) patch.designerId = state.targetDesigner;
        opts.onCommit(state.id, patch);
      } else if (state.kind === 'l') {
        const d = Math.min(state.dWeeks, o.duration - 1);
        opts.onCommit(state.id, { startWeek: o.startWeek + d, duration: o.duration - d });
      } else {
        opts.onCommit(state.id, { duration: Math.max(1, o.duration + state.dWeeks) });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  /** Arrow keys nudge a focused bar; Shift+arrows change duration. */
  const onKeyDown = (e: React.KeyboardEvent, id: ID, s: Schedule) => {
    if (e.key === 'Enter') opts.onClick?.(id);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      opts.onCommit(id, e.shiftKey ? { duration: Math.max(1, s.duration + d) } : { startWeek: s.startWeek + d });
    }
  };

  return { drag, effective, onPointerDown, onKeyDown };
}

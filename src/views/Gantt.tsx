import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ChartArea, ChartGantt, Users } from 'lucide-react';
import { readableOn, spring } from '../lib/motion';
import { useStore } from '../store';
import {
  openProject, useDesignerMap, useDesigners, useEntries, useLoad, useQuarterStart, useWorkspace, useWorkspaceDisruptions,
} from '../hooks';
import type { Designer, Disruption, ID } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import type { Entry, WeekLoad } from '../lib/capacity';
import { summarize } from '../lib/capacity';
import { weeklyAllocation } from '../lib/curves';
import { formatAbsWeek, formatWeekRange, utcToAbsWeek } from '../lib/quarters';
import { Avatar, EmptyState, HealthStrip, LoadChip, PriorityChip, Toolbar } from '../components/ui';

interface DragState {
  id: ID;
  kind: 'move' | 'l' | 'r';
  startX: number;
  pxPerWeek: number;
  orig: { startWeek: number; duration: number; designerId: ID | null };
  dWeeks: number;
  targetDesigner: ID | null | undefined;
  moved: boolean;
}

interface Hover {
  x: number;
  y: number;
  entry: Entry;
}

const LANE_H = 32;

export default function Gantt() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateSchedule = useStore((s) => s.updateSchedule);
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const entries = useEntries();
  const disruptions = useWorkspaceDisruptions();
  const qStart = useQuarterStart();
  const before = settings.ganttWeeksBefore;
  const after = settings.ganttWeeksAfter;
  const { load, fromAbs, n } = useLoad(before, after);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const nowAbs = utcToAbsWeek(Date.now());
  const trackRef = useRef<HTMLDivElement>(null);

  /** Apply in-flight drag to an entry for rendering. */
  const effective = (e: Entry) => {
    if (!drag || drag.id !== e.project.id) return e.schedule;
    const o = drag.orig;
    if (drag.kind === 'move')
      return { ...e.schedule, startWeek: o.startWeek + drag.dWeeks, designerId: drag.targetDesigner === undefined ? o.designerId : drag.targetDesigner };
    if (drag.kind === 'l') {
      const d = Math.min(drag.dWeeks, o.duration - 1);
      return { ...e.schedule, startWeek: o.startWeek + d, duration: o.duration - d };
    }
    return { ...e.schedule, duration: Math.max(1, o.duration + drag.dWeeks) };
  };

  const rows: { designer: Designer | null; items: Entry[] }[] = useMemo(() => {
    const byDesigner = new Map<ID | null, Entry[]>();
    for (const e of entries) {
      const s = effective(e);
      const key = s.designerId && dmap[s.designerId] ? s.designerId : null;
      if (!byDesigner.has(key)) byDesigner.set(key, []);
      byDesigner.get(key)!.push({ ...e, schedule: s });
    }
    const out: { designer: Designer | null; items: Entry[] }[] = designers.map((d) => ({ designer: d, items: byDesigner.get(d.id) ?? [] }));
    out.push({ designer: null, items: byDesigner.get(null) ?? [] });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, designers, dmap, drag]);

  const onBarPointerDown = (e: React.PointerEvent, entry: Entry, kind: DragState['kind']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setHover(null);
    const track = (e.currentTarget as HTMLElement).closest('.gantt-track') as HTMLElement;
    const pxPerWeek = track.getBoundingClientRect().width / n;
    const s = entry.schedule;
    let state: DragState = {
      id: entry.project.id,
      kind,
      startX: e.clientX,
      pxPerWeek,
      orig: { startWeek: s.startWeek, duration: s.duration, designerId: s.designerId },
      dWeeks: 0,
      targetDesigner: undefined,
      moved: false,
    };
    setDrag(state);
    const move = (ev: PointerEvent) => {
      const dWeeks = Math.round((ev.clientX - state.startX) / state.pxPerWeek);
      let targetDesigner = state.targetDesigner;
      if (kind === 'move') {
        const row = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => (el as HTMLElement).dataset?.designerRow !== undefined) as HTMLElement | undefined;
        if (row) targetDesigner = row.dataset.designerRow || null;
      }
      const moved = state.moved || Math.abs(ev.clientX - state.startX) > 3 || (targetDesigner !== undefined && targetDesigner !== state.orig.designerId);
      state = { ...state, dWeeks, targetDesigner, moved };
      setDrag(state);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!state.moved) {
        openProject(state.id);
        return;
      }
      const o = state.orig;
      if (state.kind === 'move') {
        const designerId = state.targetDesigner === undefined ? o.designerId : state.targetDesigner;
        updateSchedule(state.id, { startWeek: o.startWeek + state.dWeeks, designerId });
      } else if (state.kind === 'l') {
        const d = Math.min(state.dWeeks, o.duration - 1);
        updateSchedule(state.id, { startWeek: o.startWeek + d, duration: o.duration - d });
      } else {
        updateSchedule(state.id, { duration: Math.max(1, o.duration + state.dWeeks) });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const weekCols = `repeat(${n}, 1fr)`;
  const pos = (absStart: number, dur: number) => {
    const l = Math.max(0, absStart - fromAbs);
    const r = Math.min(n, absStart - fromAbs + dur);
    return { left: `${(l / n) * 100}%`, width: `${(Math.max(0, r - l) / n) * 100}%`, visible: r > l };
  };
  const outside = (i: number) => i < before || i >= before + WEEKS_PER_QUARTER;

  return (
    <div className="view" style={{ paddingBottom: 40 }}>
      <Toolbar>
        <div className="segmented" role="radiogroup" aria-label="Display">
          <button role="radio" aria-checked={settings.ganttMode === 'bars'} className={settings.ganttMode === 'bars' ? 'on' : ''} onClick={() => updateSettings({ ganttMode: 'bars' })}><ChartGantt size={14} /> Bars</button>
          <button role="radio" aria-checked={settings.ganttMode === 'stacked'} className={settings.ganttMode === 'stacked' ? 'on' : ''} onClick={() => updateSettings({ ganttMode: 'stacked' })}><ChartArea size={14} /> Stacked</button>
        </div>
        <div className="row small">
          <span className="faint">Window</span>
          <select className="select sm" style={{ width: 'auto' }} value={before} onChange={(e) => updateSettings({ ganttWeeksBefore: Number(e.target.value) })} aria-label="Weeks before quarter">
            {[0, 2, 4, 8, 13].map((w) => <option key={w} value={w}>{w} wks before</option>)}
          </select>
          <select className="select sm" style={{ width: 'auto' }} value={after} onChange={(e) => updateSettings({ ganttWeeksAfter: Number(e.target.value) })} aria-label="Weeks after quarter">
            {[0, 2, 4, 8, 13].map((w) => <option key={w} value={w}>{w} wks after</option>)}
          </select>
        </div>
        <span className="spacer" />
        <Legend />
      </Toolbar>

      {!designers.length && <EmptyState icon={Users} title="No designers yet">Add designers in Settings → Team to start planning.</EmptyState>}
      <div className="card" style={{ overflow: 'auto', display: designers.length ? undefined : 'none' }}>
        <LayoutGroup>
        <div className="gantt" ref={trackRef}>
          <div className="gantt-header">
            <div className="gantt-label" style={{ justifyContent: 'flex-end' }}>
              <span className="tiny faint">{entries.length} {(entries.length === 1 ? workspace.config.labels.initiative : workspace.config.labels.initiatives).toLowerCase()}</span>
            </div>
            <div className="gantt-weeks" style={{ gridTemplateColumns: weekCols }}>
              {Array.from({ length: n }, (_, i) => {
                const rel = i - before;
                return (
                  <div key={i} className={`wk ${outside(i) ? 'outside' : ''} ${fromAbs + i === nowAbs ? 'now' : ''}`}>
                    <b>{rel < 0 ? `−${-rel}` : rel >= WEEKS_PER_QUARTER ? `+${rel - WEEKS_PER_QUARTER + 1}` : `W${rel + 1}`}</b>
                    {formatAbsWeek(fromAbs + i)}
                  </div>
                );
              })}
            </div>
          </div>

          {rows.map(({ designer, items }) => {
            if (!designer && !items.length) return null;
            const weeks = designer ? load[designer.id] : undefined;
            const myDisruptions = designer ? disruptions.filter((d) => d.designerIds.includes(designer.id)) : [];
            const lanes = assignLanes(items, qStart);
            const laneCount = Math.max(1, ...[...lanes.values()].map((l) => l + 1));
            const stats = weeks ? summarize(weeks.slice(before, before + WEEKS_PER_QUARTER)) : null;
            const isDropTarget = drag?.kind === 'move' && drag.moved && drag.targetDesigner !== undefined && (drag.targetDesigner ?? null) === (designer?.id ?? null) && drag.orig.designerId !== (designer?.id ?? null);
            return (
              <div key={designer?.id ?? 'unassigned'} className={`gantt-row ${isDropTarget ? 'drop-target' : ''}`} data-designer-row={designer?.id ?? ''}>
                <div className="gantt-label">
                  <div className="row">
                    <Avatar designer={designer ?? undefined} />
                    <b className="ellipsis">{designer?.name ?? 'Unassigned'}</b>
                  </div>
                  {stats ? (
                    <div className="row tiny muted">
                      <span>avg</span> <LoadChip pct={stats.avg} />
                      <span>peak</span> <LoadChip pct={stats.peak} />
                    </div>
                  ) : (
                    <span className="tiny faint">Drag a bar onto a designer to assign it</span>
                  )}
                </div>
                <div className="gantt-track">
                  <div className="gantt-grid" style={{ gridTemplateColumns: weekCols }}>
                    {Array.from({ length: n }, (_, i) => (
                      <div key={i} className={`${outside(i) ? 'outside' : ''} ${fromAbs + i === nowAbs ? 'now' : ''}`} />
                    ))}
                  </div>
                  {settings.ganttMode === 'bars' || !designer ? (
                    <>
                      {myDisruptions.map((d) => <DisruptionOverlay key={d.id} d={d} pos={pos} />)}
                      <div className="gantt-lanes" style={{ height: laneCount * LANE_H + 10 }}>
                        {items.map((e) => {
                          const s = e.schedule;
                          const p = pos(qStart + s.startWeek, s.duration);
                          if (!p.visible) return null;
                          const color = designer?.color ?? '#8a8a94';
                          const dragging = drag?.id === e.project.id;
                          return (
                            <motion.div
                              key={e.project.id}
                              // Shared layout id lets a bar glide between rows and positions
                              // (plan switches, keyboard nudges, lane repacking). Disabled while
                              // any drag is live so the bar tracks the pointer 1:1.
                              layoutId={drag ? undefined : `bar-${e.project.id}`}
                              layout={drag ? false : 'position'}
                              transition={spring.settle}
                              initial={{ opacity: 0, scaleX: 0.85 }}
                              animate={{ opacity: 1, scaleX: 1, scale: dragging && drag?.kind === 'move' && drag.moved ? 1.02 : 1 }}
                              className={`gantt-bar ${s.confirmed ? '' : 'unconfirmed'} ${dragging ? 'dragging' : ''}`}
                              style={{
                                left: p.left, width: p.width, top: 6 + (lanes.get(e.project.id) ?? 0) * LANE_H, background: color,
                                color: readableOn(color), transformOrigin: 'left center',
                                transition: drag ? 'box-shadow .2s' : 'width .28s cubic-bezier(.16,1,.3,1), box-shadow .2s',
                              }}
                              onPointerDown={(ev) => onBarPointerDown(ev, e, 'move')}
                              onPointerMove={(ev) => !drag && setHover({ x: ev.clientX, y: ev.clientY, entry: e })}
                              onPointerLeave={() => setHover(null)}
                              onFocus={(ev) => {
                                const r = ev.currentTarget.getBoundingClientRect();
                                setHover({ x: r.left, y: r.bottom, entry: e });
                              }}
                              onBlur={() => setHover(null)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter') openProject(e.project.id);
                                if (ev.key === 'ArrowLeft') updateSchedule(e.project.id, { startWeek: s.startWeek - 1 });
                                if (ev.key === 'ArrowRight') updateSchedule(e.project.id, { startWeek: s.startWeek + 1 });
                              }}
                              aria-label={`${e.project.name}, ${formatWeekRange(qStart + s.startWeek, s.duration)}`}
                            >
                              <span className="handle l" onPointerDown={(ev) => onBarPointerDown(ev, e, 'l')} />
                              <CurveFill entry={e} />
                              {s.milestones.map((m) => (
                                <span key={m.id} className="milestone" style={{ left: `${((m.offset + 0.5) / s.duration) * 100}%` }} title={m.type} />
                              ))}
                              <span className="name ellipsis">{e.project.name}</span>
                              <span className="pct">{s.allocation}%</span>
                              <span className="handle r" onPointerDown={(ev) => onBarPointerDown(ev, e, 'r')} />
                            </motion.div>
                          );
                        })}
                      </div>
                      {weeks && <TrendLine weeks={weeks} />}
                    </>
                  ) : (
                    <StackedArea weeks={weeks!} entries={items} dmapColor={designer.color} />
                  )}
                  {weeks && <HealthStrip values={weeks.map((w) => w.total)} />}
                </div>
              </div>
            );
          })}
        </div>
        </LayoutGroup>
      </div>

      <AnimatePresence>
        {hover && <BarTooltip key="tip" hover={hover} qStart={qStart} designerName={hover.entry.schedule.designerId ? dmap[hover.entry.schedule.designerId]?.name : undefined} />}
      </AnimatePresence>
    </div>
  );
}

/** Greedy lane packing so overlapping bars stack instead of covering each other. */
function assignLanes(items: Entry[], qStart: number): Map<ID, number> {
  const sorted = items.slice().sort((a, b) => a.schedule.startWeek - b.schedule.startWeek || b.schedule.duration - a.schedule.duration);
  const laneEnds: number[] = [];
  const out = new Map<ID, number>();
  for (const e of sorted) {
    const start = qStart + e.schedule.startWeek;
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = start + e.schedule.duration;
    out.set(e.project.id, lane);
  }
  return out;
}

/** Bottom fill inside a bar showing the per-week allocation curve. */
function CurveFill({ entry }: { entry: Entry }) {
  const s = entry.schedule;
  if (s.curve.shape === 'flat') return <span className="fill" style={{ height: `${s.allocation * 0.3}%` }} />;
  const vals = weeklyAllocation(s.curve, s.duration, s.allocation);
  const pts = vals.map((v, i) => `${((i + 0.5) / vals.length) * 100},${100 - v * 0.6}`).join(' ');
  return (
    <svg className="fill" style={{ top: 0, width: '100%', height: '100%', background: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points={`0,100 ${pts} 100,100`} fill="rgb(0 0 0 / 0.18)" />
    </svg>
  );
}

function DisruptionOverlay({ d, pos }: { d: Disruption; pos: (a: number, dur: number) => { left: string; width: string; visible: boolean } }) {
  const p = pos(d.startAbsWeek, d.duration);
  if (!p.visible) return null;
  return (
    <div className="disruption" style={{ left: p.left, width: p.width }} title={`${d.type}${d.label ? ` — ${d.label}` : ''}: ${d.allocation}% · ${formatWeekRange(d.startAbsWeek, d.duration)}`}>
      <span>{d.type} {d.allocation}%</span>
    </div>
  );
}

function TrendLine({ weeks }: { weeks: WeekLoad[] }) {
  const n = weeks.length;
  const max = Math.max(150, ...weeks.map((w) => w.total));
  const y = (v: number) => 100 - (v / max) * 100;
  const pts = weeks.map((w, i) => `${((i + 0.5) / n) * 100},${y(w.total)}`).join(' ');
  return (
    <svg className="trend" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 'calc(100% - 6px)' }}>
      <line x1="0" x2="100" y1={y(100)} y2={y(100)} stroke="var(--over)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.5" />
      <polyline points={pts} fill="none" stroke="var(--text-2)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.7" />
    </svg>
  );
}

function StackedArea({ weeks, entries, dmapColor }: { weeks: WeekLoad[]; entries: Entry[]; dmapColor: string }) {
  const n = weeks.length;
  const max = Math.max(120, ...weeks.map((w) => w.total));
  const H = 120;
  const ids = [...new Set(weeks.flatMap((w) => w.items.map((it) => `${it.kind}:${it.id}`)))];
  const names = new Map(entries.map((e) => [`project:${e.project.id}`, e.project.name]));
  const cum = Array(n).fill(0);
  const layers = ids.map((key, li) => {
    const lower = cum.slice();
    weeks.forEach((w, i) => {
      cum[i] += w.items.filter((it) => `${it.kind}:${it.id}` === key).reduce((a, it) => a + it.pct, 0);
    });
    const upper = cum.slice();
    const x = (i: number) => (i / n) * 100;
    const top = upper.flatMap((v, i) => [`${x(i)},${H - (v / max) * H}`, `${x(i + 1)},${H - (v / max) * H}`]);
    const bottom = lower.flatMap((v, i) => [`${x(i)},${H - (v / max) * H}`, `${x(i + 1)},${H - (v / max) * H}`]).reverse();
    const isDisruption = key.startsWith('disruption');
    return (
      <polygon
        key={key}
        points={[...top, ...bottom].join(' ')}
        fill={isDisruption ? 'url(#hatch)' : dmapColor}
        fillOpacity={isDisruption ? 1 : 0.35 + ((li % 4) * 0.15)}
        stroke="var(--surface)"
        strokeWidth="0.5"
        vectorEffect="non-scaling-stroke"
      >
        <title>{names.get(key) ?? 'Disruption'}</title>
      </polygon>
    );
  });
  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: H, position: 'relative' }}>
      <defs>
        <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="var(--surface-2)" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="var(--text-3)" strokeWidth="1.5" />
        </pattern>
      </defs>
      {layers}
      <line x1="0" x2="100" y1={H - (100 / max) * H} y2={H - (100 / max) * H} stroke="var(--over)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BarTooltip({ hover, qStart, designerName }: { hover: Hover; qStart: number; designerName?: string }) {
  const { project: p, schedule: s } = hover.entry;
  const left = Math.min(hover.x + 14, window.innerWidth - 300);
  return (
    <motion.div
      className="tooltip"
      style={{ left, top: hover.y + 16 }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.14 } }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
    >
      <div className="t-title">{p.name}</div>
      <div className="t-row"><span>Designer</span><span>{designerName ?? 'Unassigned'}</span></div>
      <div className="t-row"><span>When</span><span>{formatWeekRange(qStart + s.startWeek, s.duration)}</span></div>
      <div className="t-row"><span>Allocation</span><span>{s.allocation}% · {s.curve.shape}</span></div>
      <div className="t-row"><span>Phase</span><span>{s.phase}</span></div>
      <div className="t-row"><span>Priority / size</span><span><PriorityChip p={p.priority} /> {p.size} {p.workType}</span></div>
      {s.milestones.length > 0 && <div className="t-row"><span>Milestones</span><span>{s.milestones.map((m) => m.type).join(', ')}</span></div>}
      <div className="t-row"><span>Status</span><span>{s.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip">Tentative</span>}</span></div>
    </motion.div>
  );
}

function Legend() {
  return (
    <div className="row tiny muted" style={{ gap: 10 }}>
      <span className="row" style={{ gap: 4 }}><span className="dot lvl-ok" /> ≤85%</span>
      <span className="row" style={{ gap: 4 }}><span className="dot lvl-warn" /> ≤100%</span>
      <span className="row" style={{ gap: 4 }}><span className="dot lvl-over" /> over</span>
      <span className="row" style={{ gap: 4 }}><span style={{ width: 14, height: 10, background: 'repeating-linear-gradient(-45deg, var(--text-3) 0 2px, transparent 2px 5px)' }} /> disruption</span>
      <span className="row" style={{ gap: 4 }}><span style={{ width: 14, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(-45deg, var(--text-3) 0 3px, var(--border-strong) 3px 6px)' }} /> tentative</span>
    </div>
  );
}

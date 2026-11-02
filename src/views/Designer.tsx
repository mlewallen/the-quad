import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowLeft, CalendarOff, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Diamond, Gauge, Layers, Lightbulb, Palette, Sparkles, Timer, UserX, Users,
} from 'lucide-react';
import {
  navigate, openDesigner, openProject, useDesignerMap, useDesigners, useEntries, useLoad, usePhase, useQuarterStart, useRoute, useWorkspace,
  useWorkspaceDisruptions,
} from '../hooks';
import type { Designer, ID } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { loadLevel, PAIR_SHARE, summarize, type Entry, type WeekLoad } from '../lib/capacity';
import { weeklyAllocation } from '../lib/curves';
import { formatAbsWeek, formatWeekRange, utcToAbsWeek } from '../lib/quarters';
import { useBarDrag } from '../lib/useBarDrag';
import { useStore } from '../store';
import { ease, readableOn, staggerChild, staggerParent } from '../lib/motion';
import { Avatar, barLabel, EmptyState, LoadChip, PriorityChip, TextInput } from '../components/ui';
import { ColorField } from '../components/inputs';
import { DESIGNER_COLORS } from '../lib/defaults';
import { MenuItem, MenuLabel, Popover } from '../components/Popover';

/**
 * Steps through the team in sidebar order. Linear rather than wrapping, so with
 * two designers there is one live arrow instead of two identical ones; the
 * middle button jumps to anyone. ←/→ step too, unless focus is in a field.
 */
function DesignerSwitcher({ current, designers, load }: { current: Designer; designers: Designer[]; load: Record<ID, WeekLoad[]> }) {
  const idx = designers.findIndex((d) => d.id === current.id);
  const prev = idx > 0 ? designers[idx - 1] : null;
  const next = idx < designers.length - 1 ? designers[idx + 1] : null;

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || t?.closest('input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog], [role=menu], .palette, .gantt-bar, .mini-tl-bar')) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null;
      if (to) {
        e.preventDefault();
        openDesigner(to.id);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [prev, next]);

  return (
    <div className="ctx-control designer-switcher" role="group" aria-label="Switch designer">
      <button
        className="btn icon ghost sm"
        disabled={!prev}
        onClick={() => prev && openDesigner(prev.id)}
        aria-label={prev ? `Previous designer: ${prev.name}` : 'No previous designer'}
        title={prev ? `${prev.name}  ←` : undefined}
      >
        <ChevronLeft size={16} />
      </button>
      <Popover
        align="end"
        width={260}
        trigger={({ open, toggle }) => (
          <button className={`switcher-pos ${open ? 'open' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`Designer ${idx + 1} of ${designers.length}. Jump to designer`}>
            <span className="num">{idx + 1}</span>
            <span className="faint">of {designers.length}</span>
            <ChevronDown size={13} className="faint" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuLabel>Team</MenuLabel>
            {designers.map((d) => (
              <MenuItem
                key={d.id}
                active={d.id === current.id}
                icon={<Avatar designer={d} />}
                hint={<span className="row" style={{ gap: 6 }}><LoadChip pct={summarize(load[d.id] ?? []).avg} />{d.id === current.id ? <Check size={14} /> : <span style={{ width: 14 }} />}</span>}
                onSelect={() => { close(); if (d.id !== current.id) openDesigner(d.id); }}
              >
                {d.name}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
      <button
        className="btn icon ghost sm"
        disabled={!next}
        onClick={() => next && openDesigner(next.id)}
        aria-label={next ? `Next designer: ${next.name}` : 'No next designer'}
        title={next ? `${next.name}  →` : undefined}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

/** Per-project shade of the designer's color so stacked segments stay distinguishable. */
function shade(color: string, i: number) {
  const mix = [100, 72, 52, 86, 62, 42][i % 6];
  return `color-mix(in srgb, ${color} ${mix}%, var(--surface))`;
}

export default function DesignerView() {
  const route = useRoute();
  const designers = useDesigners();
  const designer = designers.find((d) => d.id === route.designer);
  if (!designer) {
    return (
      <div className="view">
        <EmptyState icon={UserX} title="Designer not found" action={<button className="btn" onClick={() => navigate({ view: 'home', designer: null })}><ArrowLeft size={14} /> Back to Home</button>}>
          They may have been removed, or belong to another workspace.
        </EmptyState>
      </div>
    );
  }
  return <DesignerBody key={designer.id} designer={designer} />;
}

function DesignerBody({ designer }: { designer: Designer }) {
  const workspace = useWorkspace()!;
  const phaseOf = usePhase();
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const entries = useEntries();
  const disruptions = useWorkspaceDisruptions();
  const qStart = useQuarterStart();
  const { load } = useLoad();
  const weeks = load[designer.id] ?? [];
  const stats = summarize(weeks);
  const labels = workspace.config.labels;
  const updateDesigner = useStore((s) => s.updateDesigner);

  const mine = useMemo(
    () =>
      entries
        .filter((e) => e.schedule.designerId === designer.id || e.schedule.pairDesignerId === designer.id)
        .sort((a, b) => a.schedule.startWeek - b.schedule.startWeek || a.project.name.localeCompare(b.project.name)),
    [entries, designer.id],
  );
  const colorOf = useMemo(() => new Map(mine.map((e, i) => [e.project.id, shade(designer.color, i)])), [mine, designer.color]);
  const myDisruptions = disruptions
    .filter((d) => d.designerIds.includes(designer.id) && d.startAbsWeek < qStart + WEEKS_PER_QUARTER && d.startAbsWeek + d.duration > qStart)
    .sort((a, b) => a.startAbsWeek - b.startAbsWeek);

  /** This designer's effort (person-weeks) on a project within the quarter window. */
  const effortIn = (e: Entry) => {
    const share = e.schedule.designerId === designer.id ? 1 : PAIR_SHARE;
    return weeklyAllocation(e.schedule.curve, e.schedule.duration, e.schedule.allocation)
      .filter((_, i) => e.schedule.startWeek + i >= 0 && e.schedule.startWeek + i < WEEKS_PER_QUARTER)
      .reduce((a, v) => a + (v * share) / 100, 0);
  };
  const projectEffort = mine.reduce((a, e) => a + effortIn(e), 0);
  const disruptionEffort = weeks.reduce((a, w) => a + w.disruptions / 100, 0);
  const freeCapacity = weeks.reduce((a, w) => a + Math.max(0, 100 - w.total) / 100, 0);
  const confirmed = mine.filter((e) => e.schedule.designerId === designer.id && e.schedule.confirmed).length;
  const primary = mine.filter((e) => e.schedule.designerId === designer.id).length;

  const insights = buildInsights(designer, weeks, mine, dmap, freeCapacity);

  const milestones = mine
    .flatMap((e) => e.schedule.milestones.map((m) => ({ m, e, abs: qStart + e.schedule.startWeek + Math.floor(m.offset) })))
    .sort((a, b) => a.abs - b.abs);

  const groupEffort = (key: (e: Entry) => string) => {
    const map = new Map<string, number>();
    for (const e of mine) map.set(key(e), (map.get(key(e)) ?? 0) + effortIn(e));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  };


  return (
    <div className="view designer-view">
      <motion.section
        className="designer-hero card"
        style={{ '--dc': designer.color } as React.CSSProperties}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.out } }}
      >
        <div className="row hero-top" style={{ gap: 14, alignItems: 'flex-start' }}>
          <ColorField
            value={designer.color}
            swatches={DESIGNER_COLORS}
            onChange={(c) => updateDesigner(designer.id, { color: c })}
            ariaLabel={`Color for ${designer.name}`}
            trigger={({ open, toggle }) => (
              <button type="button" className="hero-avatar" style={{ background: designer.color, color: readableOn(designer.color) }} title="Change color" aria-label={`Color for ${designer.name}: ${designer.color}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
                {designer.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                <span className="hero-avatar-edit" aria-hidden><Palette size={11} /></span>
              </button>
            )}
          />
          <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
            <h2 className="hero-name-heading">
              <TextInput className="hero-name" value={designer.name} ariaLabel="Designer name" onCommit={(v) => v.trim() && updateDesigner(designer.id, { name: v.trim() })} />
            </h2>
            <div className="row small faint" style={{ flexWrap: 'wrap' }}>
              <span>{workspace.name}</span>·
              <span>{primary} owned · {mine.length - primary} pairing</span>·
              <span>{confirmed}/{primary} confirmed</span>
            </div>
          </div>
          {designers.length > 1 && <DesignerSwitcher current={designer} designers={designers} load={load} />}
        </div>

        <motion.div className="kpis" variants={staggerParent} initial="initial" animate="animate">
          <Kpi icon={Gauge} label="Average load" value={`${Math.round(stats.avg)}%`} tone={loadLevel(stats.avg)} />
          <Kpi icon={AlertTriangle} label="Peak load" value={`${Math.round(stats.peak)}%`} tone={loadLevel(stats.peak)} />
          <Kpi icon={CalendarOff} label="Weeks over 100%" value={String(stats.over)} tone={stats.over ? 'over' : 'ok'} />
          <Kpi icon={Layers} label="Project effort" value={`${projectEffort.toFixed(1)} wks`} />
          <Kpi icon={Timer} label="Disruptions" value={`${disruptionEffort.toFixed(1)} wks`} />
          <Kpi icon={Sparkles} label="Free capacity" value={`${freeCapacity.toFixed(1)} wks`} tone={freeCapacity < 1 ? 'warn' : 'ok'} />
        </motion.div>
      </motion.section>

      <div className="designer-grid">
        <div className="col" style={{ gap: 16, minWidth: 0 }}>
          <section className="card card-pad">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2>Weekly load</h2>
              <span className="spacer" />
              <span className="tiny faint">Stacked by project · hatched = disruptions</span>
            </div>
            <WeeklyChart weeks={weeks} colorOf={colorOf} names={new Map(mine.map((e) => [e.project.id, e.project.name]))} disruptionNames={new Map(myDisruptions.map((d) => [d.id, d.type]))} />
          </section>

          <section className="card card-pad">
            <div className="row" style={{ marginBottom: 12 }}>
              <h2>Timeline</h2>
              <span className="spacer" />
              <span className="tiny faint">{mine.length} {(mine.length === 1 ? labels.initiative : labels.initiatives).toLowerCase()}</span>
            </div>
            {mine.length ? <MiniTimeline entries={mine} qStart={qStart} colorOf={colorOf} designerId={designer.id} dmap={dmap} /> : <p className="small faint">Nothing scheduled this quarter.</p>}
          </section>

          <section className="card">
            <div className="row card-pad" style={{ paddingBottom: 8 }}>
              <h2>{labels.initiatives}</h2>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>{labels.initiative}</th><th>Phase</th><th>Pri</th><th>When</th><th>Alloc</th><th>Effort</th><th>Share</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((e) => {
                    const eff = effortIn(e);
                    const pairing = e.schedule.pairDesignerId === designer.id;
                    const partner = pairing ? dmap[e.schedule.designerId ?? ''] : e.schedule.pairDesignerId ? dmap[e.schedule.pairDesignerId] : undefined;
                    return (
                      <tr key={e.project.id} className="clickable" onClick={() => openProject(e.project.id)}>
                        <td>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="swatch-sq" style={{ background: colorOf.get(e.project.id) }} />
                            <button type="button" className="link-btn row-open ellipsis" style={{ maxWidth: 220 }} onClick={(ev) => { ev.stopPropagation(); openProject(e.project.id); }}>{e.project.name}</button>
                            {partner && <span className="chip" title={pairing ? `Pairing with ${partner.name}` : `Paired with ${partner.name}`}><Users size={11} /> {partner.name.split(' ')[0]}</span>}
                          </div>
                        </td>
                        <td className="small">{phaseOf(e)}</td>
                        <td><PriorityChip p={e.project.priority} /></td>
                        <td className="small faint nowrap">{formatWeekRange(qStart + e.schedule.startWeek, e.schedule.duration)}</td>
                        <td className="small">{pairing ? `${Math.round(e.schedule.allocation * PAIR_SHARE)}%` : `${e.schedule.allocation}%`}</td>
                        <td className="small">{eff.toFixed(1)}w</td>
                        <td style={{ minWidth: 90 }}>
                          <div className="share-bar"><div style={{ width: `${projectEffort ? (eff / projectEffort) * 100 : 0}%`, background: colorOf.get(e.project.id) }} /></div>
                        </td>
                        <td>{e.schedule.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip">Tentative</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!mine.length && <EmptyState icon={Layers} title="No work this quarter">Assign something from the Gantt or Backlog.</EmptyState>}
            </div>
          </section>
        </div>

        <motion.aside className="col" style={{ gap: 16, minWidth: 0 }} variants={staggerParent} initial="initial" animate="animate">
          <motion.section className="card card-pad col" style={{ gap: 10 }} variants={staggerChild}>
            <div className="row"><Lightbulb size={16} style={{ color: 'var(--accent)' }} /><h2>Insights</h2></div>
            {insights.map((ins, i) => (
              <div key={i} className={`insight ${ins.tone}`}>
                {ins.tone === 'over' ? <AlertTriangle size={14} /> : ins.tone === 'ok' ? <CircleCheck size={14} /> : <Sparkles size={14} />}
                <span>{ins.text}</span>
              </div>
            ))}
          </motion.section>

          <motion.section className="card card-pad col" style={{ gap: 12 }} variants={staggerChild}>
            <h2>Effort mix</h2>
            <MixBars title="By phase" rows={groupEffort(phaseOf)} color={designer.color} />
            <MixBars title="By work type" rows={groupEffort((e) => e.project.workType)} color={designer.color} />
            <MixBars title="By priority" rows={groupEffort((e) => e.project.priority).sort((a, b) => a[0].localeCompare(b[0]))} color={designer.color} />
          </motion.section>

          <motion.section className="card card-pad col" style={{ gap: 8 }} variants={staggerChild}>
            <h2>Milestones</h2>
            {milestones.length ? (
              milestones.map(({ m, e, abs }) => (
                <button key={m.id} className="milestone-row" onClick={() => openProject(e.project.id)}>
                  <Diamond size={13} fill="currentColor" style={{ color: colorOf.get(e.project.id), flex: 'none' }} />
                  <span className="col" style={{ gap: 0, minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <span className="small" style={{ fontWeight: 500 }}>{m.type}</span>
                    <span className="tiny faint ellipsis">{e.project.name}{m.note ? ` — ${m.note}` : ''}</span>
                  </span>
                  <span className="tiny faint nowrap">{formatAbsWeek(abs)}</span>
                </button>
              ))
            ) : (
              <p className="small faint">No milestones set on their work yet.</p>
            )}
          </motion.section>

          <motion.section className="card card-pad col" style={{ gap: 8 }} variants={staggerChild}>
            <div className="row">
              <h2>Time away & other</h2>
              <span className="spacer" />
              <button className="btn sm ghost" onClick={() => navigate({ view: 'disruptions', designer: null })}>Manage</button>
            </div>
            {myDisruptions.length ? (
              myDisruptions.map((d) => (
                <div key={d.id} className="row small" style={{ padding: '4px 0' }}>
                  <span className="hatch-sq" />
                  <span style={{ fontWeight: 500 }}>{d.type}</span>
                  {d.label && <span className="faint ellipsis">{d.label}</span>}
                  <span className="spacer" />
                  <span className="faint nowrap">{formatWeekRange(d.startAbsWeek, d.duration)} · {d.allocation}%</span>
                </div>
              ))
            ) : (
              <p className="small faint">No PTO, on-call or other disruptions this quarter.</p>
            )}
          </motion.section>
        </motion.aside>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Gauge; label: string; value: string; tone?: string }) {
  return (
    <motion.div className={`kpi ${tone ?? ''}`} variants={staggerChild}>
      <span className="kpi-label"><Icon size={13} /> {label}</span>
      <span className="kpi-value">{value}</span>
    </motion.div>
  );
}

function WeeklyChart({
  weeks, colorOf, names, disruptionNames,
}: { weeks: WeekLoad[]; colorOf: Map<ID, string>; names: Map<ID, string>; disruptionNames: Map<ID, string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(120, ...weeks.map((w) => w.total));
  const H = 180;
  return (
    <div className="wchart">
      <div className="wchart-plot" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {[25, 50, 75, 100].map((g) => (
          <div key={g} className={`wchart-grid ${g === 100 ? 'cap' : ''}`} style={{ bottom: `${(g / max) * 100}%` }}>
            <span>{g}%</span>
          </div>
        ))}
        <div className="wchart-cols" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
          {weeks.map((w, i) => {
            const items = [...w.items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'disruption' ? -1 : 1));
            return (
              <div key={i} className={`wchart-col ${hover === i ? 'hover' : ''}`} onMouseEnter={() => setHover(i)}>
                <motion.div
                  className="wchart-stack"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: i * 0.02, duration: 0.4, ease: ease.out }}
                  style={{ height: `${(w.total / max) * 100}%` }}
                >
                  {items.map((it, k) => (
                    <div
                      key={`${it.kind}${it.id}${k}`}
                      className={it.kind === 'disruption' ? 'seg hatch' : 'seg'}
                      style={{ flexGrow: it.pct, background: it.kind === 'project' ? colorOf.get(it.id) : undefined }}
                    />
                  ))}
                </motion.div>
                {w.total > 100.5 && <span className="over-flag" />}
              </div>
            );
          })}
        </div>
        <AnimatePresence>
          {hover != null && weeks[hover] && (
            <motion.div
              key="tip"
              className="wchart-tip"
              style={{ left: `${((hover + 0.5) / weeks.length) * 100}%` }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <div className="row" style={{ marginBottom: 4 }}>
                <b>Week {hover + 1}</b>
                <span className="faint">{formatAbsWeek(weeks[hover].absWeek)}</span>
                <span className="spacer" />
                <LoadChip pct={weeks[hover].total} />
              </div>
              {weeks[hover].items.map((it, k) => (
                <div key={k} className="row tiny" style={{ gap: 6 }}>
                  <span className={it.kind === 'disruption' ? 'hatch-sq' : 'swatch-sq'} style={{ background: it.kind === 'project' ? colorOf.get(it.id) : undefined }} />
                  <span className="ellipsis" style={{ flex: 1 }}>{it.kind === 'project' ? names.get(it.id) : disruptionNames.get(it.id) ?? 'Disruption'}</span>
                  <span className="num">{Math.round(it.pct)}%</span>
                </div>
              ))}
              {!weeks[hover].items.length && <span className="tiny faint">Free week</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="wchart-axis" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((_, i) => (
          <span key={i} className={hover === i ? 'on' : ''}>W{i + 1}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Editable timeline of this designer's work: drag a bar to move it, drag an
 * end to change duration, click to open, or focus and use arrow keys
 * (Shift = duration). Shows the quarter plus two weeks of spill-over.
 */
function MiniTimeline({
  entries, qStart, colorOf, designerId, dmap,
}: { entries: Entry[]; qStart: number; colorOf: Map<ID, string>; designerId: ID; dmap: Record<ID, Designer> }) {
  const AFTER = 2;
  const n = WEEKS_PER_QUARTER + AFTER;
  const updateSchedule = useStore((st) => st.updateSchedule);
  const phaseOf = usePhase();
  const nowIdx = utcToAbsWeek(Date.now()) - qStart;
  const { drag, effective, onPointerDown, onKeyDown } = useBarDrag({
    weeks: n,
    trackSelector: '.mini-tl-track',
    onCommit: (id, patch) => updateSchedule(id, patch),
    onClick: openProject,
  });
  const cols = `repeat(${n}, 1fr)`;
  return (
    <div className="mini-tl">
      <div className="mini-tl-row head">
        <span />
        <div className="mini-tl-head" style={{ gridTemplateColumns: cols }}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={`${i === nowIdx ? 'now' : ''} ${i >= WEEKS_PER_QUARTER ? 'after' : ''}`} title={formatAbsWeek(qStart + i, true)}>
              {i >= WEEKS_PER_QUARTER ? `+${i - WEEKS_PER_QUARTER + 1}` : i + 1}
            </span>
          ))}
        </div>
      </div>
      {entries.map((e, i) => {
        const s = effective(e.project.id, e.schedule);
        const l = Math.max(0, s.startWeek);
        const r = Math.min(n, s.startWeek + s.duration);
        const color = colorOf.get(e.project.id) ?? 'var(--text-3)';
        const pairing = s.designerId !== designerId;
        const dragging = drag?.id === e.project.id;
        return (
          <div key={e.project.id} className="mini-tl-row">
            <button className="mini-tl-label ellipsis" onClick={() => openProject(e.project.id)} title={e.project.name}>{e.project.name}</button>
            <div className="mini-tl-track">
              <div className="mini-tl-grid" style={{ gridTemplateColumns: cols }}>
                {Array.from({ length: n }, (_, k) => <span key={k} className={`${k === nowIdx ? 'now' : ''} ${k >= WEEKS_PER_QUARTER ? 'after' : ''}`} />)}
              </div>
              {r > l && (
                <motion.div
                  role="button"
                  tabIndex={0}
                  aria-label={`${barLabel({
                    name: e.project.name,
                    designer: dmap[s.designerId ?? '']?.name,
                    pair: s.pairDesignerId ? dmap[s.pairDesignerId]?.name : undefined,
                    allocation: s.allocation,
                    confirmed: s.confirmed,
                    phase: phaseOf(e),
                    range: formatWeekRange(qStart + s.startWeek, s.duration),
                  })}. Drag to move, arrow keys to nudge.`}
                  className={`mini-tl-bar ${s.confirmed ? '' : 'unconfirmed'} ${pairing ? 'pairing' : ''} ${dragging ? 'dragging' : ''}`}
                  style={{ left: `${(l / n) * 100}%`, width: `${((r - l) / n) * 100}%`, '--c': color, transformOrigin: 'left' } as React.CSSProperties}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ delay: 0.05 + i * 0.04, duration: 0.4, ease: ease.out }}
                  onPointerDown={(ev) => onPointerDown(ev, e.project.id, e.schedule, 'move')}
                  onKeyDown={(ev) => onKeyDown(ev, e.project.id, e.schedule)}
                  title={`${e.project.name} · ${phaseOf(e)} · ${formatWeekRange(qStart + s.startWeek, s.duration)}${pairing ? ` · pairing with ${dmap[s.designerId ?? '']?.name ?? '—'}` : ''}`}
                >
                  <span className="handle l" onPointerDown={(ev) => onPointerDown(ev, e.project.id, e.schedule, 'l')} />
                  <span className="ellipsis">{dragging ? formatWeekRange(qStart + s.startWeek, s.duration) : `${s.allocation}%`}</span>
                  {s.milestones.map((m) => (
                    <span key={m.id} className="milestone" style={{ left: `${((m.offset + 0.5) / s.duration) * 100}%` }} />
                  ))}
                  <span className="handle r" onPointerDown={(ev) => onPointerDown(ev, e.project.id, e.schedule, 'r')} />
                </motion.div>
              )}
            </div>
          </div>
        );
      })}
      <span className="tiny faint" style={{ marginTop: 4 }}>Drag bars to reschedule, drag an edge to change duration. Focus a bar and use ←/→ (Shift to resize).</span>
    </div>
  );
}

function MixBars({ title, rows, color }: { title: string; rows: [string, number][]; color: string }) {
  const total = rows.reduce((a, [, v]) => a + v, 0);
  if (!total) return null;
  return (
    <div className="col" style={{ gap: 6 }}>
      <span className="label">{title}</span>
      {rows.map(([k, v]) => (
        <div key={k} className="mix-row">
          <span className="small ellipsis">{k}</span>
          <div className="share-bar">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(v / total) * 100}%` }} transition={{ duration: 0.5, ease: ease.out }} style={{ background: color }} />
          </div>
          <span className="tiny faint num" style={{ width: 44, textAlign: 'right' }}>{v.toFixed(1)}w</span>
        </div>
      ))}
    </div>
  );
}

interface Insight { tone: 'over' | 'ok' | 'info'; text: string }

function weekRanges(idxs: number[]): string {
  const out: string[] = [];
  let start = idxs[0];
  for (let i = 1; i <= idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) {
      const end = idxs[i - 1];
      out.push(start === end ? `W${start + 1}` : `W${start + 1}–${end + 1}`);
      start = idxs[i];
    }
  }
  return out.join(', ');
}

function buildInsights(designer: Designer, weeks: WeekLoad[], mine: Entry[], dmap: Record<ID, Designer>, free: number): Insight[] {
  const out: Insight[] = [];
  const first = designer.name.split(' ')[0];
  const overIdx = weeks.map((w, i) => (w.total > 100.5 ? i : -1)).filter((i) => i >= 0);
  if (overIdx.length) {
    const worst = weeks.reduce((a, w, i) => (w.total > weeks[a].total ? i : a), 0);
    const reasons = weeks[worst].items.length;
    out.push({ tone: 'over', text: `Over capacity in ${weekRanges(overIdx)}. Worst is W${worst + 1} at ${Math.round(weeks[worst].total)}% across ${reasons} commitments.` });
  } else {
    out.push({ tone: 'ok', text: `${first} stays at or under 100% every week this quarter.` });
  }
  const lightIdx = weeks.map((w, i) => (w.total < 50 ? i : -1)).filter((i) => i >= 0);
  if (lightIdx.length) out.push({ tone: 'info', text: `Room for more work in ${weekRanges(lightIdx)} (under 50% load) — about ${free.toFixed(1)} free person-weeks overall.` });
  const tentative = mine.filter((e) => e.schedule.designerId === designer.id && !e.schedule.confirmed);
  if (tentative.length) out.push({ tone: 'info', text: `${tentative.length} assignment${tentative.length > 1 ? 's are' : ' is'} still tentative: ${tentative.slice(0, 3).map((e) => e.project.name).join(', ')}${tentative.length > 3 ? '…' : ''}.` });
  const p0 = mine.filter((e) => e.project.priority === 'P0' || e.project.priority === 'P1');
  if (p0.length) out.push({ tone: 'info', text: `Carrying ${p0.length} high-priority (P0/P1) item${p0.length > 1 ? 's' : ''}.` });
  const partners = new Set(
    mine.flatMap((e) => [e.schedule.designerId, e.schedule.pairDesignerId]).filter((id): id is string => !!id && id !== designer.id),
  );
  if (partners.size) out.push({ tone: 'info', text: `Pairs with ${[...partners].map((id) => dmap[id]?.name.split(' ')[0]).filter(Boolean).join(', ')}.` });
  const longest = mine.slice().sort((a, b) => b.schedule.duration - a.schedule.duration)[0];
  if (longest && longest.schedule.startWeek + longest.schedule.duration > WEEKS_PER_QUARTER)
    out.push({ tone: 'info', text: `${longest.project.name} runs past the end of the quarter.` });
  return out;
}

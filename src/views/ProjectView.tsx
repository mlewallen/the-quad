import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CalendarRange, Diamond, Flag, Layers, ListChecks, Plus, RotateCcw, Users, X,
} from 'lucide-react';
import { uid, useStore } from '../store';
import {
  navigate, useDesignerMap, useDesigners, useProjectPlan, useRoute, useWorkspace, useWorkspaceDisruptions, useWorkspaceEntries, VIEWS, type ProjectPlan,
} from '../hooks';
import type { Milestone, MilestoneKind, PhaseStep, Project } from '../types';
import { PRIORITIES, SIZES, WEEKS_PER_QUARTER } from '../types';
import { computeLoad } from '../lib/capacity';
import { effortWeeks } from '../lib/curves';
import { ease, readableOn, staggerChild, staggerParent } from '../lib/motion';
import { formatAbsWeek, formatWeekRange, quarterLabel, quarterStartAbsWeek, utcToAbsWeek } from '../lib/quarters';
import { defaultPhasePlan, effortFor, gaSlipWeeks, phaseSegments, recommendedDurationForCurve, weeksIntoSchedule, currentPhase } from '../lib/sizing';
import { toast } from '../feedback';
import { WeekPicker } from '../components/WeekPicker';
import { LoadChart } from '../components/ProjectDetail';
import { Checkbox, NumberField, Select } from '../components/inputs';
import { DesignerSelect, EmptyState, Field, PriorityChip, Slider, TextInput } from '../components/ui';

const KIND_LABEL: Record<MilestoneKind, string> = { deliver: 'Designer delivers', input: 'Designer gives input' };

/**
 * A project's own plan, the reverse of the designer view: the phases the
 * designer works through and when, the milestones they owe or feed into, and
 * the people on it. Works the same for this quarter, later quarters and
 * unscheduled backlog work, so a manager and PM can plan ahead of the quarter.
 */
export default function ProjectView({ id }: { id: string }) {
  const plan = useProjectPlan(id);
  const route = useRoute();
  const back = VIEWS.find((v) => v.id === route.view);
  const goBack = () => navigate({ project: null, page: false });

  if (!plan) {
    return (
      <div className="view">
        <EmptyState icon={Layers} title="This project isn’t here" action={<button className="btn" onClick={goBack}><ArrowLeft size={14} /> Back</button>}>
          It may have been deleted, or belongs to another workspace.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="view project-view">
      <div className="row">
        <button className="btn sm ghost" onClick={goBack}><ArrowLeft size={14} /> {back ? back.label : 'Back'}</button>
      </div>
      <Hero plan={plan} />
      <div className="pv-grid">
        <div className="col" style={{ gap: 16, minWidth: 0 }}>
          <PhaseTimeline plan={plan} />
          <Milestones plan={plan} />
        </div>
        <motion.aside className="col" style={{ gap: 16, minWidth: 0 }} variants={staggerParent} initial="initial" animate="animate">
          <People plan={plan} />
          <DesignerLoad plan={plan} />
          <Context project={plan.project} />
        </motion.aside>
      </div>
    </div>
  );
}

/* ---------- hero ---------- */

function useWhen(plan: ProjectPlan) {
  const q = useStore((s) => s.currentQuarter);
  const { project: p, schedule: s, startAbs } = plan;
  if (startAbs == null) return { label: 'Unscheduled', tone: '', range: `${s.duration} weeks, not scheduled yet` };
  return {
    label: p.quarter === q ? 'This quarter' : quarterLabel(p.quarter!),
    tone: p.quarter === q ? 'accent' : '',
    range: formatWeekRange(startAbs, s.duration),
  };
}

function Hero({ plan }: { plan: ProjectPlan }) {
  const { project: p, schedule: s, startAbs, update } = plan;
  const workspace = useWorkspace()!;
  const labels = workspace.config.labels;
  const dmap = useDesignerMap();
  const sm = useStore((st) => st.settings.fiscalStartMonth);
  const q = useStore((st) => st.currentQuarter);
  const { updateProject, moveToQuarter } = useStore.getState();
  const when = useWhen(plan);
  const designer = s.designerId ? dmap[s.designerId] : undefined;
  const color = designer?.color ?? 'var(--accent)';
  const weeksIn = startAbs == null ? null : weeksIntoSchedule(p, s, sm);
  const phase = weeksIn == null ? null : currentPhase(workspace.config.phases, s, weeksIn);
  const progress =
    weeksIn == null || !phase ? null
    : s.phaseOverride ? `Now: ${phase} (pinned)`
    : weeksIn < 0 ? `Starts in ${Math.ceil(-weeksIn)} wk${Math.ceil(-weeksIn) === 1 ? '' : 's'}`
    : weeksIn >= s.duration ? 'Design done'
    : `Now: ${phase}`;
  const slip = gaSlipWeeks(p, s, sm);
  const needed = recommendedDurationForCurve(p.workType, p.size, s.allocation, s.curve);
  const planned = effortWeeks(s.curve, s.duration, s.allocation);
  const deliver = s.milestones.filter((m) => m.kind === 'deliver').length;
  const up = (patch: Partial<Project>) => updateProject(p.id, patch);

  const quarterOptions = [
    { value: -1, label: 'Unscheduled', hint: 'backlog' },
    ...[0, 1, 2, 3].map((k) => ({ value: q + k, label: quarterLabel(q + k), hint: k === 0 ? 'this quarter' : undefined })),
    ...(p.quarter != null && (p.quarter < q || p.quarter > q + 3) ? [{ value: p.quarter, label: quarterLabel(p.quarter) }] : []),
  ];

  return (
    <motion.section className="card pv-hero" style={{ '--dc': color } as CSSProperties} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.out } }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {p.epic && <span className="chip accent">Epic</span>}
        <span className={`chip ${when.tone}`}>{when.label}</span>
        {progress && <span className="chip">{progress}</span>}
        {s.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip">Tentative</span>}
        {slip != null && slip > 0 && <span className="chip over"><AlertTriangle size={11} /> Design ends {slip} wk{slip > 1 ? 's' : ''} after {labels.gaTarget}</span>}
      </div>
      <h2 className="pv-title">
        <TextInput className="hero-name" value={p.name} ariaLabel={`${labels.initiative} name`} onCommit={(v) => v.trim() && up({ name: v.trim() })} />
      </h2>
      <div className="row small muted" style={{ gap: 6, flexWrap: 'wrap' }}>
        <CalendarRange size={14} aria-hidden /> {when.range}
        {designer && <>· {designer.name}{s.pairDesignerId && dmap[s.pairDesignerId] ? ` with ${dmap[s.pairDesignerId].name}` : ''}</>}
        {p.pm && <>· PM {p.pm}</>}
      </div>

      <div className="pv-fields">
        <Field label={`${labels.ticket} (epic)`}>
          <TextInput value={p.ticket} onCommit={(v) => up({ ticket: v.trim() })} placeholder="e.g. DSN-101" ariaLabel={`${labels.ticket} for the epic`} />
        </Field>
        <Field label="Quarter">
          <Select
            value={p.quarter ?? -1}
            options={quarterOptions}
            ariaLabel="Quarter"
            onChange={(v) => {
              moveToQuarter([p.id], v < 0 ? null : v);
              toast(v < 0 ? `${p.name} moved to unscheduled` : `${p.name} planned for ${quarterLabel(v)}`, { tone: 'success' });
            }}
          />
        </Field>
        <Field label="Start week">
          {startAbs == null ? (
            <span className="small faint pv-static">Set when it’s planned into a quarter</span>
          ) : (
            <WeekPicker
              value={startAbs}
              min={quarterStartAbsWeek(p.quarter!, sm) - WEEKS_PER_QUARTER}
              max={quarterStartAbsWeek(p.quarter!, sm) + WEEKS_PER_QUARTER * 2 - 1}
              onChange={(w) => update({ startWeek: w - quarterStartAbsWeek(p.quarter!, sm) })}
              ariaLabel="Start week"
            />
          )}
        </Field>
        <Field label={labels.gaTarget}>
          <WeekPicker
            value={p.gaTargetWeek ?? (startAbs ?? utcToAbsWeek(Date.now())) + s.duration}
            label={p.gaTargetWeek == null ? 'Not set' : `Week of ${formatAbsWeek(p.gaTargetWeek, true)}`}
            onChange={(w) => up({ gaTargetWeek: w, gaTargetText: '' })}
            ariaLabel={labels.gaTarget}
          />
        </Field>
        <Field label="Priority">
          <Select value={p.priority} onChange={(v) => up({ priority: v })} ariaLabel="Priority" options={PRIORITIES.map((x) => ({ value: x, label: <PriorityChip p={x} />, text: x }))} />
        </Field>
        <Field label="Size">
          <div className="segmented" role="radiogroup" aria-label="Size">
            {SIZES.map((x) => <button key={x} role="radio" aria-checked={p.size === x} className={p.size === x ? 'on' : ''} onClick={() => up({ size: x })}>{x}</button>)}
          </div>
        </Field>
      </div>

      <motion.div className="kpis pv-kpis" variants={staggerParent} initial="initial" animate="animate">
        <Kpi label="Length" value={`${s.duration} wks`} sub={needed === s.duration ? 'matches the size' : `${p.size} ${p.workType} needs ~${needed}`} tone={s.duration < needed ? 'warn' : undefined} />
        <Kpi label="Effort planned" value={`${planned.toFixed(1)} wks`} sub={`${effortFor(p.workType, p.size)} expected at ${s.allocation}%`} />
        <Kpi label="Phases" value={String(phaseSegments(workspace.config.phases, s).filter((x) => x.weeks > 0).length)} sub={s.phasePlan ? 'custom plan' : 'default split'} />
        <Kpi label="Milestones" value={String(s.milestones.length)} sub={`${deliver} to deliver · ${s.milestones.length - deliver} input`} />
      </motion.div>
    </motion.section>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <motion.div className={`kpi ${tone ?? ''}`} variants={staggerChild}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="tiny faint">{sub}</span>}
    </motion.div>
  );
}

/* ---------- phase timeline ---------- */

function PhaseTimeline({ plan }: { plan: ProjectPlan }) {
  const { project: p, schedule: s, startAbs, update } = plan;
  const workspace = useWorkspace()!;
  const phases = workspace.config.phases;
  const dmap = useDesignerMap();
  const sm = useStore((st) => st.settings.fiscalStartMonth);
  const color = (s.designerId && dmap[s.designerId]?.color) || '#5b5bd6';
  const steps: PhaseStep[] = s.phasePlan ?? defaultPhasePlan(phases, s.duration);
  const n = Math.max(1, s.duration);
  const nowIn = startAbs == null ? null : weeksIntoSchedule(p, s, sm);
  // Only a project that's under way has a current phase to highlight.
  const current = nowIn == null || nowIn < 0 || nowIn >= s.duration ? null : currentPhase(phases, s, nowIn);
  const gaAt = p.gaTargetWeek != null && startAbs != null ? p.gaTargetWeek - startAbs : null;
  const trackRef = useRef<HTMLDivElement>(null);
  // While a bar's edge is dragged, its length is previewed here and committed on release.
  const [preview, setPreview] = useState<{ i: number; weeks: number } | null>(null);

  const shown = steps.map((x, i) => (preview?.i === i ? { ...x, weeks: preview.weeks } : x));
  let cursor = 0;
  const segs = shown.map((x) => {
    const seg = { ...x, start: cursor };
    cursor += x.weeks;
    return seg;
  });
  const cols = Math.max(n, cursor);

  const commit = (next: PhaseStep[]) => update({ phasePlan: next.filter((x) => x.phase.trim()) });
  const setStep = (i: number, patch: Partial<PhaseStep>) => commit(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = steps.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
  };
  const unused = phases.filter((x) => !steps.some((st) => st.phase === x));

  const onEdgeDown = (e: ReactPointerEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    const perWeek = track.getBoundingClientRect().width / cols;
    const startX = e.clientX;
    const orig = steps[i].weeks;
    let last = orig;
    const onMove = (ev: PointerEvent) => {
      last = Math.max(1, orig + Math.round((ev.clientX - startX) / perWeek));
      setPreview({ i, weeks: last });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setPreview(null);
      if (last !== orig) setStep(i, { weeks: last });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onBarKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const weeks = Math.max(1, steps[i].weeks + (e.key === 'ArrowRight' ? 1 : -1));
    if (weeks !== steps[i].weeks) setStep(i, { weeks });
  };

  const weekLabel = (i: number) => (startAbs == null ? `W${i + 1}` : formatAbsWeek(startAbs + i));
  const rangeOf = (start: number, weeks: number) =>
    startAbs == null ? `weeks ${start + 1}–${start + weeks}` : formatWeekRange(startAbs + start, weeks);
  const gridCols = { gridTemplateColumns: `repeat(${cols}, minmax(26px, 1fr))` } as CSSProperties;

  return (
    <section className="card pv-timeline">
      <div className="panel-head">
        <span className="panel-icon"><ListChecks size={15} /></span>
        <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <h2>Phases</h2>
          <span className="tiny faint">Each phase is a task under the epic. Drag a bar’s end, or focus it and use ← →, to change its length.</span>
        </div>
        <span className="chip">{s.phasePlan ? 'Custom plan' : 'Default split'}</span>
        {s.phasePlan && (
          <button className="btn sm ghost" onClick={() => update({ phasePlan: null })} title="Go back to the default split across the project’s length">
            <RotateCcw size={13} /> Reset
          </button>
        )}
        {unused.length > 0 && (
          <Select size="sm" width="auto" value={null} placeholder="Add phase" ariaLabel="Add phase" options={unused.map((x) => ({ value: x, label: x }))} onChange={(v) => commit([...steps, { phase: v, weeks: 1, ticket: '' }])} />
        )}
      </div>

      <div className="pv-tl" style={{ '--c': color } as CSSProperties}>
        <div className="pv-tl-row pv-tl-head">
          <div className="pv-tl-label tiny faint">Phase · task · weeks</div>
          <div className="pv-tl-track" style={gridCols} aria-hidden>
            {Array.from({ length: cols }, (_, i) => (
              <span key={i} className={nowIn != null && Math.floor(nowIn) === i ? 'now' : ''}>
                <b>W{i + 1}</b>{startAbs != null && <>{weekLabel(i)}</>}
              </span>
            ))}
          </div>
        </div>

        <div ref={trackRef} className="pv-tl-body">
          {segs.map((seg, i) => {
            const isNow = seg.phase === current && !s.phaseOverride;
            return (
              <div key={`${seg.phase}-${i}`} className={`pv-tl-row ${isNow ? 'is-now' : ''}`}>
                <div className="pv-tl-label">
                  <div className="row" style={{ gap: 6, minWidth: 0 }}>
                    <span className="pv-step-n" aria-hidden>{i + 1}</span>
                    <b className="small ellipsis" style={{ flex: 1 }}>{seg.phase}</b>
                    {isNow && <span className="chip accent">Now</span>}
                    <span className="row pv-step-actions" style={{ gap: 0 }}>
                      <button className="btn sm ghost icon" aria-label={`Move ${seg.phase} earlier`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                      <button className="btn sm ghost icon" aria-label={`Move ${seg.phase} later`} disabled={i === segs.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                      <button className="btn sm ghost icon danger" aria-label={`Remove ${seg.phase}`} disabled={segs.length < 2} onClick={() => commit(steps.filter((_, j) => j !== i))}><X size={13} /></button>
                    </span>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <TextInput className="input sm mono pv-ticket" value={seg.ticket} placeholder="Task key" ariaLabel={`Task key for ${seg.phase}`} onCommit={(v) => setStep(i, { ticket: v.trim() })} />
                    <div style={{ width: 96, flex: 'none' }}>
                      <NumberField size="sm" value={steps[i].weeks} min={1} max={52} suffix="wk" ariaLabel={`${seg.phase} length in weeks`} onChange={(v) => setStep(i, { weeks: v })} />
                    </div>
                  </div>
                </div>
                <div className="pv-tl-track" style={gridCols}>
                  {Array.from({ length: cols }, (_, k) => <span key={k} className="pv-cell" />)}
                  {seg.weeks > 0 && (
                    <div
                      className="pv-bar"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => onBarKey(e, i)}
                      aria-label={`${seg.phase}${seg.ticket ? ` (${seg.ticket})` : ''}, ${rangeOf(seg.start, seg.weeks)}, ${seg.weeks} week${seg.weeks === 1 ? '' : 's'}${isNow ? ', current phase' : ''}. Left and right arrow keys change its length.`}
                      style={{
                        left: `${(seg.start / cols) * 100}%`, width: `${(seg.weeks / cols) * 100}%`,
                        background: color, color: readableOn(color), opacity: 0.55 + 0.45 * ((i + 1) / segs.length),
                      }}
                    >
                      <span className="ellipsis">{seg.ticket ? `${seg.ticket} · ` : ''}{seg.weeks}w</span>
                      <span className="pv-bar-edge" onPointerDown={(e) => onEdgeDown(e, i)} aria-hidden />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="pv-tl-row pv-ms-row">
            <div className="pv-tl-label small"><Diamond size={13} aria-hidden /> Milestones</div>
            <div className="pv-tl-track" style={gridCols}>
              {Array.from({ length: cols }, (_, k) => <span key={k} className="pv-cell" />)}
              {s.milestones.map((m) => (
                <span
                  key={m.id}
                  className={`pv-ms kind-${m.kind}`}
                  style={{ left: `${((Math.min(cols - 1, m.offset) + 0.5) / cols) * 100}%` }}
                  title={`${m.type} · ${KIND_LABEL[m.kind]} · ${weekLabel(Math.floor(m.offset))}${m.note ? ` — ${m.note}` : ''}`}
                >
                  <Diamond size={13} fill={m.kind === 'deliver' ? 'currentColor' : 'none'} aria-hidden />
                  <span className="pv-ms-label">{m.type}</span>
                </span>
              ))}
            </div>
          </div>

          {nowIn != null && nowIn >= 0 && nowIn < cols && <div className="pv-now" style={{ '--x': nowIn / cols } as CSSProperties} aria-hidden><span>Today</span></div>}
          {gaAt != null && gaAt >= 0 && gaAt < cols && <div className="pv-ga" style={{ '--x': (gaAt + 0.5) / cols } as CSSProperties} aria-hidden><span><Flag size={10} /> GA</span></div>}
        </div>
      </div>
    </section>
  );
}

/* ---------- milestones ---------- */

function Milestones({ plan }: { plan: ProjectPlan }) {
  const { schedule: s, startAbs, update } = plan;
  const workspace = useWorkspace()!;
  const types = workspace.config.milestoneTypes;
  const sorted = s.milestones.slice().sort((a, b) => a.offset - b.offset);
  const upd = (id: string, patch: Partial<Milestone>) => update({ milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const add = (kind: MilestoneKind) => {
    const used = new Set(s.milestones.map((m) => m.type));
    const type = types.find((t) => !used.has(t)) ?? types[0] ?? 'Milestone';
    update({ milestones: [...s.milestones, { id: uid(), type, offset: Math.max(0, s.duration - 1), note: '', kind }] });
  };
  const weekOptions = Array.from({ length: s.duration }, (_, i) => ({ value: i, label: startAbs == null ? `Week ${i + 1}` : `Week ${i + 1} · ${formatAbsWeek(startAbs + i)}` }));

  return (
    <section className="card">
      <div className="panel-head">
        <span className="panel-icon"><Diamond size={15} /></span>
        <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <h2>Milestones</h2>
          <span className="tiny faint">What the designer owes, and where they give input to the PM or engineering.</span>
        </div>
        <button className="btn sm" onClick={() => add('deliver')}><Plus size={13} /> Deliverable</button>
        <button className="btn sm" onClick={() => add('input')}><Plus size={13} /> Input</button>
      </div>
      <div className="col" style={{ gap: 0, padding: '0 16px 12px' }}>
        {sorted.map((m) => (
          <div key={m.id} className="pv-ms-edit">
            <Diamond size={14} className={`pv-ms-icon kind-${m.kind}`} fill={m.kind === 'deliver' ? 'currentColor' : 'none'} aria-hidden />
            <Select size="sm" width={130} value={m.type} ariaLabel="Milestone type" onChange={(v) => upd(m.id, { type: v })} options={[...(types.includes(m.type) ? [] : [m.type]), ...types].map((t) => ({ value: t, label: t }))} />
            <Select size="sm" width={170} value={m.kind} ariaLabel={`Who for ${m.type}`} onChange={(v) => upd(m.id, { kind: v })} options={(['deliver', 'input'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            <Select size="sm" width={startAbs == null ? 110 : 160} value={Math.min(s.duration - 1, Math.floor(m.offset))} ariaLabel={`Week for ${m.type}`} onChange={(v) => upd(m.id, { offset: v })} options={weekOptions} />
            <TextInput className="input sm" value={m.note} placeholder="What’s expected" ariaLabel={`Note for ${m.type}`} onCommit={(v) => upd(m.id, { note: v })} />
            <button className="btn icon ghost sm" aria-label={`Remove ${m.type}`} onClick={() => update({ milestones: s.milestones.filter((x) => x.id !== m.id) })}><X size={14} /></button>
          </div>
        ))}
        {!sorted.length && <p className="small faint" style={{ margin: '4px 0' }}>No milestones yet. Add what the designer should deliver, and the reviews they should feed into.</p>}
      </div>
    </section>
  );
}

/* ---------- side cards ---------- */

function People({ plan }: { plan: ProjectPlan }) {
  const { project: p, schedule: s, update } = plan;
  const designers = useDesigners();
  const labels = useWorkspace()!.config.labels;
  const up = (patch: Partial<Project>) => useStore.getState().updateProject(p.id, patch);
  const dmap = useDesignerMap();
  return (
    <motion.section className="card card-pad col" style={{ gap: 12 }} variants={staggerChild}>
      <div className="row"><Users size={16} style={{ color: 'var(--accent)' }} aria-hidden /><h2>People and effort</h2></div>
      <Field label="Designer">
        <DesignerSelect designers={designers} value={s.designerId} onChange={(v) => update({ designerId: v })} ariaLabel="Designer" />
      </Field>
      <Field label="Pair designer">
        <DesignerSelect designers={designers.filter((d) => d.id !== s.designerId)} value={s.pairDesignerId} onChange={(v) => update({ pairDesignerId: v })} noneLabel="None" ariaLabel="Pair designer" />
      </Field>
      <div className="field">
        <div className="row"><label className="label">Max allocation</label><span className="spacer" /><b className="num">{s.allocation}%</b></div>
        <Slider value={s.allocation} min={5} max={100} step={5} onChange={(v) => update({ allocation: v })} ariaLabel="Max allocation" format={(v) => `${v}%`} color={s.designerId ? dmap[s.designerId]?.color : undefined} marks={[50]} />
      </div>
      <Checkbox className="small" checked={s.confirmed} disabled={!s.designerId} onChange={(v) => update({ confirmed: v })}>
        Confirmed with the designer {!s.designerId && <span className="faint">(assign first)</span>}
      </Checkbox>
      <div className="grid2">
        <Field label={labels.pm}><TextInput value={p.pm} onCommit={(v) => up({ pm: v })} ariaLabel={labels.pm} /></Field>
        <Field label={labels.em}><TextInput value={p.em} onCommit={(v) => up({ em: v })} ariaLabel={labels.em} /></Field>
      </div>
    </motion.section>
  );
}

function DesignerLoad({ plan }: { plan: ProjectPlan }) {
  const { project: p, schedule: s, startAbs } = plan;
  const dmap = useDesignerMap();
  const entries = useWorkspaceEntries();
  const disruptions = useWorkspaceDisruptions();
  const sm = useStore((st) => st.settings.fiscalStartMonth);
  const designer = s.designerId ? dmap[s.designerId] : undefined;
  const weeks = useMemo(
    () => (designer && startAbs != null ? computeLoad(entries, disruptions, [designer.id], startAbs, s.duration, sm)[designer.id] : null),
    [designer, startAbs, entries, disruptions, s.duration, sm],
  );
  const over = weeks?.filter((w) => w.total > 100.5).length ?? 0;
  return (
    <motion.section className="card card-pad col" style={{ gap: 8 }} variants={staggerChild}>
      <div className="row">
        <h2>{designer ? `${designer.name}’s load` : 'Designer load'}</h2>
        <span className="spacer" />
        {over > 0 && <span className="chip over">{over} wk{over > 1 ? 's' : ''} over</span>}
      </div>
      {!designer && <p className="small faint" style={{ margin: 0 }}>Pick a designer to see how this fits their other work.</p>}
      {designer && startAbs == null && <p className="small faint" style={{ margin: 0 }}>Plan it into a quarter to check it against {designer.name}’s other work.</p>}
      {designer && weeks && <LoadChart weeks={weeks} thisWeekly={[]} projectId={p.id} color={designer.color} startWeek={s.startWeek} />}
    </motion.section>
  );
}

function Context({ project: p }: { project: Project }) {
  const labels = useWorkspace()!.config.labels;
  const up = (patch: Partial<Project>) => useStore.getState().updateProject(p.id, patch);
  return (
    <motion.section className="card card-pad col" style={{ gap: 12 }} variants={staggerChild}>
      <h2>Context</h2>
      <Field label={labels.goal}><TextInput value={p.goal} onCommit={(v) => up({ goal: v })} ariaLabel={labels.goal} /></Field>
      <Field label={labels.productArea}><TextInput value={p.productArea} onCommit={(v) => up({ productArea: v })} ariaLabel={labels.productArea} /></Field>
      <Field label={labels.reference}><TextInput value={p.reference} onCommit={(v) => up({ reference: v })} placeholder="Link or doc" ariaLabel={labels.reference} /></Field>
      <Field label="Notes">
        <textarea key={p.notes} className="textarea" defaultValue={p.notes} placeholder="Context, decisions, links…" aria-label="Notes" onBlur={(e) => e.target.value !== p.notes && up({ notes: e.target.value })} />
      </Field>
    </motion.section>
  );
}


import { useMemo } from 'react';
import { AlertTriangle, CalendarRange, Diamond, Maximize2, PanelRight, Plus, SquareStack, Trash2, Undo2, WandSparkles, X } from 'lucide-react';
import { confirmDialog, toast } from '../feedback';
import { readableOn } from '../lib/motion';
import { uid, useStore } from '../store';
import {
  closeProject, navigate, useDesignerMap, useDesigners, useEntry, useQuarterStart, useWorkspace, useWorkspaceDisruptions, useWorkspaceEntries,
} from '../hooks';
import type { DetailMode, Milestone, Project, Schedule } from '../types';
import { PRIORITIES, SIZES, WEEKS_PER_QUARTER } from '../types';
import { computeLoad, loadLevel } from '../lib/capacity';
import { effortWeeks, weeklyAllocation } from '../lib/curves';
import { formatAbsWeek, formatWeekRange } from '../lib/quarters';
import { WeekPicker } from './WeekPicker';
import { effortFor, gaSlipWeeks, phaseAt, phaseBreakdown, recommendedDurationForCurve, weeksIntoSchedule } from '../lib/sizing';
import CurveEditor from './CurveEditor';
import { DesignerSelect, Field, PriorityChip, Section, Slider, TextInput, useFocusTrap } from './ui';
import { Checkbox, NumberField, Select } from './inputs';

export default function ProjectDetail({ id, mode }: { id: string; mode: DetailMode }) {
  const entry = useEntry(id);
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const qStart = useQuarterStart();
  const updateProject = useStore((s) => s.updateProject);
  const updateSchedule = useStore((s) => s.updateSchedule);
  const deleteProjects = useStore((s) => s.deleteProjects);
  const moveToQuarter = useStore((s) => s.moveToQuarter);
  const setMode = useStore((s) => s.updateSettings);
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const allEntries = useWorkspaceEntries();
  const disruptions = useWorkspaceDisruptions();
  // A modal's focus is handled by <Modal>; the side panel and page aren't modal, so only move focus in and back.
  const focusRef = useFocusTrap<HTMLDivElement>({ trap: false, initial: 'container' });

  const schedule = entry?.schedule;
  const designerLoad = useMemo(() => {
    if (!schedule?.designerId) return null;
    const from = qStart + schedule.startWeek;
    return computeLoad(allEntries, disruptions, [schedule.designerId], from, schedule.duration, sm)[schedule.designerId];
  }, [allEntries, disruptions, schedule, qStart, sm]);

  if (!entry) {
    return (
      <div className="card-pad col" ref={focusRef}>
        <div className="row">
          <h2>Not found</h2>
          <span className="spacer" />
          <button className="btn icon ghost" onClick={closeProject} aria-label="Close"><X size={16} /></button>
        </div>
        <p className="muted">This item isn't in the current quarter's active plan. It may belong to another quarter or workspace, or was deleted.</p>
      </div>
    );
  }

  const { project: p, schedule: s } = entry;
  const labels = workspace.config.labels;
  const up = (patch: Partial<Project>) => updateProject(p.id, patch);
  const us = (patch: Partial<Schedule>) => updateSchedule(p.id, patch);
  const designer = s.designerId ? dmap[s.designerId] : undefined;
  const color = designer?.color ?? 'var(--text-3)';

  const recommended = recommendedDurationForCurve(p.workType, p.size, s.allocation, s.curve);
  const delta = s.duration - recommended;
  const phases = phaseBreakdown(workspace.config.phases, s.duration);
  const autoPhase = phaseAt(workspace.config.phases, s.duration, weeksIntoSchedule(p, s, sm));
  const phase = s.phaseOverride || autoPhase;
  const slip = gaSlipWeeks(p, s, sm);
  const thisWeekly = weeklyAllocation(s.curve, s.duration, s.allocation);
  const overWeeks = designerLoad?.filter((w) => w.total > 100.5).length ?? 0;

  const switchMode = (m: DetailMode) => {
    setMode({ detailMode: m });
    navigate({ project: p.id, page: m === 'page' });
  };

  /** Week label relative to the viewed quarter, e.g. "Wk 3 · Oct 26". */
  const weekLabel = (w: number) =>
    `${w >= 0 && w < WEEKS_PER_QUARTER ? `Wk ${w + 1}` : w < 0 ? `Prev Q wk ${w + WEEKS_PER_QUARTER + 1}` : `Next Q wk ${w - WEEKS_PER_QUARTER + 1}`} · ${formatAbsWeek(qStart + w)}`;

  const addMilestone = () => {
    const used = new Set(s.milestones.map((m) => m.type));
    const type = workspace.config.milestoneTypes.find((t) => !used.has(t)) ?? workspace.config.milestoneTypes[0] ?? 'Milestone';
    us({ milestones: [...s.milestones, { id: uid(), type, offset: Math.max(0, s.duration - 1), note: '' }] });
  };
  const updMilestone = (mid: string, patch: Partial<Milestone>) =>
    us({ milestones: s.milestones.map((m) => (m.id === mid ? { ...m, ...patch } : m)) });

  return (
    <div ref={focusRef} aria-label={`${labels.initiative}: ${p.name}`} role="region" className="detail-root">
      <div className="detail-head">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="dot" style={{ background: color }} />
          <span className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{labels.initiative}</span>
          {s.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip">Tentative</span>}
          <span className="spacer" />
          <div className="segmented" aria-label="Detail layout">
            {(['panel', 'modal', 'page'] as DetailMode[]).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => switchMode(m)} title={`Open as ${m}`} aria-label={`Open as ${m}`}>
                {m === 'panel' ? <PanelRight size={14} /> : m === 'modal' ? <SquareStack size={14} /> : <Maximize2 size={14} />}
              </button>
            ))}
          </div>
          <button className="btn icon ghost sm" onClick={closeProject} aria-label="Close"><X size={16} /></button>
        </div>
        <TextInput className="detail-title" value={p.name} onCommit={(v) => up({ name: v.trim() || p.name })} />
        <div className="small faint" style={{ marginTop: 2 }}>
          {designer ? designer.name : 'Unassigned'} · {formatWeekRange(qStart + s.startWeek, s.duration)} · {s.allocation}% max
        </div>
      </div>

      <div className="sections">
        <div>
          <Section title="Project">
            <div className="grid2">
              <Field label={labels.ticket}>
                <TextInput value={p.ticket} onCommit={(v) => up({ ticket: v })} placeholder="ABC-123" />
              </Field>
              <Field label={labels.reference}>
                <TextInput value={p.reference} onCommit={(v) => up({ reference: v })} placeholder="Link or doc" />
              </Field>
            </div>
            {/^https?:\/\//.test(p.reference) && (
              <a className="small" href={p.reference} target="_blank" rel="noreferrer">Open reference ↗</a>
            )}
            <div className="row" style={{ gap: 18 }}>
              <Checkbox className="small" checked={s.confirmed} disabled={!s.designerId} onChange={(v) => us({ confirmed: v })}>
                Confirmed assignment {!s.designerId && <span className="faint">(assign first)</span>}
              </Checkbox>
              <Checkbox className="small" checked={p.epic} onChange={(v) => up({ epic: v })}>Epic</Checkbox>
            </div>
          </Section>

          <Section title="Assignment">
            <div className="grid2">
              <Field label="Primary designer">
                <DesignerSelect designers={designers} value={s.designerId} onChange={(v) => us({ designerId: v })} ariaLabel="Primary designer" />
              </Field>
              <Field label="Pair designer">
                <DesignerSelect designers={designers.filter((d) => d.id !== s.designerId)} value={s.pairDesignerId} onChange={(v) => us({ pairDesignerId: v })} noneLabel="None" ariaLabel="Pair designer" />
              </Field>
            </div>
            {s.pairDesignerId && <span className="tiny faint">Pair designers are counted at half the primary's allocation.</span>}
          </Section>

          <Section title="Status">
            <div className="grid3">
              <Field label="Phase">
                <Select
                  value={s.phaseOverride ?? ''}
                  onChange={(v) => us({ phaseOverride: v || null })}
                  ariaLabel="Phase"
                  describedBy="phase-hint"
                  options={[
                    { value: '', label: `Auto · ${autoPhase}`, hint: 'schedule' },
                    ...(s.phaseOverride && !workspace.config.phases.includes(s.phaseOverride) ? [{ value: s.phaseOverride, label: s.phaseOverride }] : []),
                    ...workspace.config.phases.map((x) => ({ value: x, label: x })),
                  ]}
                />
                <span id="phase-hint" className="tiny faint">
                  {s.phaseOverride ? (
                    <>Set manually. <button className="link-btn" style={{ color: 'var(--accent)' }} onClick={() => us({ phaseOverride: null })}>Follow the schedule</button></>
                  ) : 'Follows the schedule'}
                </span>
              </Field>
              <Field label="Priority">
                <Select value={p.priority} onChange={(v) => up({ priority: v })} ariaLabel="Priority" options={PRIORITIES.map((x) => ({ value: x, label: <PriorityChip p={x} />, text: x }))} />
              </Field>
              <Field label="Work type">
                <Select
                  value={p.workType}
                  onChange={(v) => up({ workType: v })}
                  ariaLabel="Work type"
                  options={[...(workspace.config.workTypes.includes(p.workType) ? [] : [p.workType]), ...workspace.config.workTypes].map((x) => ({ value: x, label: x }))}
                />
              </Field>
            </div>
          </Section>

          <Section title="Schedule & Effort">
            <div className="grid3">
              <Field label="Start week">
                <WeekPicker
                  value={qStart + s.startWeek}
                  label={weekLabel(s.startWeek)}
                  min={qStart - WEEKS_PER_QUARTER}
                  max={qStart + WEEKS_PER_QUARTER * 2 - 1}
                  onChange={(w) => us({ startWeek: w - qStart })}
                  ariaLabel="Start week"
                />
              </Field>
              <Field label="Duration (weeks)">
                <NumberField value={s.duration} min={1} max={52} onChange={(v) => us({ duration: v })} ariaLabel="Duration in weeks" />
              </Field>
              <Field label="Size">
                <div className="segmented">
                  {SIZES.map((x) => (
                    <button key={x} className={p.size === x ? 'on' : ''} onClick={() => up({ size: x })}>{x}</button>
                  ))}
                </div>
              </Field>
            </div>
            <div className="field">
              <div className="row"><label className="label">Max allocation</label><span className="spacer" /><b className="num">{s.allocation}%</b></div>
              <Slider value={s.allocation} min={5} max={100} step={5} onChange={(v) => us({ allocation: v })} ariaLabel="Max allocation" format={(v) => `${v}%`} color={designer?.color} marks={[50]} />
            </div>
            <div className="row small muted">
              <span className="row" style={{ gap: 6 }}><CalendarRange size={14} /> {formatWeekRange(qStart + s.startWeek, s.duration)}</span>
              <span className="spacer" />
              <span>{effortWeeks(s.curve, s.duration, s.allocation).toFixed(1)} effort weeks planned</span>
            </div>
          </Section>

          <Section title="Weekly Allocation Curve">
            <CurveEditor curve={s.curve} duration={s.duration} max={s.allocation} onChange={(curve) => us({ curve })} color={designer?.color} />
          </Section>

          <Section title="Milestones" aside={<span className="chip">{s.milestones.length}</span>}>
            {s.milestones.length === 0 && <span className="small faint">No milestones yet.</span>}
            {s.milestones
              .slice()
              .sort((a, b) => a.offset - b.offset)
              .map((m) => (
                <div key={m.id} className="col" style={{ gap: 4, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <div className="row">
                    <Diamond size={14} style={{ color, flex: 'none' }} fill="currentColor" />
                    <Select
                      size="sm"
                      width="auto"
                      value={m.type}
                      onChange={(v) => updMilestone(m.id, { type: v })}
                      ariaLabel="Milestone type"
                      options={[...(workspace.config.milestoneTypes.includes(m.type) ? [] : [m.type]), ...workspace.config.milestoneTypes].map((t) => ({ value: t, label: t }))}
                    />
                    <WeekPicker
                      size="sm"
                      value={qStart + s.startWeek + Math.floor(m.offset)}
                      label={weekLabel(s.startWeek + Math.floor(m.offset))}
                      min={qStart + s.startWeek}
                      max={qStart + s.startWeek + s.duration - 1}
                      onChange={(w) => updMilestone(m.id, { offset: w - qStart - s.startWeek })}
                      ariaLabel="Milestone week"
                    />
                    <span className="spacer" />
                    <button className="btn icon ghost sm" aria-label="Remove milestone" onClick={() => us({ milestones: s.milestones.filter((x) => x.id !== m.id) })}><X size={14} /></button>
                  </div>
                  <TextInput className="input sm" value={m.note} placeholder="Note (optional)" onCommit={(v) => updMilestone(m.id, { note: v })} />
                </div>
              ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={addMilestone}><Plus size={14} /> Milestone</button>
          </Section>
        </div>

        <div>
          <Section title="Planning Intelligence">
            <div className="intel">
              <div>
                <div className="tiny muted">Recommended duration</div>
                <div className="big">{recommended} wks</div>
              </div>
              <div className="small muted" style={{ flex: 1 }}>
                {p.size} {p.workType} ≈ {effortFor(p.workType, p.size)} effort weeks ÷ {s.allocation}% allocation{s.curve.shape !== 'flat' ? ' (adjusted for curve shape)' : ''}.
                {delta === 0 ? ' Your plan matches.' : delta > 0 ? ` Plan is ${delta} wk${delta > 1 ? 's' : ''} longer.` : ` Plan is ${-delta} wk${delta < -1 ? 's' : ''} shorter — likely under-resourced.`}
              </div>
              {delta !== 0 && (
                <button className="btn sm primary" onClick={() => { us({ duration: recommended }); toast(`Duration set to ${recommended} weeks`, { tone: 'success', action: { label: 'Undo', run: () => us({ duration: s.duration }) } }); }}>
                  <WandSparkles size={14} /> Apply
                </button>
              )}
            </div>
            <div className="col" style={{ gap: 4 }}>
              <span className="label">Phase breakdown</span>
              <div className="phase-line">
                {phases.map((ph, i) => (
                  <div
                    key={ph.phase}
                    style={{
                      width: `${(ph.weeks / s.duration) * 100}%`,
                      background: ph.phase === phase ? designer?.color ?? '#8a8a94' : 'var(--surface-3)',
                      color: ph.phase === phase ? readableOn(designer?.color ?? '#8a8a94') : 'var(--text-2)',
                      opacity: ph.phase === phase ? 1 : 0.6 + (i / phases.length) * 0.4,
                    }}
                    title={`${ph.phase}: ~${ph.weeks.toFixed(1)} wks`}
                  >
                    {ph.phase}
                  </div>
                ))}
              </div>
            </div>
            <div className="col" style={{ gap: 4 }}>
              <div className="row">
                <span className="label">{designer ? `${designer.name}'s load during this window` : 'Designer load'}</span>
                <span className="spacer" />
                {overWeeks > 0 && <span className="chip over">{overWeeks} week{overWeeks > 1 ? 's' : ''} over 100%</span>}
              </div>
              {designerLoad ? (
                <LoadChart weeks={designerLoad} thisWeekly={thisWeekly} projectId={p.id} color={designer!.color} startWeek={s.startWeek} />
              ) : (
                <span className="small faint">Assign a designer to see their load.</span>
              )}
            </div>
          </Section>

          <Section title="Context & Partners">
            <div className="grid2">
              <Field label={labels.goal}><TextInput value={p.goal} onCommit={(v) => up({ goal: v })} /></Field>
              <Field label={labels.gaTarget}>
                <div className="row" style={{ gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <WeekPicker
                      value={p.gaTargetWeek ?? qStart + s.startWeek + s.duration}
                      label={p.gaTargetWeek == null ? 'Not set' : `Week of ${formatAbsWeek(p.gaTargetWeek, true)}`}
                      onChange={(w) => up({ gaTargetWeek: w, gaTargetText: '' })}
                      ariaLabel={labels.gaTarget}
                    />
                  </div>
                  {p.gaTargetWeek != null && (
                    <button className="btn icon ghost sm" aria-label={`Clear ${labels.gaTarget}`} onClick={() => up({ gaTargetWeek: null })}><X size={14} /></button>
                  )}
                </div>
                {p.gaTargetText && p.gaTargetWeek == null && <span className="tiny faint">Previously noted as “{p.gaTargetText}”</span>}
                {slip != null && slip > 0 && (
                  <span className="tiny" style={{ color: 'var(--over)' }}><AlertTriangle size={11} style={{ verticalAlign: -1 }} /> Design ends {slip} wk{slip > 1 ? 's' : ''} after {labels.gaTarget}</span>
                )}
              </Field>
              <Field label={labels.productArea}><TextInput value={p.productArea} onCommit={(v) => up({ productArea: v })} /></Field>
              <div />
              <Field label={labels.pm}><TextInput value={p.pm} onCommit={(v) => up({ pm: v })} /></Field>
              <Field label={labels.em}><TextInput value={p.em} onCommit={(v) => up({ em: v })} /></Field>
            </div>
          </Section>

          <Section title="Notes">
            <NotesField value={p.notes} onCommit={(v) => up({ notes: v })} />
          </Section>

          <div className="card-pad row">
            <span className="tiny faint">Metadata is shared across plans; schedule fields belong to the active plan.</span>
            <span className="spacer" />
            <button
              className="btn sm ghost"
              title="Take it out of this quarter's plans and back into the backlog"
              onClick={async () => {
                const ok = await confirmDialog({ title: `Move “${p.name}” to the backlog?`, body: 'It leaves every plan this quarter, so its designer and dates are cleared. Its details stay.', confirmLabel: 'Move to backlog' });
                if (ok) {
                  closeProject();
                  moveToQuarter([p.id], null);
                  toast(`${p.name} moved to the backlog`);
                }
              }}
            >
              <Undo2 size={13} /> Unschedule
            </button>
            <button
              className="btn sm ghost danger"
              onClick={async () => {
                const ok = await confirmDialog({ title: `Delete “${p.name}”?`, body: 'It will be removed from every plan this quarter.', confirmLabel: 'Delete', destructive: true });
                if (ok) {
                  closeProject();
                  deleteProjects([p.id]);
                  toast(`Deleted ${p.name}`);
                }
              }}
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotesField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <textarea
      key={value}
      className="textarea"
      defaultValue={value}
      placeholder="Context, decisions, links…"
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
    />
  );
}

function LoadChart({
  weeks, thisWeekly, projectId, color, startWeek,
}: { weeks: ReturnType<typeof computeLoad>[string]; thisWeekly: number[]; projectId: string; color: string; startWeek: number }) {
  const max = Math.max(120, ...weeks.map((w) => w.total));
  return (
    <div className="col" style={{ gap: 2 }}>
      <div className="mini-load">
        <div className="cap" style={{ bottom: `${(100 / max) * 100}%` }} />
        {weeks.map((w, i) => {
          const mine = w.items.filter((it) => it.kind === 'project' && it.id === projectId).reduce((a, it) => a + it.pct, 0) || thisWeekly[i] || 0;
          const other = Math.max(0, w.total - mine);
          const lvl = loadLevel(w.total);
          return (
            <div key={i} className="wk" title={`Week ${startWeek + i + 1}: ${Math.round(w.total)}% total (${Math.round(mine)}% this)`}>
              <div className="seg" style={{ height: `${(mine / max) * 100}%`, background: color }} />
              <div className="seg" style={{ height: `${(other / max) * 100}%`, background: lvl === 'over' ? 'var(--over)' : 'var(--border-strong)' }} />
            </div>
          );
        })}
      </div>
      <div className="row tiny faint">
        <span>Wk {startWeek + 1}</span>
        <span className="spacer" />
        <span><span className="dot" style={{ background: color, width: 8, height: 8 }} /> this · <span className="dot" style={{ background: 'var(--border-strong)', width: 8, height: 8 }} /> other work</span>
        <span className="spacer" />
        <span>Wk {startWeek + weeks.length}</span>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowRight, CalendarClock, Check, CircleCheck, Copy, Diamond, Gauge, Inbox, Layers, Pencil, Plus, Sparkles, Trash2,
  Users, Wand2, type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store';
import { confirmDialog, toast } from '../feedback';
import {
  entriesFor, navigate, openDesigner, openProject, useActivePlan, useDesignerMap, useDesigners, useEntries, useLoad, useQuarterPlans,
  useQuarterProjects, useQuarterStart, useWorkspace, useWorkspaceDisruptions,
} from '../hooks';
import type { Designer, Plan } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { computeLoad, loadLevel, summarize, type Entry, type WeekLoad } from '../lib/capacity';
import { formatAbsWeek, quarterLabel, utcToAbsWeek } from '../lib/quarters';
import { gaSlipWeeks } from '../lib/sizing';
import { ease, spring, staggerChild, staggerParent } from '../lib/motion';
import { Avatar, LoadChip } from '../components/ui';

/* ---------- readiness model ---------- */

interface Readiness {
  total: number;
  assigned: number;
  confirmed: number;
  designers: number;
  overloaded: number;
  /** 0..1 per stage */
  stages: { assigned: number; confirmed: number; balanced: number };
  score: number;
}

/** Weighted plan-readiness score: owners first, then commitment, then a sustainable load. */
function readiness(entries: Entry[], load: Record<string, WeekLoad[]>, designers: Designer[]): Readiness {
  const total = entries.length;
  const assigned = entries.filter((e) => e.schedule.designerId).length;
  const confirmed = entries.filter((e) => e.schedule.confirmed).length;
  const overloaded = designers.filter((d) => summarize(load[d.id] ?? []).over > 0).length;
  const stages = {
    assigned: total ? assigned / total : 0,
    confirmed: total ? confirmed / total : 0,
    balanced: designers.length ? 1 - overloaded / designers.length : 0,
  };
  const score = total ? Math.round((stages.assigned * 0.4 + stages.confirmed * 0.3 + stages.balanced * 0.3) * 100) : 0;
  return { total, assigned, confirmed, designers: designers.length, overloaded, stages, score };
}

export default function Home() {
  const designers = useDesigners();
  const entries = useEntries();
  const { load, fromAbs } = useLoad();
  const r = readiness(entries, load, designers);
  return (
    <div className="view home-v2">
      <ReadinessHero r={r} load={load} />
      <div className="home-grid">
        <NextSteps r={r} load={load} entries={entries} className="span-5" />
        <Heatmap load={load} fromAbs={fromAbs} className="span-7" />
        <Scenarios className="span-6" />
        <UpcomingMilestones entries={entries} className="span-6" />
      </div>
    </div>
  );
}

function PanelHead({ icon: Icon, title, sub, aside }: { icon: LucideIcon; title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div className="panel-head">
      <span className="panel-icon"><Icon size={15} /></span>
      <div className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
        <h2>{title}</h2>
        {sub && <span className="tiny faint">{sub}</span>}
      </div>
      {aside}
    </div>
  );
}

/* ---------- hero ---------- */

function ReadinessHero({ r, load }: { r: Readiness; load: Record<string, WeekLoad[]> }) {
  const plan = useActivePlan();
  const q = useStore((s) => s.currentQuarter);
  const qStart = useQuarterStart();
  const designers = useDesigners();
  const labels = useWorkspace()!.config.labels;
  const nowWeek = utcToAbsWeek(Date.now()) - qStart;
  const status =
    !r.total ? { label: 'Empty plan', tone: '' }
    : r.stages.assigned < 1 ? { label: 'Needs owners', tone: 'warn' }
    : r.stages.confirmed < 1 ? { label: 'Needs confirmation', tone: 'warn' }
    : r.overloaded ? { label: 'Needs rebalancing', tone: 'over' }
    : { label: 'Ready to share', tone: 'ok' };

  const allWeeks = designers.flatMap((d) => load[d.id] ?? []);
  const avg = allWeeks.length ? allWeeks.reduce((a, w) => a + w.total, 0) / allWeeks.length : 0;
  const free = allWeeks.reduce((a, w) => a + Math.max(0, 100 - w.total) / 100, 0);

  const timeline =
    nowWeek < 0 ? `Starts in ${-nowWeek} week${nowWeek === -1 ? '' : 's'}`
    : nowWeek >= WEEKS_PER_QUARTER ? 'Quarter complete'
    : `Week ${nowWeek + 1} of ${WEEKS_PER_QUARTER} · ${WEEKS_PER_QUARTER - nowWeek - 1} weeks left`;
  const elapsed = Math.max(0, Math.min(1, (nowWeek + 1) / WEEKS_PER_QUARTER));

  const stages = [
    { key: 'assigned', label: 'Assigned', detail: `${r.assigned}/${r.total} have an owner`, v: r.stages.assigned },
    { key: 'confirmed', label: 'Confirmed', detail: `${r.confirmed}/${r.total} committed`, v: r.stages.confirmed },
    { key: 'balanced', label: 'Balanced', detail: r.overloaded ? `${r.overloaded} designer${r.overloaded > 1 ? 's' : ''} over 100%` : 'No one over capacity', v: r.stages.balanced },
  ] as const;

  return (
    <motion.section className="card hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: ease.out } }}>
      <div className="hero-left">
        <Ring value={r.score} tone={status.tone} />
        <div className="col" style={{ gap: 6, minWidth: 0 }}>
          <span className="hero-eyebrow">{quarterLabel(q)} plan readiness</span>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <h2 className="ellipsis hero-title">{plan?.name ?? 'No plan'}</h2>
            <span className={`chip ${status.tone}`}>{status.label}</span>
          </div>
          <div className="quarter-progress">
            <CalendarClock size={13} />
            <span>{timeline}</span>
            <div className="qp-bar"><motion.div initial={{ width: 0 }} animate={{ width: `${elapsed * 100}%` }} transition={{ duration: 0.8, ease: ease.out }} /></div>
          </div>
        </div>
      </div>

      <div className="stages">
        {stages.map((s, i) => {
          const done = s.v >= 0.999 && r.total > 0;
          return (
            <div key={s.key} className={`stage ${done ? 'done' : ''}`}>
              <div className="row" style={{ gap: 8 }}>
                <span className="stage-dot">{done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                <b className="small">{s.label}</b>
                <span className="spacer" />
                <span className="small num" style={{ fontWeight: 600 }}>{Math.round(s.v * 100)}%</span>
              </div>
              <div className="stage-bar"><motion.div initial={{ width: 0 }} animate={{ width: `${s.v * 100}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.1, ease: ease.out }} /></div>
              <span className="tiny faint">{s.detail}</span>
            </div>
          );
        })}
      </div>

      <motion.div className="hero-kpis" variants={staggerParent} initial="initial" animate="animate">
        <Stat label={labels.initiatives} value={String(r.total)} href="#/projects" linkLabel={`Open ${labels.initiatives}, ${r.total} this quarter`} />
        <Stat label="Team avg load" value={`${Math.round(avg)}%`} tone={loadLevel(avg)} />
        <Stat label="Free capacity" value={`${free.toFixed(0)} wks`} />
        <Stat label="Designers" value={String(r.designers)} />
      </motion.div>
    </motion.section>
  );
}

function Ring({ value, tone }: { value: number; tone: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'over' ? 'var(--over)' : tone === 'warn' ? 'var(--warn-bar)' : 'var(--accent)';
  return (
    <div className="ring" role="img" aria-label={`Readiness ${value}%`}>
      <svg viewBox="0 0 84 84" width="84" height="84">
        <circle cx="42" cy="42" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="7" />
        <motion.circle
          cx="42" cy="42" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          transform="rotate(-90 42 42)" strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - value / 100) }}
          transition={{ duration: 1, ease: ease.out }}
        />
      </svg>
      {/* A full ring reads as done, so it gets a check rather than "100%". */}
      {value >= 100 ? (
        <motion.span className="ring-label done" style={{ color }} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring.smooth, delay: 0.6 }}>
          <Check size={30} strokeWidth={3} />
        </motion.span>
      ) : (
        <span className="ring-label">
          <b className="num">{value}</b>
          <span className="ring-unit">%</span>
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, tone, href, linkLabel }: { label: string; value: string; tone?: string; href?: string; linkLabel?: string }) {
  const body = (
    <>
      <span className="kpi-label">{label}{href && <ArrowRight size={11} aria-hidden />}</span>
      <span className="kpi-value">{value}</span>
    </>
  );
  if (href) return <motion.a href={href} className={`kpi kpi-link ${tone ?? ''}`} variants={staggerChild} aria-label={linkLabel}>{body}</motion.a>;
  return (
    <motion.div className={`kpi ${tone ?? ''}`} variants={staggerChild}>
      {body}
    </motion.div>
  );
}

/* ---------- next steps ---------- */

interface Step {
  id: string;
  tone: 'over' | 'warn' | 'info' | 'ok';
  icon: LucideIcon;
  title: ReactNode;
  sub: string;
  actions: { label: string; primary?: boolean; icon?: LucideIcon; run: () => void }[];
}

function weekRange(idxs: number[]) {
  if (!idxs.length) return '';
  const a = idxs[0], b = idxs[idxs.length - 1];
  return a === b ? `W${a + 1}` : `W${a + 1}–${b + 1}`;
}

function NextSteps({ r, load, entries, className }: { r: Readiness; load: Record<string, WeekLoad[]>; entries: Entry[]; className: string }) {
  const designers = useDesigners();
  const bulk = useStore((s) => s.bulkUpdate);
  const labels = useWorkspace()!.config.labels;

  const steps: Step[] = [];
  const unassigned = entries.filter((e) => !e.schedule.designerId);
  if (unassigned.length) {
    steps.push({
      id: 'unassigned', tone: 'warn', icon: Inbox,
      title: <>{unassigned.length} {(unassigned.length === 1 ? labels.initiative : labels.initiatives).toLowerCase()} {unassigned.length === 1 ? 'needs' : 'need'} an owner</>,
      sub: unassigned.slice(0, 3).map((e) => e.project.name).join(', ') + (unassigned.length > 3 ? '…' : ''),
      actions: [{ label: 'Auto-balance', primary: true, icon: Wand2, run: () => navigate({ view: 'backlog', designer: null }) }],
    });
  }
  const over = designers
    .map((d) => ({ d, weeks: load[d.id] ?? [] }))
    .map(({ d, weeks }) => ({ d, s: summarize(weeks), idx: weeks.map((w, i) => (w.total > 100.5 ? i : -1)).filter((i) => i >= 0) }))
    .filter((x) => x.s.over > 0)
    .sort((a, b) => b.s.peak - a.s.peak);
  for (const { d, s, idx } of over.slice(0, 3)) {
    steps.push({
      id: `over-${d.id}`, tone: 'over', icon: AlertTriangle,
      title: <>{d.name} is over capacity</>,
      sub: `${s.over} week${s.over > 1 ? 's' : ''} over 100% (${weekRange(idx)}), peaking at ${Math.round(s.peak)}%`,
      actions: [{ label: 'Review', primary: true, run: () => openDesigner(d.id) }],
    });
  }
  if (over.length > 3) {
    steps.push({ id: 'over-more', tone: 'over', icon: Users, title: <>{over.length - 3} more designers are over capacity</>, sub: 'The capacity heatmap shows when.', actions: [{ label: 'Open Gantt', run: () => navigate({ view: 'gantt', designer: null }) }] });
  }
  const tentative = entries.filter((e) => e.schedule.designerId && !e.schedule.confirmed);
  if (tentative.length) {
    steps.push({
      id: 'tentative', tone: 'info', icon: CircleCheck,
      title: <>{tentative.length} assignment{tentative.length > 1 ? 's are' : ' is'} still tentative</>,
      sub: 'Confirm once the designer and partners have agreed.',
      actions: [
        {
          label: 'Confirm all', primary: true, icon: Check,
          run: async () => {
            if (await confirmDialog({ title: `Confirm ${tentative.length} assignment${tentative.length > 1 ? 's' : ''}?`, body: 'They’ll be marked as agreed in this plan. You can unconfirm any of them later.', confirmLabel: 'Confirm all' })) {
              bulk(tentative.map((e) => e.project.id), {}, { confirmed: true });
              toast(`Confirmed ${tentative.length}`, { tone: 'success' });
            }
          },
        },
        { label: 'Review', run: () => navigate({ view: 'projects', designer: null }) },
      ],
    });
  }
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const late = entries.filter((e) => (gaSlipWeeks(e.project, e.schedule, sm) ?? 0) > 0);
  if (late.length) {
    steps.push({
      id: 'late', tone: 'warn', icon: CalendarClock,
      title: <>{late.length} {(late.length === 1 ? labels.initiative : labels.initiatives).toLowerCase()} {late.length === 1 ? 'ends' : 'end'} after {labels.gaTarget}</>,
      sub: late.slice(0, 3).map((e) => e.project.name).join(', ') + (late.length > 3 ? '…' : ''),
      actions: [{ label: 'Review', primary: true, run: () => openProject(late[0].project.id) }],
    });
  }
  const noMilestones = entries.filter((e) => e.schedule.designerId && e.project.workType === 'Design' && e.schedule.duration >= 4 && !e.schedule.milestones.length);
  if (noMilestones.length) {
    steps.push({
      id: 'milestones', tone: 'info', icon: Diamond,
      title: <>{noMilestones.length} design project{noMilestones.length > 1 ? 's have' : ' has'} no milestones</>,
      sub: 'Milestones make handoffs visible on the Gantt and in designer views.',
      actions: [{ label: 'Add to first', run: () => openProject(noMilestones[0].project.id) }],
    });
  }
  const light = designers.map((d) => ({ d, s: summarize(load[d.id] ?? []) })).filter((x) => x.s.avg < 55).sort((a, b) => a.s.avg - b.s.avg);
  if (light.length && unassigned.length) {
    const x = light[0];
    steps.push({
      id: `room-${x.d.id}`, tone: 'ok', icon: Sparkles,
      title: <>{x.d.name} has room</>,
      sub: `Averaging ${Math.round(x.s.avg)}% this quarter. A good home for backlog work.`,
      actions: [{ label: 'View', run: () => openDesigner(x.d.id) }],
    });
  }

  return (
    <section className={`card ${className}`}>
      <PanelHead icon={ArrowRight} title="Next steps" sub="The fastest way to get this plan ready." aside={steps.length ? <span className="chip accent">{steps.length}</span> : undefined} />
      <div className="steps-list">
        <AnimatePresence initial={false} mode="popLayout">
          {steps.map((s) => (
            <motion.div
              key={s.id}
              layout
              className={`step ${s.tone}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: spring.smooth }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
            >
              <span className="step-icon"><s.icon size={16} /></span>
              <div className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                <b className="small">{s.title}</b>
                <span className="tiny faint ellipsis">{s.sub}</span>
              </div>
              <div className="row step-actions" style={{ gap: 6, flex: 'none' }}>
                {s.actions.map((a) => (
                  <button key={a.label} className={`btn sm ${a.primary ? 'primary' : ''}`} onClick={a.run}>
                    {a.icon && <a.icon size={13} />} {a.label}
                  </button>
                ))}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {!steps.length && (
          <motion.div className="ready-state" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.smooth}>
            <span className="ready-icon"><CircleCheck size={22} /></span>
            <b>{r.total ? 'This plan is ready to share' : 'Nothing planned yet'}</b>
            <span className="small muted">{r.total ? 'Everyone has an owner, every assignment is confirmed, and no one is over capacity.' : 'Add a project from the top bar, or import a spreadsheet.'}</span>
          </motion.div>
        )}
      </div>
    </section>
  );
}

/* ---------- capacity heatmap ---------- */

const LEVEL_WORDS = { idle: 'free', ok: 'healthy', warn: 'full', over: 'over capacity' } as const;

function Heatmap({ load, fromAbs, className }: { load: Record<string, WeekLoad[]>; fromAbs: number; className: string }) {
  const designers = useDesigners();
  const [sort, setSort] = useState<'name' | 'load'>('load');
  const nowIdx = utcToAbsWeek(Date.now()) - fromAbs;
  const rows = useMemo(() => {
    const r = designers.map((d) => ({ d, weeks: load[d.id] ?? [], s: summarize(load[d.id] ?? []) }));
    return sort === 'load' ? r.sort((a, b) => b.s.avg - a.s.avg) : r.sort((a, b) => a.d.name.localeCompare(b.d.name));
  }, [designers, load, sort]);

  // ARIA grid with one tab stop: arrow keys move between cells, Enter opens the designer.
  // Column 0 is the name button, 1..13 are the weeks.
  const [active, setActive] = useState({ r: 0, c: 1 });
  const gridRef = useRef<HTMLDivElement>(null);
  const r0 = Math.min(active.r, Math.max(0, rows.length - 1));
  const onGridKey = (e: React.KeyboardEvent) => {
    const max = { r: rows.length - 1, c: WEEKS_PER_QUARTER };
    const next = { r: r0, c: active.c };
    if (e.key === 'ArrowRight') next.c = Math.min(max.c, next.c + 1);
    else if (e.key === 'ArrowLeft') next.c = Math.max(0, next.c - 1);
    else if (e.key === 'ArrowDown') next.r = Math.min(max.r, next.r + 1);
    else if (e.key === 'ArrowUp') next.r = Math.max(0, next.r - 1);
    else if (e.key === 'Home') {
      next.c = 0;
      if (e.ctrlKey) next.r = 0;
    } else if (e.key === 'End') {
      next.c = max.c;
      if (e.ctrlKey) next.r = max.r;
    } else if ((e.key === 'Enter' || e.key === ' ') && active.c > 0) {
      e.preventDefault();
      openDesigner(rows[r0].d.id);
      return;
    } else return;
    e.preventDefault();
    setActive(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next.r}:${next.c}"]`)?.focus();
  };
  const tab = (r: number, c: number) => (r === r0 && c === active.c ? 0 : -1);

  return (
    <section className={`card ${className}`}>
      <PanelHead
        icon={Gauge}
        title="Team capacity"
        sub="Each cell is one week. Hover or focus a cell for its load; open a name for their view."
        aside={
          <div className="segmented" role="radiogroup" aria-label="Sort">
            <button role="radio" aria-checked={sort === 'load'} className={sort === 'load' ? 'on' : ''} onClick={() => setSort('load')}>Busiest</button>
            <button role="radio" aria-checked={sort === 'name'} className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>A–Z</button>
          </div>
        }
      />
      <div className="heatmap" style={{ '--weeks': WEEKS_PER_QUARTER } as React.CSSProperties}>
        <div ref={gridRef} role="grid" aria-label="Team capacity by week" aria-describedby="hm-legend" onKeyDown={onGridKey}>
          <div className="hm-row hm-head" role="row">
            <span role="columnheader"><span className="sr-only">Designer</span></span>
            {Array.from({ length: WEEKS_PER_QUARTER }, (_, i) => (
              <span key={i} role="columnheader" className={i === nowIdx ? 'now' : ''} title={formatAbsWeek(fromAbs + i, true)} aria-label={`Week ${i + 1}, ${formatAbsWeek(fromAbs + i, true)}${i === nowIdx ? ', this week' : ''}`}>{i + 1}</span>
            ))}
            <span role="columnheader">Avg</span>
          </div>
          <motion.div role="rowgroup" variants={staggerParent} initial="initial" animate="animate">
            {rows.map(({ d, weeks, s }, r) => (
              <motion.div key={d.id} className="hm-row" role="row" variants={staggerChild} layout transition={spring.smooth}>
                <span role="rowheader" className="hm-name-cell">
                  <button className="hm-name" tabIndex={tab(r, 0)} data-cell={`${r}:0`} onFocus={() => setActive({ r, c: 0 })} onClick={() => openDesigner(d.id)}>
                    <Avatar designer={d} />
                    <span className="ellipsis">{d.name}</span>
                  </button>
                </span>
                {weeks.map((w, i) => {
                  const lvl = loadLevel(w.total);
                  // Intensity scales with load so busy weeks read darker within a level; over is always full strength.
                  const strength = lvl === 'idle' ? 0 : lvl === 'over' ? 100 : Math.round(30 + Math.min(1, w.total / 120) * 70);
                  const pct = Math.round(w.total);
                  return (
                    <span
                      key={i}
                      role="gridcell"
                      tabIndex={tab(r, i + 1)}
                      data-cell={`${r}:${i + 1}`}
                      onFocus={() => setActive({ r, c: i + 1 })}
                      onClick={() => openDesigner(d.id)}
                      className={`hm-cell lvl-${lvl} ${i === nowIdx ? 'now' : ''}`}
                      style={{ '--k': `${strength}%` } as React.CSSProperties}
                      title={`${d.name} · W${i + 1} (${formatAbsWeek(w.absWeek)}): ${pct}%${w.disruptions ? ` incl. ${Math.round(w.disruptions)}% disruptions` : ''}`}
                      aria-label={`W${i + 1}, ${pct}%, ${LEVEL_WORDS[lvl]}${w.disruptions ? `, including ${Math.round(w.disruptions)}% disruptions` : ''}`}
                    >
                      <span className="hm-val" aria-hidden>{pct}</span>
                    </span>
                  );
                })}
                <span role="gridcell" aria-label={`Average ${Math.round(s.avg)}%`}><LoadChip pct={s.avg} /></span>
              </motion.div>
            ))}
          </motion.div>
        </div>
        <div className="hm-legend" id="hm-legend">
          <span><i className="hm-cell lvl-idle" aria-hidden /> Free</span>
          <span><i className="hm-cell lvl-ok" style={{ '--k': '70%' } as React.CSSProperties} aria-hidden /> Healthy, up to 85%</span>
          <span><i className="hm-cell lvl-warn" style={{ '--k': '80%' } as React.CSSProperties} aria-hidden /> Full, up to 100%</span>
          <span><i className="hm-cell lvl-over" aria-hidden /> Over 100% (striped, value shown)</span>
          <span className="hm-legend-note">Up to 85% counts as healthy because it leaves room for crits, reviews and unplanned asks. Use the arrow keys to move between weeks.</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- scenarios ---------- */

function Scenarios({ className }: { className: string }) {
  const plans = useQuarterPlans();
  const active = useActivePlan();
  const projects = useQuarterProjects();
  const designers = useDesigners();
  const disruptions = useWorkspaceDisruptions();
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const { fromAbs } = useLoad();
  const { setActivePlan, createPlan, duplicatePlan, renamePlan, deletePlan } = useStore.getState();
  const [renaming, setRenaming] = useState<string | null>(null);

  const stats = useMemo(
    () =>
      Object.fromEntries(
        plans.map((p: Plan) => {
          const es = entriesFor(projects, p);
          const l = computeLoad(es, disruptions, designers.map((d) => d.id), fromAbs, WEEKS_PER_QUARTER, sm);
          return [p.id, readiness(es, l, designers)];
        }),
      ),
    [plans, projects, designers, disruptions, fromAbs, sm],
  );

  return (
    <section className={`card ${className}`}>
      <PanelHead
        icon={Layers}
        title="Scenarios"
        sub="Compare plans side by side."
        aside={<button className="btn sm" onClick={() => { createPlan(); toast('Blank plan created', { tone: 'success' }); }}><Plus size={14} /> New</button>}
      />
      <div className="col" style={{ gap: 8, padding: '0 12px 12px' }}>
        <AnimatePresence initial={false}>
          {plans.map((p) => {
            const st = stats[p.id];
            const isActive = p.id === active?.id;
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, transition: spring.smooth }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                className={`scenario ${isActive ? 'active' : ''}`}
                onClick={() => setActivePlan(p.id)}
              >
                <div className="row" style={{ gap: 8 }}>
                  {renaming === p.id ? (
                    <input
                      className="input sm"
                      autoFocus
                      defaultValue={p.name}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { renamePlan(p.id, e.target.value.trim() || p.name); setRenaming(null); }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <b className="ellipsis small">{p.name}</b>
                  )}
                  <span className="spacer" />
                  {isActive && <span className="chip accent">Active</span>}
                  <span className="scenario-score num">{st.score}%</span>
                </div>
                <div className="scenario-bar" title="Readiness: assigned (40%) · confirmed (30%) · balanced (30%)">
                  <motion.span className="seg-a" animate={{ width: `${st.stages.assigned * 40}%` }} transition={{ duration: 0.5 }} />
                  <motion.span className="seg-c" animate={{ width: `${st.stages.confirmed * 30}%` }} transition={{ duration: 0.5 }} />
                  <motion.span className="seg-b" animate={{ width: `${st.stages.balanced * 30}%` }} transition={{ duration: 0.5 }} />
                </div>
                <div className="row tiny faint" style={{ gap: 10 }}>
                  <span>{st.assigned}/{st.total} assigned</span>
                  <span>{st.confirmed} confirmed</span>
                  <span style={{ color: st.overloaded ? 'var(--over)' : undefined }}>{st.overloaded} over</span>
                  <span className="spacer" />
                  <span className="row scenario-actions" style={{ gap: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button className="btn sm ghost icon" aria-label={`Rename ${p.name}`} title="Rename" onClick={() => setRenaming(p.id)}><Pencil size={13} /></button>
                    <button className="btn sm ghost icon" aria-label={`Duplicate ${p.name}`} title="Duplicate" onClick={() => { duplicatePlan(p.id); toast(`Duplicated ${p.name}`, { tone: 'success' }); }}><Copy size={13} /></button>
                    <button
                      className="btn sm ghost icon danger"
                      disabled={plans.length < 2}
                      aria-label={`Delete ${p.name}`}
                      title={plans.length < 2 ? 'A quarter needs at least one plan' : 'Delete'}
                      onClick={async () => {
                        if (await confirmDialog({ title: `Delete ${p.name}?`, body: 'Its assignments and dates are removed. Project details stay in the other plans.', confirmLabel: 'Delete plan', destructive: true })) {
                          deletePlan(p.id);
                          toast(`Deleted ${p.name}`);
                        }
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ---------- milestones ---------- */

function UpcomingMilestones({ entries, className }: { entries: Entry[]; className: string }) {
  const qStart = useQuarterStart();
  const dmap = useDesignerMap();
  const now = utcToAbsWeek(Date.now());
  const from = Math.max(now, qStart);
  const items = entries
    .flatMap((e) => e.schedule.milestones.map((m) => ({ m, e, abs: qStart + e.schedule.startWeek + Math.floor(m.offset) })))
    .filter((x) => x.abs >= from && x.abs < from + 4)
    .sort((a, b) => a.abs - b.abs);
  return (
    <section className={`card ${className}`}>
      <PanelHead icon={Diamond} title="Upcoming milestones" sub={`Next 4 weeks from ${formatAbsWeek(from)}`} aside={<span className="chip">{items.length}</span>} />
      <div className="col" style={{ gap: 2, padding: '0 12px 12px', maxHeight: 300, overflow: 'auto' }}>
        {items.slice(0, 12).map(({ m, e, abs }) => {
          const d = e.schedule.designerId ? dmap[e.schedule.designerId] : undefined;
          return (
            <button key={m.id} className="milestone-row" style={{ margin: 0 }} onClick={() => openProject(e.project.id)}>
              <Diamond size={12} fill="currentColor" style={{ color: d?.color ?? 'var(--text-3)', flex: 'none' }} />
              <span className="col" style={{ gap: 0, minWidth: 0, flex: 1, textAlign: 'left' }}>
                <span className="small ellipsis" style={{ fontWeight: 500 }}>{m.type} · <span className="faint">{e.project.name}</span></span>
                <span className="tiny faint ellipsis">{d?.name ?? 'Unassigned'}{m.note ? ` — ${m.note}` : ''}</span>
              </span>
              <span className="tiny faint nowrap">{formatAbsWeek(abs)}</span>
            </button>
          );
        })}
        {!items.length && <p className="small faint" style={{ padding: '4px 0' }}>Nothing due in the next four weeks.</p>}
      </div>
    </section>
  );
}

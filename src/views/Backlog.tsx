import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowUp, CalendarPlus, CircleCheck, Inbox, Lightbulb, ListChecks, Plus, Trash2, Undo2, Wand2 } from 'lucide-react';
import { confirmDialog, openBalancer, toast } from '../feedback';
import { backlogOf, useStore } from '../store';
import { openProjectPage, useDesignerMap, useDesigners, useEntries, useWorkspace } from '../hooks';
import type { Project, Schedule } from '../types';
import { PRIORITIES } from '../types';
import { quarterLabel } from '../lib/quarters';
import { effortFor } from '../lib/sizing';
import { Select } from '../components/inputs';
import { Avatar, DesignerSelect, PriorityChip, Toolbar } from '../components/ui';

const effortTotal = (ps: Project[]) => {
  const n = ps.reduce((a, p) => a + effortFor(p.workType, p.size), 0);
  return Number.isInteger(n) ? n : n.toFixed(1);
};

/**
 * Everything not yet owned or not yet in a quarter: this quarter's unassigned
 * work, ranked unscheduled ideas, and work slotted into later quarters. Each
 * name opens the project's plan page, so work can be planned before its quarter.
 */
export default function Backlog() {
  const entries = useEntries();
  const quarter = useStore((s) => s.currentQuarter);
  const unassigned = useMemo(() => entries.filter((e) => !e.schedule.designerId), [entries]);
  return (
    <div className="view">
      <Toolbar>
        <span className={`chip ${unassigned.length ? 'accent' : 'ok'}`}>{unassigned.length} unassigned in {quarterLabel(quarter)}</span>
        <span className="spacer" />
        <button className="btn primary" disabled={!unassigned.length} onClick={openBalancer} title={unassigned.length ? undefined : 'Everything this quarter has an owner'}>
          <Wand2 size={15} /> Auto-balance…
        </button>
      </Toolbar>
      <div className="col backlog-col">
        <Unassigned />
        <Unscheduled />
        <FutureQuarters />
      </div>
    </div>
  );
}

function SectionHead({ icon: Icon, title, sub, aside }: { icon: typeof Inbox; title: string; sub: string; aside?: React.ReactNode }) {
  return (
    <div className="panel-head">
      <span className="panel-icon"><Icon size={15} /></span>
      <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
        <h2>{title}</h2>
        <span className="tiny faint">{sub}</span>
      </div>
      {aside}
    </div>
  );
}

/** Project name that opens its plan page. */
function PlanLink({ p }: { p: Project }) {
  return <button className="link-btn row-open ellipsis" onClick={() => openProjectPage(p.id)}>{p.name}</button>;
}

/** A one-line summary of how far a project's plan has got. */
function planSummary(s: Schedule | undefined, dmap: Record<string, { name: string }>) {
  if (!s) return '';
  const bits = [`${s.duration}w @ ${s.allocation}%`];
  if (s.phasePlan) bits.push(`${s.phasePlan.length} phases`);
  if (s.milestones.length) bits.push(`${s.milestones.length} milestone${s.milestones.length === 1 ? '' : 's'}`);
  if (s.designerId && dmap[s.designerId]) bits.push(dmap[s.designerId].name);
  return bits.join(' · ');
}

function Unassigned() {
  const entries = useEntries();
  const designers = useDesigners();
  const quarter = useStore((s) => s.currentQuarter);
  const { updateSchedule, moveToQuarter } = useStore.getState();
  const rows = useMemo(() => entries.filter((e) => !e.schedule.designerId), [entries]);
  return (
    <section className="card">
      <SectionHead icon={Inbox} title={`Unassigned in ${quarterLabel(quarter)}`} sub="Planned for this quarter but without a designer. Assign by hand, or auto-balance." aside={<span className="tiny faint">{effortTotal(rows.map((e) => e.project))} effort wks</span>} />
      <div className="backlog-list">
        <AnimatePresence initial={false}>
          {rows.map((e) => (
            <motion.div key={e.project.id} className="list-row backlog-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
              <PriorityChip p={e.project.priority} />
              <PlanLink p={e.project} />
              <span className="spacer" />
              <span className="tiny muted nowrap">{e.project.size} {e.project.workType} · {e.schedule.duration}w @ {e.schedule.allocation}%</span>
              <div style={{ width: 150, flex: 'none' }}>
                <DesignerSelect size="sm" designers={designers} value={null} allowNone={false} placeholder="Assign…" ariaLabel={`Assign ${e.project.name}`} onChange={(v) => v && updateSchedule(e.project.id, { designerId: v })} />
              </div>
              <button
                className="btn sm ghost icon"
                aria-label={`Move ${e.project.name} back to unscheduled`}
                title="Not this quarter: move to unscheduled"
                onClick={() => { moveToQuarter([e.project.id], null); toast(`${e.project.name} moved to unscheduled`, { action: { label: 'Undo', run: () => moveToQuarter([e.project.id], quarter) } }); }}
              >
                <Undo2 size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {!rows.length && <p className="small faint backlog-empty"><CircleCheck size={14} aria-hidden /> Every project this quarter has an owner.</p>}
      </div>
    </section>
  );
}

/** Ranked work that isn't planned into any quarter yet. */
function Unscheduled() {
  const workspace = useWorkspace()!;
  const projects = useStore((s) => s.projects);
  const quarter = useStore((s) => s.currentQuarter);
  const dmap = useDesignerMap();
  const { addToBacklog, moveToQuarter, moveInBacklog, updateProject, deleteProjects } = useStore.getState();
  const items = useMemo(() => backlogOf(projects, workspace.id), [projects, workspace.id]);
  const [draft, setDraft] = useState('');
  // Reordering moves the row in the DOM, which drops focus; put it back on the same button.
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (!refocus) return;
    (document.querySelector(`[data-rank-btn="${refocus}"]`) as HTMLButtonElement | null)?.focus();
    setRefocus(null);
  }, [refocus, items]);
  const labels = workspace.config.labels;

  const add = () => {
    const names = draft.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!names.length) return;
    addToBacklog(names);
    setDraft('');
  };

  const plan = (p: Project, q: number) => {
    moveToQuarter([p.id], q);
    toast(`${p.name} planned for ${quarterLabel(q)}`, { tone: 'success', action: { label: 'Undo', run: () => moveToQuarter([p.id], null) } });
  };

  return (
    <section className="card">
      <SectionHead
        icon={Lightbulb}
        title="Unscheduled"
        sub="Ideas and requests with no quarter yet, highest rank first. Open one to plan its phases and milestones ahead of time."
        aside={<span className="tiny faint">{items.length} · {effortTotal(items)} effort wks</span>}
      />
      <div className="backlog-list">
        <form className="row" style={{ paddingBottom: 8 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add an unscheduled ${labels.initiative.toLowerCase()}…`} aria-label={`New unscheduled ${labels.initiative.toLowerCase()}`} />
          <button className="btn sm" type="submit" disabled={!draft.trim()}><Plus size={14} /> Add</button>
        </form>
        <ol className="backlog-rank">
          <AnimatePresence initial={false}>
            {items.map((p, i) => (
              <motion.li key={p.id} className="list-row backlog-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
                <span className="rank num" aria-hidden>{i + 1}</span>
                <span className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                  <PlanLink p={p} />
                  <span className="tiny muted ellipsis">
                    {p.ticket ? `${p.ticket} · ` : ''}{p.size} {p.workType} · {effortFor(p.workType, p.size)} effort wks{p.productArea ? ` · ${p.productArea}` : ''}
                    {p.draft && (p.draft.phasePlan || p.draft.milestones.length || p.draft.designerId) ? ` · planned: ${planSummary(p.draft, dmap)}` : ''}
                  </span>
                </span>
                <Select size="sm" width={72} menuWidth={110} value={p.priority} onChange={(v) => updateProject(p.id, { priority: v })} ariaLabel={`Priority for ${p.name}`} options={PRIORITIES.map((x) => ({ value: x, label: <PriorityChip p={x} />, text: x }))} />
                <span className="row" style={{ gap: 0 }}>
                  <button className="btn sm ghost icon" data-rank-btn={`${p.id}:up`} disabled={i === 0} aria-label={`Move ${p.name} up`} onClick={() => { moveInBacklog(p.id, -1); setRefocus(i === 1 ? `${p.id}:down` : `${p.id}:up`); }}><ArrowUp size={14} /></button>
                  <button className="btn sm ghost icon" data-rank-btn={`${p.id}:down`} disabled={i === items.length - 1} aria-label={`Move ${p.name} down`} onClick={() => { moveInBacklog(p.id, 1); setRefocus(i === items.length - 2 ? `${p.id}:up` : `${p.id}:down`); }}><ArrowDown size={14} /></button>
                </span>
                <Select
                  size="sm"
                  width="auto"
                  menuWidth={200}
                  value={null}
                  placeholder="Plan for…"
                  ariaLabel={`Plan ${p.name} for a quarter`}
                  onChange={(q) => plan(p, q)}
                  options={[0, 1, 2, 3].map((k) => ({ value: quarter + k, label: quarterLabel(quarter + k), hint: k === 0 ? 'this quarter' : undefined }))}
                />
                <button
                  className="btn sm ghost icon danger"
                  aria-label={`Delete ${p.name}`}
                  onClick={async () => {
                    if (await confirmDialog({ title: `Delete “${p.name}”?`, body: 'It’s removed from the backlog, with its draft plan. This can’t be undone.', confirmLabel: 'Delete', destructive: true })) deleteProjects([p.id]);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {!items.length && <p className="small faint backlog-empty">Nothing waiting. Add ideas and requests here before they have a quarter.</p>}
      </div>
    </section>
  );
}

/** Work already slotted into later quarters, so it can be planned before its quarter starts. */
function FutureQuarters() {
  const workspace = useWorkspace()!;
  const projects = useStore((s) => s.projects);
  const plans = useStore((s) => s.plans);
  const activePlan = useStore((s) => s.activePlan);
  const quarter = useStore((s) => s.currentQuarter);
  const dmap = useDesignerMap();
  const { moveToQuarter } = useStore.getState();
  const groups = useMemo(() => {
    const byQ = new Map<number, Project[]>();
    for (const p of projects) if (p.workspaceId === workspace.id && p.quarter != null && p.quarter > quarter) byQ.set(p.quarter, [...(byQ.get(p.quarter) ?? []), p]);
    return [...byQ.entries()].sort((a, b) => a[0] - b[0]);
  }, [projects, workspace.id, quarter]);
  const scheduleOf = (p: Project) => {
    const qPlans = plans.filter((x) => x.workspaceId === workspace.id && x.quarter === p.quarter);
    const plan = qPlans.find((x) => x.id === activePlan[`${workspace.id}:${p.quarter}`]) ?? qPlans[0];
    return plan?.schedules[p.id];
  };

  return (
    <section className="card">
      <SectionHead icon={CalendarPlus} title="Future quarters" sub="Already slotted into a later quarter. Plan them now, or pull them in." aside={<span className="tiny faint">{effortTotal(groups.flatMap(([, ps]) => ps))} effort wks</span>} />
      <div className="backlog-list">
        {groups.map(([q, ps]) => (
          <div key={q} className="col" style={{ gap: 0 }}>
            <div className="row backlog-group">
              <b className="small">{quarterLabel(q)}</b>
              <span className="tiny faint">{ps.length} · {effortTotal(ps)} effort wks</span>
            </div>
            {ps.map((p) => {
              const s = scheduleOf(p);
              const owner = s?.designerId ? dmap[s.designerId] : undefined;
              return (
                <div key={p.id} className="list-row backlog-row">
                  <PriorityChip p={p.priority} />
                  <span className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                    <PlanLink p={p} />
                    <span className="tiny muted ellipsis">{planSummary(s, dmap)}</span>
                  </span>
                  <span className="row tiny muted nowrap" style={{ gap: 6 }}><Avatar designer={owner} /> {owner?.name ?? 'Unassigned'}</span>
                  <button className="btn sm" onClick={() => { moveToQuarter([p.id], quarter); toast(`${p.name} pulled into ${quarterLabel(quarter)}`, { tone: 'success', action: { label: 'Undo', run: () => moveToQuarter([p.id], q) } }); }}>
                    Pull into {quarterLabel(quarter)}
                  </button>
                  <button className="btn sm ghost icon" aria-label={`Move ${p.name} to unscheduled`} title="Move to unscheduled" onClick={() => moveToQuarter([p.id], null)}><Undo2 size={14} /></button>
                </div>
              );
            })}
          </div>
        ))}
        {!groups.length && <p className="small faint backlog-empty"><ListChecks size={14} aria-hidden /> Nothing planned beyond {quarterLabel(quarter)} yet. Use “Plan for…” on an unscheduled idea.</p>}
      </div>
    </section>
  );
}

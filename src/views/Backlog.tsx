import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUp, CalendarPlus, CircleCheck, Lightbulb, Plus, Scale, Sparkles, Trash2, Undo2, Zap, ShieldCheck } from 'lucide-react';
import { confirmDialog, toast } from '../feedback';
import { staggerChild, staggerParent } from '../lib/motion';
import { backlogOf, useStore } from '../store';
import { openProject, useDesignerMap, useDesigners, useEntries, useLoad, useQuarterStart, useWorkspace } from '../hooks';
import type { ID, Project } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { balance, STRATEGY_LABELS, type Strategy, type Suggestion } from '../lib/balancer';
import { formatWeekRange, quarterLabel } from '../lib/quarters';
import { effortFor } from '../lib/sizing';
import { Avatar, EmptyState, LoadChip, PriorityChip, Toolbar } from '../components/ui';

const STRATEGY_ICONS = { even: Scale, priority: Zap, conflict: ShieldCheck };

export default function Backlog() {
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const entries = useEntries();
  const qStart = useQuarterStart();
  const { load } = useLoad(0, WEEKS_PER_QUARTER);
  const bulk = useStore((s) => s.updateSchedule);
  const moveToQuarter = useStore((s) => s.moveToQuarter);
  const quarter = useStore((s) => s.currentQuarter);
  const backlog = useMemo(() => entries.filter((e) => !e.schedule.designerId), [entries]);
  const [strategy, setStrategy] = useState<Strategy>('even');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<Set<ID>>(new Set());

  const run = () => {
    const base = Object.fromEntries(designers.map((d) => [d.id, (load[d.id] ?? []).map((w) => w.total)]));
    const out = balance(backlog, designers, base, strategy);
    setSuggestions(out);
    setPicked(new Set(out.map((s) => s.projectId)));
  };

  const apply = () => {
    const n = (suggestions ?? []).filter((s) => picked.has(s.projectId)).length;
    for (const s of suggestions ?? []) if (picked.has(s.projectId)) bulk(s.projectId, { designerId: s.designerId, startWeek: s.startWeek });
    toast(`Applied ${n} assignment${n === 1 ? '' : 's'}`, { tone: 'success' });
    setSuggestions(null);
    setPicked(new Set());
  };

  const byId = new Map(backlog.map((e) => [e.project.id, e]));
  const live = suggestions?.filter((s) => byId.has(s.projectId)) ?? null;

  return (
    <div className="view">
      <Toolbar>
        <span className={`chip ${backlog.length ? 'accent' : 'ok'}`}>{backlog.length} unassigned in {quarterLabel(quarter)}</span>
      </Toolbar>

      <div className="grid2 backlog-grid">
        <div className="col" style={{ gap: 16, minWidth: 0 }}>
        <div className="card card-pad col">
          <div className="row">
            <h2>Unassigned in {quarterLabel(quarter)}</h2>
            <span className="spacer" />
            <span className="tiny faint">{effortTotal(backlog.map((e) => e.project))} effort wks</span>
          </div>
          <AnimatePresence initial={false}>
          {backlog.map((e) => (
            <motion.div key={e.project.id} className="list-row backlog-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
              <PriorityChip p={e.project.priority} />
              <a href="#" className="ellipsis" style={{ fontWeight: 500 }} onClick={(ev) => { ev.preventDefault(); openProject(e.project.id); }}>
                {e.project.name}
              </a>
              <span className="spacer" />
              <span className="tiny muted nowrap">{e.project.size} {e.project.workType} · {e.schedule.duration}w @ {e.schedule.allocation}%</span>
              <select className="select sm" style={{ width: 120 }} value="" onChange={(ev) => ev.target.value && bulk(e.project.id, { designerId: ev.target.value })} aria-label={`Assign ${e.project.name}`}>
                <option value="">Assign…</option>
                {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
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
          {!backlog.length && <EmptyState icon={CircleCheck} title="Everything is assigned">Nice — every project has an owner this quarter.</EmptyState>}
        </div>

        <Unscheduled />
        <FutureQuarters />
        </div>

        <div className="card card-pad col" style={{ gap: 12 }}>
          <div className="row">
            <h2>Auto-balancer</h2>
            <span className="spacer" />
            <button className="btn primary" disabled={!backlog.length || !designers.length} onClick={run}><Sparkles size={15} /> Suggest assignments</button>
          </div>
          <div className="grid3">
            {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((k) => {
              const Icon = STRATEGY_ICONS[k];
              return (
              <button key={k} className={`choice ${strategy === k ? 'on' : ''}`} onClick={() => { setStrategy(k); setSuggestions(null); }}>
                <b className="small row" style={{ gap: 6 }}><Icon size={14} style={{ color: 'var(--accent)' }} />{STRATEGY_LABELS[k].name}</b>
                <p className="tiny muted" style={{ marginTop: 4 }}>{STRATEGY_LABELS[k].blurb}</p>
              </button>
              );
            })}
          </div>

          {live && (
            <motion.div className="col" style={{ gap: 0 }} variants={staggerParent} initial="initial" animate="animate" key={strategy + live.length}>
              <div className="row small">
                <label className="row">
                  <input
                    type="checkbox"
                    checked={picked.size === live.length && live.length > 0}
                    onChange={() => setPicked(picked.size === live.length ? new Set() : new Set(live.map((s) => s.projectId)))}
                  />
                  {picked.size} of {live.length} selected
                </label>
                <span className="spacer" />
                <button className="btn sm ghost" onClick={() => setSuggestions(null)}>Discard</button>
                <button className="btn sm primary" disabled={!picked.size} onClick={apply}>Apply {picked.size}</button>
              </div>
              {live.map((s) => {
                const e = byId.get(s.projectId)!;
                const d = dmap[s.designerId];
                return (
                  <motion.label key={s.projectId} variants={staggerChild} className="row" style={{ alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: 4 }}
                      checked={picked.has(s.projectId)}
                      onChange={() => {
                        const n = new Set(picked);
                        n.has(s.projectId) ? n.delete(s.projectId) : n.add(s.projectId);
                        setPicked(n);
                      }}
                    />
                    <div className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                      <div className="row">
                        <PriorityChip p={e.project.priority} />
                        <b className="ellipsis small">{e.project.name}</b>
                        <span className="spacer" />
                        <ArrowRight size={14} className="faint" />
                        <Avatar designer={d} />
                        <span className="small">{d?.name}</span>
                      </div>
                      <div className="row tiny muted">
                        <span>{formatWeekRange(qStart + s.startWeek, e.schedule.duration)}</span>
                        <span>· peak</span>
                        <LoadChip pct={s.peak} />
                      </div>
                      <span className="tiny muted">{s.reasoning}</span>
                    </div>
                  </motion.label>
                );
              })}
            </motion.div>
          )}
          {!live && <p className="small faint">Choose a strategy and generate suggestions. Placements account for existing work, disruptions and each other.</p>}
        </div>
      </div>
    </div>
  );
}

const effortTotal = (ps: Project[]) => {
  const n = ps.reduce((a, p) => a + effortFor(p.workType, p.size), 0);
  return Number.isInteger(n) ? n : n.toFixed(1);
};

/** Ranked work that isn't planned into any quarter yet. */
function Unscheduled() {
  const workspace = useWorkspace()!;
  const projects = useStore((s) => s.projects);
  const quarter = useStore((s) => s.currentQuarter);
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
    <div className="card card-pad col">
      <div className="row">
        <Lightbulb size={16} style={{ color: 'var(--accent)' }} aria-hidden />
        <h2>Unscheduled</h2>
        <span className="chip">{items.length}</span>
        <span className="spacer" />
        <span className="tiny faint">{effortTotal(items)} effort wks</span>
      </div>
      <p className="tiny faint" style={{ margin: 0 }}>Ideas and requests not planned into a quarter yet, highest rank first.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add an unscheduled ${labels.initiative.toLowerCase()}…`} aria-label={`New unscheduled ${labels.initiative.toLowerCase()}`} />
        <button className="btn sm" type="submit" disabled={!draft.trim()}><Plus size={14} /> Add</button>
      </form>
      <ol className="backlog-rank">
        <AnimatePresence initial={false}>
          {items.map((p, i) => (
            <motion.li key={p.id} className="list-row backlog-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
              <span className="rank num" aria-hidden>{i + 1}</span>
              <span className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
                <span className="ellipsis" style={{ fontWeight: 500 }}>{p.name}</span>
                <span className="tiny muted ellipsis">{p.size} {p.workType} · {effortFor(p.workType, p.size)} effort wks{p.productArea ? ` · ${p.productArea}` : ''}</span>
              </span>
              <select className="select sm" style={{ width: 64 }} value={p.priority} onChange={(e) => updateProject(p.id, { priority: e.target.value as Project['priority'] })} aria-label={`Priority for ${p.name}`}>
                {(['P0', 'P1', 'P2', 'P3'] as const).map((x) => <option key={x}>{x}</option>)}
              </select>
              <span className="row" style={{ gap: 0 }}>
                <button className="btn sm ghost icon" data-rank-btn={`${p.id}:up`} disabled={i === 0} aria-label={`Move ${p.name} up`} onClick={() => { moveInBacklog(p.id, -1); setRefocus(i === 1 ? `${p.id}:down` : `${p.id}:up`); }}><ArrowUp size={14} /></button>
                <button className="btn sm ghost icon" data-rank-btn={`${p.id}:down`} disabled={i === items.length - 1} aria-label={`Move ${p.name} down`} onClick={() => { moveInBacklog(p.id, 1); setRefocus(i === items.length - 2 ? `${p.id}:up` : `${p.id}:down`); }}><ArrowDown size={14} /></button>
              </span>
              <select className="select sm" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && plan(p, Number(e.target.value))} aria-label={`Plan ${p.name} for a quarter`}>
                <option value="">Plan for…</option>
                {[0, 1, 2].map((k) => <option key={k} value={quarter + k}>{quarterLabel(quarter + k)}{k === 0 ? ' (this quarter)' : ''}</option>)}
              </select>
              <button
                className="btn sm ghost icon danger"
                aria-label={`Delete ${p.name}`}
                onClick={async () => {
                  if (await confirmDialog({ title: `Delete “${p.name}”?`, body: 'It’s removed from the backlog. This can’t be undone.', confirmLabel: 'Delete', destructive: true })) deleteProjects([p.id]);
                }}
              >
                <Trash2 size={13} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {!items.length && <p className="small faint">Nothing waiting. Add ideas and requests here before they have a quarter.</p>}
    </div>
  );
}

/** Work already slotted into later quarters, so it's visible before its quarter starts. */
function FutureQuarters() {
  const workspace = useWorkspace()!;
  const projects = useStore((s) => s.projects);
  const plans = useStore((s) => s.plans);
  const activePlan = useStore((s) => s.activePlan);
  const quarter = useStore((s) => s.currentQuarter);
  const { moveToQuarter, setQuarter } = useStore.getState();
  const groups = useMemo(() => {
    const byQ = new Map<number, Project[]>();
    for (const p of projects) if (p.workspaceId === workspace.id && p.quarter != null && p.quarter > quarter) byQ.set(p.quarter, [...(byQ.get(p.quarter) ?? []), p]);
    return [...byQ.entries()].sort((a, b) => a[0] - b[0]);
  }, [projects, workspace.id, quarter]);
  const ownerOf = (p: Project) => {
    const qPlans = plans.filter((x) => x.workspaceId === workspace.id && x.quarter === p.quarter);
    const plan = qPlans.find((x) => x.id === activePlan[`${workspace.id}:${p.quarter}`]) ?? qPlans[0];
    return plan?.schedules[p.id]?.designerId ?? null;
  };
  const dmap = useDesignerMap();

  return (
    <div className="card card-pad col">
      <div className="row">
        <CalendarPlus size={16} style={{ color: 'var(--accent)' }} aria-hidden />
        <h2>Future quarters</h2>
        <span className="spacer" />
        <span className="tiny faint">{effortTotal(groups.flatMap(([, ps]) => ps))} effort wks</span>
      </div>
      {groups.map(([q, ps]) => (
        <div key={q} className="col" style={{ gap: 0 }}>
          <div className="row" style={{ paddingTop: 6 }}>
            <button className="link-btn small" style={{ fontWeight: 600, color: 'var(--text)' }} onClick={() => setQuarter(q)}>{quarterLabel(q)}</button>
            <span className="tiny faint">{ps.length} · {effortTotal(ps)} effort wks</span>
          </div>
          {ps.map((p) => {
            const owner = ownerOf(p);
            return (
              <div key={p.id} className="list-row backlog-row">
                <PriorityChip p={p.priority} />
                <span className="ellipsis" style={{ fontWeight: 500 }}>{p.name}</span>
                <span className="spacer" />
                <span className="tiny muted nowrap">{owner ? dmap[owner]?.name : 'Unassigned'}</span>
                <button className="btn sm" onClick={() => { moveToQuarter([p.id], quarter); toast(`${p.name} pulled into ${quarterLabel(quarter)}`, { tone: 'success', action: { label: 'Undo', run: () => moveToQuarter([p.id], q) } }); }}>
                  Pull into {quarterLabel(quarter)}
                </button>
                <button className="btn sm ghost icon" aria-label={`Move ${p.name} to unscheduled`} title="Move to unscheduled" onClick={() => moveToQuarter([p.id], null)}><Undo2 size={14} /></button>
              </div>
            );
          })}
        </div>
      ))}
      {!groups.length && <p className="small faint">Nothing planned beyond {quarterLabel(quarter)} yet.</p>}
    </div>
  );
}

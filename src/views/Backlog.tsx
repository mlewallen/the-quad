import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CircleCheck, Scale, Sparkles, Zap, ShieldCheck } from 'lucide-react';
import { toast } from '../feedback';
import { staggerChild, staggerParent } from '../lib/motion';
import { useStore } from '../store';
import { openProject, useDesignerMap, useDesigners, useEntries, useLoad, useQuarterStart, useWorkspace } from '../hooks';
import type { ID } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { balance, STRATEGY_LABELS, type Strategy, type Suggestion } from '../lib/balancer';
import { formatWeekRange } from '../lib/quarters';
import { Avatar, EmptyState, LoadChip, PriorityChip, Toolbar } from '../components/ui';

const STRATEGY_ICONS = { even: Scale, priority: Zap, conflict: ShieldCheck };

export default function Backlog() {
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const entries = useEntries();
  const qStart = useQuarterStart();
  const { load } = useLoad(0, WEEKS_PER_QUARTER);
  const bulk = useStore((s) => s.updateSchedule);
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
        <span className={`chip ${backlog.length ? 'accent' : 'ok'}`}>{backlog.length} unassigned</span>
      </Toolbar>

      <div className="grid2" style={{ alignItems: 'start', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
        <div className="card card-pad col">
          <h2>Unassigned {workspace.config.labels.initiatives.toLowerCase()}</h2>
          <AnimatePresence initial={false}>
          {backlog.map((e) => (
            <motion.div key={e.project.id} className="list-row" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}>
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
            </motion.div>
          ))}
          </AnimatePresence>
          {!backlog.length && <EmptyState icon={CircleCheck} title="Everything is assigned">Nice — every initiative has an owner this quarter.</EmptyState>}
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

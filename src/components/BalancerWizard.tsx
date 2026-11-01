import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Scale, ShieldCheck, Sparkles, Wand2, X, Zap } from 'lucide-react';
import { closeBalancer, toast, useFeedback } from '../feedback';
import { useStore } from '../store';
import { useDesignerMap, useDesigners, useEntries, useLoad, useQuarterStart } from '../hooks';
import type { ID } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { balance, STRATEGY_LABELS, type Strategy, type Suggestion } from '../lib/balancer';
import { formatWeekRange, quarterLabel } from '../lib/quarters';
import { staggerChild, staggerParent } from '../lib/motion';
import { Checkbox } from './inputs';
import { Avatar, LoadChip, Modal, PriorityChip } from './ui';

const STRATEGY_ICONS = { even: Scale, priority: Zap, conflict: ShieldCheck };
const STEPS = ['Work to place', 'Who and how', 'Review'] as const;

/** Global host: the wizard only exists on screen while someone is balancing. */
export function BalancerHost() {
  const open = useFeedback((s) => s.balancerOpen);
  return <AnimatePresence>{open && <Modal key="balancer" onClose={closeBalancer} label="Auto-balance" wide><BalancerWizard /></Modal>}</AnimatePresence>;
}

/**
 * Three steps: pick the unassigned work to place, pick the designers and the
 * strategy, then review and apply the suggestions. Nothing changes until Apply.
 */
function BalancerWizard() {
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const entries = useEntries();
  const qStart = useQuarterStart();
  const quarter = useStore((s) => s.currentQuarter);
  const updateSchedule = useStore((s) => s.updateSchedule);
  const { load } = useLoad(0, WEEKS_PER_QUARTER);
  const unassigned = useMemo(() => entries.filter((e) => !e.schedule.designerId), [entries]);

  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Set<ID>>(() => new Set(unassigned.map((e) => e.project.id)));
  const [people, setPeople] = useState<Set<ID>>(() => new Set(designers.map((d) => d.id)));
  const [strategy, setStrategy] = useState<Strategy>('even');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picked, setPicked] = useState<Set<ID>>(new Set());

  const toggle = (set: Set<ID>, id: ID, fn: (s: Set<ID>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    fn(n);
  };

  const run = () => {
    const base = Object.fromEntries(designers.map((d) => [d.id, (load[d.id] ?? []).map((w) => w.total)]));
    const out = balance(unassigned.filter((e) => items.has(e.project.id)), designers.filter((d) => people.has(d.id)), base, strategy);
    setSuggestions(out);
    setPicked(new Set(out.map((s) => s.projectId)));
    go(2);
  };

  const apply = () => {
    const chosen = suggestions.filter((s) => picked.has(s.projectId));
    for (const s of chosen) updateSchedule(s.projectId, { designerId: s.designerId, startWeek: s.startWeek });
    toast(`Applied ${chosen.length} assignment${chosen.length === 1 ? '' : 's'}`, { tone: 'success' });
    closeBalancer();
  };

  // Changing step swaps out the button that had focus, so focus moves to the new step's first control.
  const moved = useRef(false);
  const go = (n: number) => {
    moved.current = true;
    setStep(n);
  };
  const onStepMount = (el: HTMLDivElement | null) => {
    if (!el || !moved.current) return;
    moved.current = false;
    el.querySelector<HTMLElement>('button:not(:disabled), input')?.focus();
  };

  const byId = new Map(unassigned.map((e) => [e.project.id, e]));
  const canNext = step === 0 ? items.size > 0 : people.size > 0;

  return (
    <div className="wizard">
      <div className="wizard-head">
        <span className="panel-icon"><Wand2 size={15} /></span>
        <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <h2>Auto-balance {quarterLabel(quarter)}</h2>
          <span className="tiny faint">Suggestions account for existing work, disruptions and each other. Nothing changes until you apply.</span>
        </div>
        <button className="btn icon ghost" aria-label="Close" onClick={closeBalancer}><X size={16} /></button>
      </div>
      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="wizard-dot">{i < step ? <Check size={11} strokeWidth={3} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <div className="wizard-body">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} ref={onStepMount} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12, transition: { duration: 0.12 } }}>
            {step === 0 && (
              <div className="col" style={{ gap: 4 }}>
                <div className="row small">
                  <Checkbox
                    autoFocus
                    checked={items.size === unassigned.length && unassigned.length > 0}
                    indeterminate={items.size > 0 && items.size < unassigned.length}
                    onChange={() => setItems(items.size === unassigned.length ? new Set() : new Set(unassigned.map((e) => e.project.id)))}
                  >
                    {items.size} of {unassigned.length} unassigned projects
                  </Checkbox>
                </div>
                {unassigned.map((e) => (
                  <div key={e.project.id} className="wizard-row">
                    <Checkbox checked={items.has(e.project.id)} onChange={() => toggle(items, e.project.id, setItems)}>
                      <span className="row" style={{ gap: 8, minWidth: 0 }}>
                        <PriorityChip p={e.project.priority} />
                        <b className="small ellipsis">{e.project.name}</b>
                      </span>
                    </Checkbox>
                    <span className="spacer" />
                    <span className="tiny muted nowrap">{e.project.size} {e.project.workType} · {e.schedule.duration}w @ {e.schedule.allocation}%</span>
                  </div>
                ))}
                {!unassigned.length && <p className="small faint">Everything this quarter already has an owner.</p>}
              </div>
            )}

            {step === 1 && (
              <div className="col" style={{ gap: 14 }}>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Designers to consider</div>
                  <div className="wizard-people">
                    {designers.map((d) => (
                      <Checkbox key={d.id} className="wizard-person" checked={people.has(d.id)} onChange={() => toggle(people, d.id, setPeople)}>
                        <Avatar designer={d} />
                        <span className="small ellipsis">{d.name}</span>
                      </Checkbox>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Strategy</div>
                  <div className="grid3" role="radiogroup" aria-label="Strategy">
                    {(Object.keys(STRATEGY_LABELS) as Strategy[]).map((k) => {
                      const Icon = STRATEGY_ICONS[k];
                      return (
                        <button key={k} role="radio" aria-checked={strategy === k} className={`choice ${strategy === k ? 'on' : ''}`} onClick={() => setStrategy(k)}>
                          <b className="small row" style={{ gap: 6 }}><Icon size={14} style={{ color: 'var(--accent)' }} />{STRATEGY_LABELS[k].name}</b>
                          <p className="tiny muted" style={{ marginTop: 4 }}>{STRATEGY_LABELS[k].blurb}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <motion.div className="col" style={{ gap: 0 }} variants={staggerParent} initial="initial" animate="animate">
                <div className="row small" style={{ paddingBottom: 6 }}>
                  <Checkbox
                    checked={picked.size === suggestions.length && suggestions.length > 0}
                    indeterminate={picked.size > 0 && picked.size < suggestions.length}
                    onChange={() => setPicked(picked.size === suggestions.length ? new Set() : new Set(suggestions.map((s) => s.projectId)))}
                  >
                    {picked.size} of {suggestions.length} selected
                  </Checkbox>
                </div>
                {suggestions.map((s) => {
                  const e = byId.get(s.projectId);
                  const d = dmap[s.designerId];
                  if (!e) return null;
                  return (
                    <motion.div key={s.projectId} variants={staggerChild} className="wizard-row" style={{ alignItems: 'flex-start' }}>
                      <Checkbox checked={picked.has(s.projectId)} ariaLabel={`Apply ${e.project.name} to ${d?.name}`} onChange={() => toggle(picked, s.projectId, setPicked)} />
                      <div className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
                        <div className="row">
                          <PriorityChip p={e.project.priority} />
                          <b className="ellipsis small">{e.project.name}</b>
                          <span className="spacer" />
                          <ArrowRight size={14} className="faint" aria-hidden />
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
                    </motion.div>
                  );
                })}
                {!suggestions.length && <p className="small faint">No placements found for that combination. Try more designers or another strategy.</p>}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="wizard-foot">
        {step > 0 && <button className="btn ghost" onClick={() => go(step - 1)}><ArrowLeft size={14} /> Back</button>}
        <span className="spacer" />
        <button className="btn ghost" onClick={closeBalancer}>Cancel</button>
        {step === 0 && <button className="btn primary" disabled={!canNext} onClick={() => go(1)}>Next <ArrowRight size={14} /></button>}
        {step === 1 && <button className="btn primary" disabled={!canNext} onClick={run}><Sparkles size={14} /> Suggest assignments</button>}
        {step === 2 && <button className="btn primary" disabled={!picked.size} onClick={apply}><Check size={14} /> Apply {picked.size}</button>}
      </div>
    </div>
  );
}

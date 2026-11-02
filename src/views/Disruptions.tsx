import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from '../feedback';
import { ease, staggerChild, staggerParent } from '../lib/motion';
import { useStore } from '../store';
import { useDesigners, useQuarterStart, useWorkspace, useWorkspaceDisruptions } from '../hooks';
import type { Disruption, ID } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { formatWeekRange } from '../lib/quarters';
import { WeekPicker } from '../components/WeekPicker';
import CurveEditor from '../components/CurveEditor';
import { Avatar, EmptyState, Field, Slider, TextInput } from '../components/ui';
import { Checkbox, NumberField, Select } from '../components/inputs';

export default function Disruptions() {
  const designers = useDesigners();
  const workspace = useWorkspace()!;
  const disruptions = useWorkspaceDisruptions();
  const qStart = useQuarterStart();
  const add = useStore((s) => s.addDisruption);
  const [editing, setEditing] = useState<ID | null>(null);

  const inWindow = (d: Disruption) => d.startAbsWeek < qStart + WEEKS_PER_QUARTER && d.startAbsWeek + d.duration > qStart;

  const addFor = (designerId: ID) => {
    const before = new Set(useStore.getState().disruptions.map((d) => d.id));
    add({
      designerIds: [designerId],
      type: workspace.config.disruptionTypes[0] ?? 'PTO',
      label: '',
      startAbsWeek: qStart,
      duration: 1,
      allocation: 100,
      curve: { shape: 'flat' },
    });
    const created = useStore.getState().disruptions.find((d) => !before.has(d.id));
    if (created) setEditing(created.id);
  };

  return (
    <div className="view">
      {!designers.length && <EmptyState icon={Users} title="No designers yet">Add designers in Settings → Team.</EmptyState>}
      <motion.div className="cards" variants={staggerParent} initial="initial" animate="animate">
        {designers.map((d) => {
          const mine = disruptions.filter((x) => x.designerIds.includes(d.id)).sort((a, b) => a.startAbsWeek - b.startAbsWeek);
          const shown = mine.filter(inWindow);
          const hidden = mine.length - shown.length;
          return (
            <motion.div key={d.id} className="card card-pad col" style={{ gap: 8 }} variants={staggerChild}>
              <div className="row">
                <Avatar designer={d} size="lg" />
                <b>{d.name}</b>
                <span className="spacer" />
                <button className="btn sm" onClick={() => addFor(d.id)}><Plus size={14} /> Add</button>
              </div>
              <AnimatePresence initial={false} mode="popLayout">
              {shown.map((x) =>
                editing === x.id ? (
                  <DisruptionEditor key={x.id + ':edit'} d={x} onDone={() => setEditing(null)} />
                ) : (
                  <motion.div key={x.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="list-row focus-item" style={{ margin: 0 }} onClick={() => setEditing(x.id)}>
                    <span style={{ width: 14, height: 14, flex: 'none', borderRadius: 3, background: 'repeating-linear-gradient(-45deg, var(--text-3) 0 2px, transparent 2px 5px)' }} />
                    <div className="col" style={{ gap: 0, minWidth: 0 }}>
                      <span className="small" style={{ fontWeight: 500 }}>{x.type}{x.label ? ` — ${x.label}` : ''}</span>
                      <span className="tiny muted">{formatWeekRange(x.startAbsWeek, x.duration)} · {x.allocation}%{x.designerIds.length > 1 ? ` · shared with ${x.designerIds.length - 1}` : ''}</span>
                    </div>
                  </motion.div>
                ),
              )}
              </AnimatePresence>
              {!shown.length && <span className="small faint">No disruptions this quarter.</span>}
              {hidden > 0 && <span className="tiny faint">+{hidden} in other quarters</span>}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function DisruptionEditor({ d, onDone }: { d: Disruption; onDone: () => void }) {
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const update = useStore((s) => s.updateDisruption);
  const remove = useStore((s) => s.removeDisruption);
  const up = (patch: Partial<Disruption>) => update(d.id, patch);

  return (
    <motion.div
      layout
      className="col"
      style={{ gap: 12, padding: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', transition: { duration: 0.24, ease: ease.out } }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
    >
      <div className="grid2">
        <Field label="Type">
          <Select
            size="sm"
            value={d.type}
            onChange={(v) => up({ type: v })}
            ariaLabel="Type"
            options={[...(workspace.config.disruptionTypes.includes(d.type) ? [] : [d.type]), ...workspace.config.disruptionTypes].map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field label="Label">
          <TextInput className="input sm" value={d.label} onCommit={(v) => up({ label: v })} placeholder="Optional" />
        </Field>
        <Field label="Start week">
          <WeekPicker size="sm" value={d.startAbsWeek} onChange={(w) => up({ startAbsWeek: w })} ariaLabel="Start week" />
        </Field>
        <Field label="Duration (weeks)">
          <NumberField size="sm" value={d.duration} min={1} max={52} onChange={(v) => up({ duration: v })} ariaLabel="Duration in weeks" />
        </Field>
      </div>
      <div className="field">
        <div className="row"><label className="label">Allocation</label><span className="spacer" /><b className="num">{d.allocation}%</b></div>
        <Slider value={d.allocation} min={5} max={100} step={5} onChange={(v) => up({ allocation: v })} ariaLabel="Disruption allocation" format={(v) => `${v}%`} color="var(--text-3)" />
      </div>
      <span className="tiny muted">{formatWeekRange(d.startAbsWeek, d.duration)}</span>
      {d.duration > 1 && <CurveEditor curve={d.curve} duration={d.duration} max={d.allocation} onChange={(curve) => up({ curve })} color="var(--text-3)" />}
      <Field label="Applies to">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {designers.map((x) => (
            <Checkbox
              key={x.id}
              className="small"
              checked={d.designerIds.includes(x.id)}
              onChange={(on) => {
                const ids = on ? [...d.designerIds, x.id] : d.designerIds.filter((i) => i !== x.id);
                if (ids.length) up({ designerIds: ids });
              }}
            >
              {x.name}
            </Checkbox>
          ))}
        </div>
      </Field>
      <div className="row">
        <button
          className="btn sm ghost danger"
          onClick={() => {
            const snapshot = { ...d };
            remove(d.id);
            toast(`Removed ${d.type}`, { action: { label: 'Undo', run: () => useStore.getState().addDisruption(snapshot) } });
          }}
        >
          <Trash2 size={13} /> Remove
        </button>
        <span className="spacer" />
        <button className="btn sm primary" onClick={onDone}>Done</button>
      </div>
    </motion.div>
  );
}

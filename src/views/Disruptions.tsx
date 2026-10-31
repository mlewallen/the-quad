import { useState } from 'react';
import { useStore } from '../store';
import { useDesigners, useQuarterStart, useWorkspace, useWorkspaceDisruptions } from '../hooks';
import type { Disruption, ID } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { absWeekFromInput, dateInputValue, formatWeekRange } from '../lib/quarters';
import CurveEditor from '../components/CurveEditor';
import { Avatar, Field, TextInput } from '../components/ui';

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
      <div className="view-head">
        <h1>Disruptions</h1>
        <span className="muted small">PTO, on-call, interviews and other time that isn't project work. These reduce available capacity everywhere.</span>
      </div>
      <div className="cards">
        {designers.map((d) => {
          const mine = disruptions.filter((x) => x.designerIds.includes(d.id)).sort((a, b) => a.startAbsWeek - b.startAbsWeek);
          const shown = mine.filter(inWindow);
          const hidden = mine.length - shown.length;
          return (
            <div key={d.id} className="card card-pad col" style={{ gap: 8 }}>
              <div className="row">
                <Avatar designer={d} size="lg" />
                <b>{d.name}</b>
                <span className="spacer" />
                <button className="btn sm" onClick={() => addFor(d.id)}>+ Add</button>
              </div>
              {shown.map((x) =>
                editing === x.id ? (
                  <DisruptionEditor key={x.id} d={x} onDone={() => setEditing(null)} />
                ) : (
                  <div key={x.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setEditing(x.id)}>
                    <span style={{ width: 14, height: 14, flex: 'none', borderRadius: 3, background: 'repeating-linear-gradient(-45deg, var(--text-3) 0 2px, transparent 2px 5px)' }} />
                    <div className="col" style={{ gap: 0, minWidth: 0 }}>
                      <span className="small" style={{ fontWeight: 500 }}>{x.type}{x.label ? ` — ${x.label}` : ''}</span>
                      <span className="tiny muted">{formatWeekRange(x.startAbsWeek, x.duration)} · {x.allocation}%{x.designerIds.length > 1 ? ` · shared with ${x.designerIds.length - 1}` : ''}</span>
                    </div>
                  </div>
                ),
              )}
              {!shown.length && <span className="small faint">No disruptions this quarter.</span>}
              {hidden > 0 && <span className="tiny faint">+{hidden} in other quarters</span>}
            </div>
          );
        })}
      </div>
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
    <div className="col" style={{ gap: 10, padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
      <div className="grid2">
        <Field label="Type">
          <select className="select sm" value={d.type} onChange={(e) => up({ type: e.target.value })}>
            {!workspace.config.disruptionTypes.includes(d.type) && <option>{d.type}</option>}
            {workspace.config.disruptionTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Label">
          <TextInput className="input sm" value={d.label} onCommit={(v) => up({ label: v })} placeholder="Optional" />
        </Field>
        <Field label="Start week">
          <input
            className="input sm"
            type="date"
            value={dateInputValue(d.startAbsWeek)}
            onChange={(e) => {
              const w = absWeekFromInput(e.target.value);
              if (w != null) up({ startAbsWeek: w });
            }}
          />
        </Field>
        <Field label="Duration (weeks)">
          <input className="input sm" type="number" min={1} max={52} value={d.duration} onChange={(e) => up({ duration: Math.max(1, Number(e.target.value) || 1) })} />
        </Field>
      </div>
      <Field label={`Allocation — ${d.allocation}%`}>
        <input type="range" min={5} max={100} step={5} value={d.allocation} onChange={(e) => up({ allocation: Number(e.target.value) })} />
      </Field>
      <span className="tiny muted">{formatWeekRange(d.startAbsWeek, d.duration)}</span>
      {d.duration > 1 && <CurveEditor curve={d.curve} duration={d.duration} max={d.allocation} onChange={(curve) => up({ curve })} color="var(--text-3)" />}
      <Field label="Applies to">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {designers.map((x) => (
            <label key={x.id} className="row small" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={d.designerIds.includes(x.id)}
                onChange={(e) => {
                  const ids = e.target.checked ? [...d.designerIds, x.id] : d.designerIds.filter((i) => i !== x.id);
                  if (ids.length) up({ designerIds: ids });
                }}
              />
              {x.name}
            </label>
          ))}
        </div>
      </Field>
      <div className="row">
        <button className="btn sm danger" onClick={() => remove(d.id)}>Remove</button>
        <span className="spacer" />
        <button className="btn sm primary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

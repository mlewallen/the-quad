import { useState } from 'react';
import { STORAGE_KEY, useStore } from '../store';
import { navigate, useWorkspace } from '../hooks';
import type { FieldLabels, PersistedState, TeamType, ThemeMode } from '../types';
import { ACCENT_PRESETS, DESIGNER_COLORS, TEAM_TYPES } from '../lib/defaults';
import { MONTHS, quarterLabel } from '../lib/quarters';
import Import from './Import';
import { Avatar, Field, ListEditor, TextInput } from './ui';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'team', label: 'Team' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'import', label: 'Import' },
  { id: 'data', label: 'Data' },
];

export default function SettingsPanel({ section }: { section: string }) {
  const active = SECTIONS.find((s) => s.id === section)?.id ?? 'appearance';
  return (
    <div>
      <div className="row" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <h2>Settings</h2>
        <span className="spacer" />
        <button className="btn icon ghost" aria-label="Close settings" onClick={() => navigate({ settings: null })}>✕</button>
      </div>
      <div className="settings">
        <nav>
          {SECTIONS.map((s) => (
            <button key={s.id} className={s.id === active ? 'on' : ''} onClick={() => navigate({ settings: s.id }, true)}>{s.label}</button>
          ))}
        </nav>
        <div className="pane">
          {active === 'appearance' && <Appearance />}
          {active === 'team' && <Team />}
          {active === 'workspace' && <WorkspaceSettings />}
          {active === 'import' && <Import />}
          {active === 'data' && <Data />}
        </div>
      </div>
    </div>
  );
}

function Appearance() {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  return (
    <>
      <Field label="Theme">
        <div className="segmented">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((t) => (
            <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => update({ theme: t })} style={{ textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>
      </Field>
      <Field label="Accent color">
        <div className="row">
          <div className="swatches">
            {ACCENT_PRESETS.map((c) => (
              <button key={c} className={`swatch-btn ${s.accent === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => update({ accent: c })} />
            ))}
          </div>
          <input type="color" value={s.accent} onChange={(e) => update({ accent: e.target.value })} aria-label="Custom accent" />
        </div>
      </Field>
      <Field label={`UI scale — ${Math.round(s.uiScale * 100)}%`}>
        <input type="range" min={0.8} max={1.3} step={0.05} value={s.uiScale} onChange={(e) => update({ uiScale: Number(e.target.value) })} style={{ maxWidth: 320 }} />
      </Field>
      <Field label="Open details as">
        <div className="segmented">
          {(['panel', 'modal', 'page'] as const).map((m) => (
            <button key={m} className={s.detailMode === m ? 'on' : ''} onClick={() => update({ detailMode: m })} style={{ textTransform: 'capitalize' }}>
              {m === 'panel' ? 'Side panel' : m === 'modal' ? 'Modal' : 'Full page'}
            </button>
          ))}
        </div>
      </Field>
      <label className="row">
        <input type="checkbox" checked={s.celebrations} onChange={(e) => update({ celebrations: e.target.checked })} />
        Celebration moments
      </label>
    </>
  );
}

function Team() {
  const ws = useWorkspace()!;
  const { addDesigner, updateDesigner, removeDesigner } = useStore.getState();
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    addDesigner(name.trim());
    setName('');
  };
  return (
    <>
      <div>
        <h2>Team</h2>
        <p className="small muted">Designers in {ws.name}.</p>
      </div>
      <div className="col">
        {ws.designers.map((d) => (
          <div key={d.id} className="row">
            <Avatar designer={d} />
            <input type="color" value={d.color} onChange={(e) => updateDesigner(d.id, { color: e.target.value })} aria-label={`Color for ${d.name}`} />
            <TextInput value={d.name} onCommit={(v) => v.trim() && updateDesigner(d.id, { name: v.trim() })} />
            <button
              className="btn sm danger ghost"
              onClick={() => confirm(`Remove ${d.name}? Their work moves to the backlog and their disruptions are removed.`) && removeDesigner(d.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <input className="input" placeholder="New designer name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary" onClick={add}>Add</button>
      </div>
      <p className="tiny faint">New designers get the next free color from: {DESIGNER_COLORS.slice(0, 6).map((c) => <span key={c} className="dot" style={{ background: c, width: 8, height: 8, marginRight: 2 }} />)}</p>
    </>
  );
}

function WorkspaceSettings() {
  const ws = useWorkspace()!;
  const workspaces = useStore((s) => s.workspaces);
  const fiscal = useStore((s) => s.settings.fiscalStartMonth);
  const { updateWorkspace, createWorkspace, deleteWorkspace, updateSettings, setActiveWorkspace } = useStore.getState();
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<TeamType>('product');
  const cfg = ws.config;
  const setCfg = (patch: Partial<typeof cfg>) => updateWorkspace(ws.id, { config: { ...cfg, ...patch } });
  const setLabel = (k: keyof FieldLabels, v: string) => setCfg({ labels: { ...cfg.labels, [k]: v } });

  return (
    <>
      <div className="grid2">
        <Field label="Workspace name"><TextInput value={ws.name} onCommit={(v) => v.trim() && updateWorkspace(ws.id, { name: v.trim() })} /></Field>
        <Field label="Fiscal year starts in (all workspaces)">
          <select className="select" value={fiscal} onChange={(e) => updateSettings({ fiscalStartMonth: Number(e.target.value) })}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </Field>
      </div>

      <div className="card card-pad col">
        <h3>Workspaces</h3>
        {workspaces.map((w) => (
          <div key={w.id} className="row">
            <b className="ellipsis">{w.name}</b>
            <span className="chip">{w.designers.length} designers</span>
            <span className="spacer" />
            {w.id === ws.id ? <span className="chip accent">Current</span> : <button className="btn sm" onClick={() => setActiveWorkspace(w.id)}>Switch</button>}
            <button
              className="btn sm ghost danger"
              disabled={workspaces.length < 2}
              onClick={() => confirm(`Delete workspace "${w.name}" and all its data?`) && deleteWorkspace(w.id)}
            >
              Delete
            </button>
          </div>
        ))}
        <div className="row">
          <input className="input" placeholder="New workspace name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select className="select" style={{ width: 160 }} value={newType} onChange={(e) => setNewType(e.target.value as TeamType)}>
            {TEAM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            className="btn primary"
            disabled={!newName.trim()}
            onClick={() => {
              createWorkspace(newName.trim(), newType);
              setNewName('');
              navigate({ settings: 'team' }, true);
            }}
          >
            Create
          </button>
        </div>
      </div>

      <div className="grid2">
        <Field label="Design phases"><ListEditor items={cfg.phases} onChange={(phases) => setCfg({ phases })} /></Field>
        <Field label="Work types"><ListEditor items={cfg.workTypes} onChange={(workTypes) => setCfg({ workTypes })} /></Field>
        <Field label="Disruption types"><ListEditor items={cfg.disruptionTypes} onChange={(disruptionTypes) => setCfg({ disruptionTypes })} /></Field>
        <Field label="Milestone types"><ListEditor items={cfg.milestoneTypes} onChange={(milestoneTypes) => setCfg({ milestoneTypes })} /></Field>
      </div>
      <p className="tiny faint">Work types named Design, Consult and Monitor use built-in size profiles; others use the Design profile.</p>

      <div>
        <h3 style={{ marginBottom: 8 }}>Terminology</h3>
        <div className="grid3">
          {(Object.keys(cfg.labels) as (keyof FieldLabels)[]).map((k) => (
            <Field key={k} label={k.replace(/([A-Z])/g, ' $1')}>
              <TextInput className="input sm" value={cfg.labels[k]} onCommit={(v) => v.trim() && setLabel(k, v.trim())} />
            </Field>
          ))}
        </div>
      </div>
    </>
  );
}

function Data() {
  const state = useStore();
  const q = state.currentQuarter;
  const [msg, setMsg] = useState<string | null>(null);

  const exportJson = () => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
    const blob = new Blob([JSON.stringify(JSON.parse(raw), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `the-quad-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const data: PersistedState = parsed.state ?? parsed;
      if (!Array.isArray(data.workspaces)) throw new Error('Missing workspaces');
      if (!confirm('Replace all current data with this backup?')) return;
      state.replaceAll({ ...data, version: parsed.version ?? data.version ?? 0 });
      setMsg('Backup restored.');
    } catch (e) {
      setMsg(`Couldn’t read that file: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <div className="col">
        <h3>Export</h3>
        <p className="small muted">Download everything (all workspaces, quarters, plans) as JSON.</p>
        <div className="row">
          <button className="btn" onClick={exportJson}>Export JSON</button>
          <label className="btn">
            Restore from JSON…
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div className="col">
        <h3>Clear quarter</h3>
        <p className="small muted">Remove every item and plan in {quarterLabel(q)} for this workspace. Disruptions are kept.</p>
        <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={() => confirm(`Clear all ${quarterLabel(q)} data?`) && state.clearQuarter()}>
          Clear {quarterLabel(q)}
        </button>
      </div>
      <div className="col">
        <h3>Factory reset</h3>
        <p className="small muted">Erase all data in this browser and start onboarding again.</p>
        <button
          className="btn danger"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            if (confirm('Erase everything? Export first if you want a backup.')) {
              state.factoryReset();
              navigate({ settings: null, project: null, page: false }, true);
            }
          }}
        >
          Factory reset
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </>
  );
}

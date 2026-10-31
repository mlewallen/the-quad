import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BadgeCheck, Building2, Database, Download, Layers, Lock, Maximize2, Monitor, Moon, PanelRight, Palette, PartyPopper, Pipette, Play,
  Plus, RotateCcw, Sparkles, SquareStack, Sun, Trash2, Trophy, Upload, Users, X, type LucideIcon,
} from 'lucide-react';
import { confirmDialog, toast } from '../feedback';
import { STORAGE_KEY, useStore } from '../store';
import { entriesFor, navigate, useActivePlan, useQuarterProjects, useWorkspace } from '../hooks';
import type { FieldLabels, PersistedState, TeamType, ThemeMode } from '../types';
import { ACCENT_PRESETS, TEAM_TYPES } from '../lib/defaults';
import { CELEBRATIONS, type CelebrationId } from '../lib/celebrations';
import { MONTHS, formatDate, quarterLabel } from '../lib/quarters';
import { ease, staggerChild, staggerParent } from '../lib/motion';
import Import from './Import';
import { ListEditor, Slider, Switch, TextInput } from './ui';

interface SectionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, description: 'How The Quad looks and behaves in this browser.' },
  { id: 'team', label: 'Team', icon: Users, description: 'The designers you plan for in this workspace.' },
  { id: 'workspace', label: 'Workspace', icon: Building2, description: 'Workspace details, workflow options and the words your team uses.' },
  { id: 'celebrations', label: 'Celebrations', icon: Trophy, description: 'Small moments of delight, and the ones you have left to find.' },
  { id: 'import', label: 'Import', icon: Upload, description: 'Bring projects in from a spreadsheet, CSV file or Google Sheet.' },
  { id: 'data', label: 'Data', icon: Database, description: 'Back up, restore, or clear the data stored in this browser.' },
];

export default function SettingsPanel({ section }: { section: string }) {
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  return (
    <div className="settings">
      <nav aria-label="Settings sections">
        <div className="settings-title">Settings</div>
        {SECTIONS.map((s) => (
          <button key={s.id} className={s.id === active.id ? 'on' : ''} onClick={() => navigate({ settings: s.id }, true)} aria-current={s.id === active.id ? 'page' : undefined}>
            {s.id === active.id && <motion.span layoutId="settings-active" className="settings-active" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
            <s.icon size={16} strokeWidth={1.75} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-main">
        <button className="btn icon ghost settings-close" aria-label="Close settings" onClick={() => navigate({ settings: null })}><X size={16} /></button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active.id}
            className="pane"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
          >
            <header className="pane-head">
              <h2>{active.label}</h2>
              <p>{active.description}</p>
            </header>
            {active.id === 'appearance' && <Appearance />}
            {active.id === 'team' && <Team />}
            {active.id === 'workspace' && <WorkspaceSettings />}
            {active.id === 'celebrations' && <Celebrations />}
            {active.id === 'import' && <Group><div className="set-pad"><Import /></div></Group>}
            {active.id === 'data' && <Data />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------- layout primitives ---------- */

function Group({ title, description, children, tone }: { title?: string; description?: ReactNode; children: ReactNode; tone?: 'danger' }) {
  return (
    <section className={`set-group ${tone ?? ''}`}>
      {(title || description) && (
        <div className="set-group-head">
          {title && <h3>{title}</h3>}
          {description && <p>{description}</p>}
        </div>
      )}
      <div className="set-card">{children}</div>
    </section>
  );
}

/** One setting: label + description on the left, control on the right (or below when `stack`). */
function Row({ label, description, children, stack }: { label: ReactNode; description?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`set-row ${stack ? 'stack' : ''}`}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {description && <div className="set-desc">{description}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon?: LucideIcon }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.icon && <o.icon size={14} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- sections ---------- */

function Appearance() {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  const custom = !ACCENT_PRESETS.includes(s.accent);
  return (
    <>
      <Group title="Look & feel" description="Saved in this browser only, so each person can set their own.">
        <Row label="Theme" description="Follow your operating system, or always use light or dark.">
          <Segmented<ThemeMode>
            label="Theme"
            value={s.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Monitor },
            ]}
          />
        </Row>
        <Row label="Accent color" description="Used for primary buttons, highlights and the active plan.">
          <div className="swatches">
            {ACCENT_PRESETS.map((c) => (
              <button key={c} className={`swatch-btn ${s.accent === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} aria-pressed={s.accent === c} onClick={() => update({ accent: c })} />
            ))}
            <label className={`swatch-btn custom ${custom ? 'on' : ''}`} style={custom ? { background: s.accent } : undefined} title="Custom color">
              <Pipette size={13} />
              <input type="color" value={s.accent} onChange={(e) => update({ accent: e.target.value })} aria-label="Custom accent color" />
            </label>
          </div>
        </Row>
        <Row label="Interface scale" description="Make everything larger or smaller. 100% is the default.">
          <div className="row" style={{ gap: 12, width: 260 }}>
            <Slider value={s.uiScale} min={0.8} max={1.3} step={0.05} onChange={(v) => update({ uiScale: v })} ariaLabel="Interface scale" format={(v) => `${Math.round(v * 100)}%`} marks={[1]} />
            <b className="num" style={{ width: 40, textAlign: 'right' }}>{Math.round(s.uiScale * 100)}%</b>
          </div>
        </Row>
      </Group>

      <Group title="Layout" description="Where things open when you click into them.">
        <Row label="Project details" description="A side panel keeps your view visible. A modal focuses on one item. Full page gives the most room.">
          <Segmented
            label="Open details as"
            value={s.detailMode}
            onChange={(detailMode) => update({ detailMode })}
            options={[
              { id: 'panel', label: 'Side panel', icon: PanelRight },
              { id: 'modal', label: 'Modal', icon: SquareStack },
              { id: 'page', label: 'Full page', icon: Maximize2 },
            ]}
          />
        </Row>
        <Row label="Collapse sidebar" description={<>Show only icons in the left sidebar. Shortcut: <kbd>[</kbd></>}>
          <Switch checked={s.sidebarCollapsed} onChange={(v) => update({ sidebarCollapsed: v })} label="Collapse sidebar" />
        </Row>
      </Group>
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
    toast(`Added ${name.trim()}`, { tone: 'success' });
  };
  return (
    <Group title="Designers" description={<>Everyone you plan for in <b>{ws.name}</b>. Their color shows up on every bar, chart and avatar.</>}>
      <AnimatePresence initial={false}>
        {ws.designers.map((d) => (
          <motion.div key={d.id} className="set-row designer-row" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <label className="color-dot" style={{ background: d.color }} title="Change color">
              <input type="color" value={d.color} onChange={(e) => updateDesigner(d.id, { color: e.target.value })} aria-label={`Color for ${d.name}`} />
            </label>
            <TextInput value={d.name} onCommit={(v) => v.trim() && updateDesigner(d.id, { name: v.trim() })} />
            <button
              className="btn sm ghost icon danger"
              aria-label={`Remove ${d.name}`}
              title={`Remove ${d.name}`}
              onClick={async () => {
                if (await confirmDialog({ title: `Remove ${d.name}?`, body: 'Their work moves to the backlog and their disruptions are removed.', confirmLabel: 'Remove', destructive: true })) {
                  removeDesigner(d.id);
                  toast(`Removed ${d.name}`);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      {!ws.designers.length && <div className="set-row"><span className="small faint">No designers yet. Add your first one below.</span></div>}
      <div className="set-row designer-row add">
        <span className="color-dot empty"><Plus size={13} /></span>
        <input className="input" placeholder="New designer’s name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary sm" disabled={!name.trim()} onClick={add}>Add</button>
      </div>
    </Group>
  );
}

// Display names for the terminology keys (the keys themselves are stored in saved data).
const LABEL_NAMES: Record<keyof FieldLabels, string> = {
  initiative: 'Work item (singular)',
  initiatives: 'Work items (plural)',
  ticket: 'Ticket',
  reference: 'Reference',
  productArea: 'Product area',
  goal: 'Goal',
  gaTarget: 'GA target',
  pm: 'PM',
  em: 'EM',
};

const LABEL_HELP: Record<keyof FieldLabels, string> = {
  initiative: 'What you call one unit of planned work.',
  initiatives: 'The plural, used in headings and counts.',
  ticket: 'Tracker reference, e.g. a Jira key.',
  reference: 'Link to a doc, brief or Figma file.',
  productArea: 'The part of the product it belongs to.',
  goal: 'The quarterly goal it supports.',
  gaTarget: 'Target launch or GA date.',
  pm: 'Product partner.',
  em: 'Engineering partner.',
};

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
      <Group title="General">
        <Row label="Workspace name" description="Shown in the sidebar and the workspace switcher.">
          <div style={{ width: 260 }}><TextInput value={ws.name} onCommit={(v) => v.trim() && updateWorkspace(ws.id, { name: v.trim() })} /></div>
        </Row>
        <Row label="Fiscal year starts in" description="Q1 begins in this month and each quarter is 13 weeks. Applies to every workspace.">
          <select className="select" style={{ width: 180 }} value={fiscal} onChange={(e) => updateSettings({ fiscalStartMonth: Number(e.target.value) })}>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </Row>
      </Group>

      <Group title="Workspaces" description="Each workspace is a separate team with its own designers, plans and settings.">
        {workspaces.map((w) => (
          <div key={w.id} className="set-row">
            <div className="set-text">
              <div className="set-label row" style={{ gap: 8 }}>
                <span className="ws-avatar">{w.name[0]?.toUpperCase()}</span>
                {w.name}
                {w.id === ws.id && <span className="chip accent">Current</span>}
              </div>
              <div className="set-desc">{w.designers.length} designer{w.designers.length === 1 ? '' : 's'} · {TEAM_TYPES.find((t) => t.id === w.config.teamType)?.name}</div>
            </div>
            <div className="set-control">
              {w.id !== ws.id && <button className="btn sm" onClick={() => setActiveWorkspace(w.id)}>Switch</button>}
              <button
                className="btn sm ghost icon danger"
                aria-label={`Delete ${w.name}`}
                title={workspaces.length < 2 ? 'You need at least one workspace' : `Delete ${w.name}`}
                disabled={workspaces.length < 2}
                onClick={async () => {
                  if (await confirmDialog({ title: `Delete “${w.name}”?`, body: 'All of its plans, projects and disruptions are permanently removed.', confirmLabel: 'Delete workspace', destructive: true })) {
                    deleteWorkspace(w.id);
                    toast(`Deleted ${w.name}`);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        <div className="set-row">
          <div className="set-text">
            <div className="set-label">New workspace</div>
            <div className="set-desc">The team type sets sensible default phases, work types and terminology.</div>
          </div>
          <div className="set-control">
            <input className="input sm" style={{ width: 180 }} placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className="select sm" style={{ width: 150 }} value={newType} onChange={(e) => setNewType(e.target.value as TeamType)}>
              {TEAM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              className="btn sm primary"
              disabled={!newName.trim()}
              onClick={() => {
                createWorkspace(newName.trim(), newType);
                toast(`Created ${newName.trim()}`, { tone: 'success' });
                setNewName('');
                navigate({ settings: 'team' }, true);
              }}
            >
              Create
            </button>
          </div>
        </div>
      </Group>

      <Group title="Workflow options" description={`The choices offered in dropdowns across ${ws.name}. Press Enter to add an option.`}>
        <Row stack label="Design phases" description="The stages a project moves through, in order. Moving into a phase named “Approve” is celebrated.">
          <ListEditor items={cfg.phases} onChange={(phases) => setCfg({ phases })} placeholder="Add a phase…" />
        </Row>
        <Row stack label="Work types" description="Design, Consult and Monitor have built-in effort profiles for duration recommendations. Custom types use the Design profile.">
          <ListEditor items={cfg.workTypes} onChange={(workTypes) => setCfg({ workTypes })} placeholder="Add a work type…" />
        </Row>
        <Row stack label="Disruption types" description="Kinds of non-project time, such as PTO or on-call.">
          <ListEditor items={cfg.disruptionTypes} onChange={(disruptionTypes) => setCfg({ disruptionTypes })} placeholder="Add a disruption type…" />
        </Row>
        <Row stack label="Milestone types" description="Markers you can place on a project’s timeline.">
          <ListEditor items={cfg.milestoneTypes} onChange={(milestoneTypes) => setCfg({ milestoneTypes })} placeholder="Add a milestone type…" />
        </Row>
      </Group>

      <Group title="Terminology" description="Rename fields to match how your team talks. Changes apply everywhere in this workspace.">
        {(Object.keys(cfg.labels) as (keyof FieldLabels)[]).map((k) => (
          <Row key={k} label={LABEL_NAMES[k]} description={LABEL_HELP[k]}>
            <div style={{ width: 220 }}><TextInput className="input sm" value={cfg.labels[k]} onCommit={(v) => v.trim() && setLabel(k, v.trim())} /></div>
          </Row>
        ))}
      </Group>
    </>
  );
}

const CELEBRATION_ICONS: Record<CelebrationId, LucideIcon> = {
  'first-initiative': Sparkles,
  approve: BadgeCheck,
  'all-confirmed': Lock,
  'ten-plans': Layers,
};

function Celebrations() {
  const enabled = useStore((s) => s.settings.celebrations);
  const unlocked = useStore((s) => s.unlocked);
  const totalPlans = useStore((s) => s.totalPlansCreated);
  const update = useStore((s) => s.updateSettings);
  const plan = useActivePlan();
  const projects = useQuarterProjects();
  const es = entriesFor(projects, plan);
  const count = CELEBRATIONS.filter((c) => c.id in unlocked).length;

  const progress: Partial<Record<CelebrationId, { n: number; of: number; label: string }>> = {
    'ten-plans': { n: Math.min(totalPlans, 10), of: 10, label: `${Math.min(totalPlans, 10)} of 10 plans` },
    'all-confirmed': es.length ? { n: es.filter((e) => e.schedule.confirmed).length, of: es.length, label: `${es.filter((e) => e.schedule.confirmed).length} of ${es.length} confirmed in ${plan?.name}` } : undefined,
  };

  const replay = (title: string) =>
    useStore.setState({ celebration: { id: Date.now(), message: `Replaying “${title}”` } });

  return (
    <>
      <Group title="Celebration moments" description="A quick burst of confetti when you hit a meaningful planning milestone.">
        <Row label="Play celebrations" description="Turn this off for a calmer workspace. Unlocks below are still recorded either way.">
          <Switch checked={enabled} onChange={(v) => update({ celebrations: v })} label="Play celebrations" />
        </Row>
      </Group>

      <section className="set-group">
        <div className="set-group-head row" style={{ alignItems: 'flex-end' }}>
          <div className="col" style={{ gap: 2 }}>
            <h3>Treasure key</h3>
            <p>Every celebration you can unlock. Locked ones show what to do to find them.</p>
          </div>
          <span className="spacer" />
          <div className="treasure-progress">
            <b className="num">{count}/{CELEBRATIONS.length}</b>
            <div className="share-bar" style={{ width: 120 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(count / CELEBRATIONS.length) * 100}%` }} transition={{ duration: 0.6, ease: ease.out }} style={{ background: 'var(--accent)' }} />
            </div>
          </div>
        </div>
        <motion.div className="treasure-grid" variants={staggerParent} initial="initial" animate="animate">
          {CELEBRATIONS.map((c) => {
            const Icon = CELEBRATION_ICONS[c.id];
            const at = unlocked[c.id];
            const isUnlocked = at !== undefined;
            const p = progress[c.id];
            return (
              <motion.div key={c.id} className={`treasure ${isUnlocked ? 'unlocked' : 'locked'}`} variants={staggerChild}>
                <div className="treasure-icon">{isUnlocked ? <Icon size={20} /> : <Lock size={18} />}</div>
                <div className="col" style={{ gap: 3, minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <b>{c.title}</b>
                    {isUnlocked && <span className="chip ok"><PartyPopper size={11} /> Unlocked</span>}
                  </div>
                  <span className="small muted">{isUnlocked ? c.flavor : c.how}</span>
                  {isUnlocked ? (
                    <div className="row tiny faint" style={{ marginTop: 4 }}>
                      <span>{at ? `Unlocked ${formatDate(at, true)}` : 'Unlocked earlier'}</span>
                      <span className="spacer" />
                      <button className="btn sm ghost" onClick={() => replay(c.title)} disabled={!enabled} title={enabled ? 'Replay this celebration' : 'Turn on celebrations to replay'}>
                        <Play size={12} /> Replay
                      </button>
                    </div>
                  ) : p ? (
                    <div className="col" style={{ gap: 4, marginTop: 6 }}>
                      <div className="share-bar"><div style={{ width: `${(p.n / p.of) * 100}%`, background: 'var(--text-3)' }} /></div>
                      <span className="tiny faint">{p.label}</span>
                    </div>
                  ) : (
                    <span className="tiny faint" style={{ marginTop: 4 }}>Not found yet</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>
    </>
  );
}

function Data() {
  const state = useStore();
  const q = state.currentQuarter;

  const exportJson = () => {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
    const blob = new Blob([JSON.stringify(JSON.parse(raw), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `the-quad-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded', { tone: 'success' });
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const data: PersistedState = parsed.state ?? parsed;
      if (!Array.isArray(data.workspaces)) throw new Error('Missing workspaces');
      if (!(await confirmDialog({ title: 'Restore this backup?', body: 'All current data in this browser is replaced.', confirmLabel: 'Restore', destructive: true }))) return;
      state.replaceAll({ ...data, version: parsed.version ?? data.version ?? 0 });
      toast('Backup restored', { tone: 'success' });
    } catch (e) {
      toast(`Couldn’t read that file: ${(e as Error).message}`, { tone: 'danger' });
    }
  };

  return (
    <>
      <Group title="Backup" description="Everything lives in this browser. Export regularly if you rely on it, or to move to another computer.">
        <Row label="Export all data" description="Downloads every workspace, quarter, plan and setting as a JSON file.">
          <button className="btn sm" onClick={exportJson}><Download size={14} /> Export JSON</button>
        </Row>
        <Row label="Restore from backup" description="Replaces everything here with the contents of an exported file.">
          <label className="btn sm">
            <Upload size={14} /> Choose file…
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
        </Row>
      </Group>

      <Group title="Danger zone" description="These can’t be undone. Export a backup first if you might need the data again." tone="danger">
        <Row label={`Clear ${quarterLabel(q)}`} description="Removes every project and plan in this quarter for the current workspace. Disruptions are kept.">
          <button
            className="btn sm danger"
            onClick={async () => {
              if (await confirmDialog({ title: `Clear ${quarterLabel(q)}?`, body: 'Every project and plan in this quarter is removed.', confirmLabel: 'Clear quarter', destructive: true })) {
                state.clearQuarter();
                toast(`${quarterLabel(q)} cleared`);
              }
            }}
          >
            <Trash2 size={14} /> Clear quarter
          </button>
        </Row>
        <Row label="Factory reset" description="Erases all workspaces and settings in this browser and restarts onboarding.">
          <button
            className="btn sm destructive"
            onClick={async () => {
              if (await confirmDialog({ title: 'Erase everything?', body: 'All workspaces and plans in this browser are deleted. Export first if you want a backup.', confirmLabel: 'Factory reset', destructive: true })) {
                state.factoryReset();
                navigate({ settings: null, project: null, page: false }, true);
              }
            }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </Row>
      </Group>
    </>
  );
}

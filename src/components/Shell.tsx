import { motion } from 'motion/react';
import {
  CalendarOff, ChartGantt, Check, ClipboardPaste, Layers, ChevronLeft, ChevronRight, ChevronsUpDown, Copy, Focus, Gauge, Inbox, LayoutDashboard,
  LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Sun, Table2, UserRound, type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store';
import {
  entriesFor, navigate, openDesigner, openProject, useActivePlan, useDesigners, useEntries, useLoad, useQuarterPlans, useQuarterProjects, useWorkspace, VIEWS, type NavView, type View,
} from '../hooks';
import { openImporter, useFeedback, toast } from '../feedback';
import { loadLevel as loadLevelOf, summarize } from '../lib/capacity';
import { formatDate, quarterLabel, quarterStartUtc } from '../lib/quarters';
import { spring } from '../lib/motion';
import { MenuDivider, MenuItem, MenuLabel, Popover } from './Popover';
import { signOut, useAccount } from '../account';

export const VIEW_ICONS: Record<NavView, LucideIcon> = {
  home: LayoutDashboard,
  gantt: ChartGantt,
  allocation: Gauge,
  disruptions: CalendarOff,
  focus: Focus,
  manage: Table2,
  backlog: Inbox,
};

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export function Sidebar({ view, designerId }: { view: View; designerId: string | null }) {
  const collapsed = useStore((s) => s.settings.sidebarCollapsed);
  const theme = useStore((s) => s.settings.theme);
  const update = useStore((s) => s.updateSettings);
  const entries = useEntries();
  const designers = useDesigners();
  const { load } = useLoad();
  const backlog = entries.filter((e) => !e.schedule.designerId).length;
  const overloaded = designers.filter((d) => summarize(load[d.id] ?? []).over > 0).length;
  const counts: Partial<Record<NavView, { n: number; tone?: 'danger' }>> = {
    backlog: backlog ? { n: backlog } : undefined,
    allocation: overloaded ? { n: overloaded, tone: 'danger' } : undefined,
  };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';

  return (
    <motion.aside
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      animate={{ width: collapsed ? 56 : 236 }}
      transition={spring.smooth}
      initial={false}
    >
      <WorkspaceSwitcher collapsed={collapsed} />

      <nav className="nav" aria-label="Views">
        {VIEWS.map((v, i) => {
          const Icon = VIEW_ICONS[v.id];
          const on = v.id === view;
          const c = counts[v.id];
          return (
            <a key={v.id} href={`#/${v.id}`} className={`nav-item ${on ? 'on' : ''}`} title={collapsed ? `${v.label} (${i + 1})` : undefined} aria-current={on ? 'page' : undefined}>
              {on && <motion.span layoutId="nav-active" className="nav-active" transition={spring.snappy} />}
              <Icon size={17} strokeWidth={1.75} className="nav-icon" />
              {!collapsed && <span className="nav-label">{v.label}</span>}
              {c && <span className={`nav-count ${c.tone ?? ''} ${collapsed ? 'dot-only' : ''}`}>{collapsed ? '' : c.n}</span>}
              {!collapsed && !c && <kbd className="nav-kbd">{i + 1}</kbd>}
            </a>
          );
        })}
      </nav>

      {designers.length > 0 && (
        <div className="nav-group">
          {!collapsed && <div className="nav-section">Team</div>}
          {collapsed && <div className="nav-divider" />}
          <nav className="nav" aria-label="Designers">
            {designers.map((d) => {
              const on = view === 'designer' && designerId === d.id;
              const st = summarize(load[d.id] ?? []);
              return (
                <a
                  key={d.id}
                  href={`#/designer/${d.id}`}
                  className={`nav-item ${on ? 'on' : ''}`}
                  title={collapsed ? `${d.name} · ${Math.round(st.avg)}% avg` : undefined}
                  aria-current={on ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    openDesigner(d.id);
                  }}
                >
                  {on && <motion.span layoutId="nav-active" className="nav-active" transition={spring.snappy} />}
                  <span className="nav-avatar" style={{ background: d.color }}>{d.name[0]?.toUpperCase()}</span>
                  {!collapsed && <span className="nav-label ellipsis">{d.name}</span>}
                  {!collapsed && <span className={`nav-load lvl-text-${loadLevelOf(st.avg)}`}>{Math.round(st.avg)}%</span>}
                  {collapsed && st.over > 0 && <span className="nav-count dot-only danger" />}
                </a>
              );
            })}
          </nav>
        </div>
      )}

      <div className="sidebar-foot">
        <UserButton collapsed={collapsed} />
        <button className="nav-item" onClick={() => update({ theme: nextTheme })} title={`Theme: ${theme} (click for ${nextTheme})`}>
          <ThemeIcon size={17} strokeWidth={1.75} className="nav-icon" />
          {!collapsed && <span className="nav-label" style={{ textTransform: 'capitalize' }}>{theme} theme</span>}
        </button>
        <button className="nav-item" onClick={() => navigate({ settings: 'appearance' })} title="Settings">
          <Settings size={17} strokeWidth={1.75} className="nav-icon" />
          {!collapsed && <span className="nav-label">Settings</span>}
        </button>
        <button className="nav-item" onClick={() => update({ sidebarCollapsed: !collapsed })} title={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}>
          {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.75} className="nav-icon" /> : <PanelLeftClose size={17} strokeWidth={1.75} className="nav-icon" />}
          {!collapsed && <span className="nav-label">Collapse</span>}
          {!collapsed && <kbd className="nav-kbd">[</kbd>}
        </button>
      </div>
    </motion.aside>
  );
}

function UserButton({ collapsed }: { collapsed: boolean }) {
  const account = useAccount((s) => s.account);
  if (!account) return null;
  return (
    <Popover
      side="right"
      width={240}
      trigger={({ toggle, open }) => (
        <button className={`nav-item user-item ${open ? 'on' : ''}`} onClick={toggle} title={collapsed ? account.email : undefined} aria-haspopup="menu" aria-expanded={open}>
          <span className="nav-avatar user-avatar">{account.name[0]?.toUpperCase()}</span>
          {!collapsed && (
            <span className="col" style={{ gap: 0, minWidth: 0, flex: 1, textAlign: 'left' }}>
              <span className="ellipsis small" style={{ fontWeight: 600, color: 'var(--text)' }}>{account.name}</span>
              <span className="ellipsis tiny faint" style={{ fontSize: 11 }}>{account.email}</span>
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Signed in as {account.email}</MenuLabel>
          <MenuItem icon={<UserRound size={15} />} onSelect={() => { navigate({ settings: 'account' }); close(); }}>Account & email updates</MenuItem>
          <MenuDivider />
          <MenuItem icon={<LogOut size={15} />} onSelect={() => { close(); void signOut(); }}>Sign out</MenuItem>
        </>
      )}
    </Popover>
  );
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const workspaces = useStore((s) => s.workspaces);
  const setActive = useStore((s) => s.setActiveWorkspace);
  const ws = useWorkspace()!;
  return (
    <div className="sidebar-head">
      <Popover
        width={240}
        trigger={({ toggle, open }) => (
          <button className={`ws-trigger ${open ? 'open' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
            <span className="brand-mark" aria-hidden><i /><i /><i /><i /></span>
            {!collapsed && (
              <>
                <span className="col" style={{ gap: 0, minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <span className="ws-name ellipsis">{ws.name}</span>
                  <span className="ws-sub">The Quad · {ws.designers.length} designers</span>
                </span>
                <ChevronsUpDown size={14} className="faint" />
              </>
            )}
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuLabel>Workspaces</MenuLabel>
            {workspaces.map((w) => (
              <MenuItem
                key={w.id}
                active={w.id === ws.id}
                icon={<span className="ws-avatar">{w.name[0]?.toUpperCase()}</span>}
                hint={w.id === ws.id ? <Check size={14} /> : undefined}
                onSelect={() => {
                  setActive(w.id);
                  close();
                }}
              >
                {w.name}
              </MenuItem>
            ))}
            <MenuDivider />
            <MenuItem icon={<Plus size={15} />} onSelect={() => { navigate({ settings: 'workspace' }); close(); }}>New workspace…</MenuItem>
            <MenuItem icon={<Settings size={15} />} onSelect={() => { navigate({ settings: 'workspace' }); close(); }}>Workspace settings</MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

export function TopBar({ view, designerId }: { view: View; designerId: string | null }) {
  const q = useStore((s) => s.currentQuarter);
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const setQuarter = useStore((s) => s.setQuarter);
  const addInitiatives = useStore((s) => s.addInitiatives);
  const setPalette = useFeedback((s) => s.setPaletteOpen);
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const person = view === 'designer' ? designers.find((d) => d.id === designerId) : undefined;
  const meta = VIEWS.find((v) => v.id === view) ?? {
    label: person?.name ?? 'Designer',
    description: 'Quarterly workload, projects and insights',
  };
  const start = quarterStartUtc(q, sm);
  // Quarters are 13 weeks; show Monday of week 1 through Friday of week 13.
  const end = start + (13 * 7 - 3) * 86_400_000;
  const label = workspace.config.labels.initiative;

  return (
    <header className="topbar">
      <div className="col" style={{ gap: 1, minWidth: 0 }}>
        <motion.h1 key={view + (designerId ?? '')} className="page-title" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {meta.label}
        </motion.h1>
        <span className="page-sub ellipsis">{meta.description}</span>
      </div>
      <span className="spacer" />

      <div className="ctx-control quarter-stepper" role="group" aria-label="Quarter">
        <button className="btn icon ghost sm" aria-label="Previous quarter" onClick={() => setQuarter(q - 1)}><ChevronLeft size={16} /></button>
        <div className="col" style={{ gap: 0, alignItems: 'center', minWidth: 104 }}>
          <motion.span key={q} className="q" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            {quarterLabel(q)}
          </motion.span>
          <span className="sub">{formatDate(start)} – {formatDate(end)}</span>
        </div>
        <button className="btn icon ghost sm" aria-label="Next quarter" onClick={() => setQuarter(q + 1)}><ChevronRight size={16} /></button>
      </div>

      <PlanSwitcher />

      <button className="search-trigger" onClick={() => setPalette(true)} aria-label="Open command palette">
        <Search size={15} />
        <span>Search or jump…</span>
        <kbd>{MOD}K</kbd>
      </button>

      <div className="split-btn">
        <button
          className="btn primary"
          onClick={() => {
            const [id] = addInitiatives([{ name: `New ${label.toLowerCase()}` }]);
            if (id) openProject(id);
          }}
        >
          <Plus size={16} /> {label}
        </button>
        <button className="btn primary icon" title="Add many: paste, upload or import" aria-label="Add many projects" onClick={() => openImporter()}>
          <ClipboardPaste size={16} />
        </button>
      </div>
    </header>
  );
}

function PlanSwitcher() {
  const plans = useQuarterPlans();
  const plan = useActivePlan();
  const projects = useQuarterProjects();
  const { setActivePlan, createPlan, duplicatePlan } = useStore.getState();
  return (
    <Popover
      align="end"
      width={280}
      trigger={({ toggle, open }) => {
        const assigned = plan ? entriesFor(projects, plan).filter((e) => e.schedule.designerId).length : 0;
        const idx = plans.findIndex((p) => p.id === plan?.id);
        return (
          <button className={`ctx-control plan-trigger ${open ? 'open' : ''}`} onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`Plan: ${plan?.name}`}>
            <span className="ctx-icon"><Layers size={15} /></span>
            <span className="col" style={{ gap: 0, alignItems: 'flex-start', minWidth: 0 }}>
              <span className="plan-name">{plan?.name}</span>
              <span className="ctx-sub">Plan {idx + 1} of {plans.length} · {assigned}/{projects.length} assigned</span>
            </span>
            <ChevronsUpDown size={14} className="faint" style={{ marginLeft: 2 }} />
          </button>
        );
      }}
    >
      {(close) => (
        <>
          <MenuLabel>Scenarios this quarter</MenuLabel>
          {plans.map((p) => {
            const es = entriesFor(projects, p);
            const assigned = es.filter((e) => e.schedule.designerId).length;
            const confirmed = es.filter((e) => e.schedule.confirmed).length;
            return (
              <MenuItem
                key={p.id}
                active={p.id === plan?.id}
                icon={p.id === plan?.id ? <Check size={15} /> : <span style={{ width: 15 }} />}
                hint={<span className="tiny">{assigned}/{es.length} · {confirmed}✓</span>}
                onSelect={() => {
                  setActivePlan(p.id);
                  close();
                }}
              >
                {p.name}
              </MenuItem>
            );
          })}
          <MenuDivider />
          <MenuItem icon={<Plus size={15} />} onSelect={() => { createPlan(); toast('Blank plan created', { tone: 'success' }); close(); }}>New blank plan</MenuItem>
          {plan && (
            <MenuItem icon={<Copy size={15} />} onSelect={() => { duplicatePlan(plan.id); toast(`Duplicated ${plan.name}`, { tone: 'success' }); close(); }}>
              Duplicate “{plan.name}”
            </MenuItem>
          )}
          <MenuItem icon={<LayoutDashboard size={15} />} onSelect={() => { navigate({ view: 'home' }); close(); }}>Manage plans</MenuItem>
        </>
      )}
    </Popover>
  );
}

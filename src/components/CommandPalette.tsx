import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, ChevronLeft, ChevronRight, Copy, FileText, Moon, PanelLeftClose, Plus, Search, Settings, Sparkles, Upload } from 'lucide-react';
import { useStore } from '../store';
import { navigate, openDesigner, openProject, useActivePlan, useDesignerMap, useDesigners, useEntries, useWorkspace, VIEWS } from '../hooks';
import { openImporter, toast, useFeedback } from '../feedback';
import { dialogIn } from '../lib/motion';
import { VIEW_ICONS } from './Shell';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

export default function CommandPalette() {
  const open = useFeedback((s) => s.paletteOpen);
  const setOpen = useFeedback((s) => s.setPaletteOpen);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <PaletteBody onClose={() => setOpen(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const entries = useEntries();
  const dmap = useDesignerMap();
  const plan = useActivePlan();
  const designers = useDesigners();
  const workspace = useWorkspace()!;
  const s = useStore.getState();

  const commands = useMemo<Command[]>(() => {
    const label = workspace.config.labels.initiative;
    return [
      ...VIEWS.map((v, i) => {
        const Icon = VIEW_ICONS[v.id];
        return { id: `view:${v.id}`, group: 'Go to', label: v.label, hint: String(i + 1), icon: <Icon size={16} />, keywords: v.description, run: () => navigate({ view: v.id, project: null, page: false, designer: null }) };
      }),
      ...designers.map((d) => ({
        id: `d:${d.id}`,
        group: 'Designers',
        label: d.name,
        hint: 'Designer view',
        icon: <span className="nav-avatar" style={{ background: d.color }}>{d.name[0]?.toUpperCase()}</span>,
        keywords: 'person team workload',
        run: () => openDesigner(d.id),
      })),
      { id: 'new', group: 'Actions', label: `New ${label.toLowerCase()}`, icon: <Plus size={16} />, run: () => { const [id] = s.addInitiatives([{ name: `New ${label.toLowerCase()}` }]); if (id) openProject(id); } },
      { id: 'plan:new', group: 'Actions', label: 'New blank plan', icon: <Plus size={16} />, run: () => { s.createPlan(); toast('Blank plan created', { tone: 'success' }); } },
      ...(plan ? [{ id: 'plan:dup', group: 'Actions', label: `Duplicate ${plan.name}`, icon: <Copy size={16} />, run: () => { s.duplicatePlan(plan.id); toast(`Duplicated ${plan.name}`, { tone: 'success' }); } }] : []),
      { id: 'q:next', group: 'Actions', label: 'Next quarter', icon: <ChevronRight size={16} />, run: () => s.setQuarter(useStore.getState().currentQuarter + 1) },
      { id: 'q:prev', group: 'Actions', label: 'Previous quarter', icon: <ChevronLeft size={16} />, run: () => s.setQuarter(useStore.getState().currentQuarter - 1) },
      { id: 'theme', group: 'Actions', label: 'Toggle dark mode', icon: <Moon size={16} />, keywords: 'theme light', run: () => s.updateSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }) },
      { id: 'sidebar', group: 'Actions', label: 'Toggle sidebar', hint: '[', icon: <PanelLeftClose size={16} />, run: () => s.updateSettings({ sidebarCollapsed: !useStore.getState().settings.sidebarCollapsed }) },
      { id: 'demo', group: 'Actions', label: 'Load demo team (10 designers)', icon: <Sparkles size={16} />, keywords: 'sample example data stress', run: () => { s.loadDemo(); navigate({ view: 'home', designer: null }); toast('Demo workspace loaded', { tone: 'success' }); } },
      { id: 'import', group: 'Actions', label: 'Add many projects (paste or import)', icon: <Upload size={16} />, keywords: 'csv sheets jira asana servicenow linear paste bulk', run: () => openImporter() },
      { id: 'import-jira', group: 'Actions', label: 'Import from Jira, Asana or ServiceNow', icon: <Upload size={16} />, keywords: 'integration tracker export', run: () => openImporter({ tab: 'trackers' }) },
      { id: 'settings', group: 'Actions', label: 'Open settings', icon: <Settings size={16} />, run: () => navigate({ settings: 'appearance' }) },
      ...entries.map((e) => ({
        id: `p:${e.project.id}`,
        group: workspace.config.labels.initiatives,
        label: e.project.name,
        hint: e.schedule.designerId ? dmap[e.schedule.designerId]?.name : 'Unassigned',
        icon: <FileText size={16} />,
        keywords: `${e.project.ticket} ${e.project.productArea}`,
        run: () => openProject(e.project.id),
      })),
    ];
  }, [entries, dmap, plan, workspace, s, designers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.filter((c) => !c.id.startsWith('p:')).concat(commands.filter((c) => c.id.startsWith('p:')).slice(0, 6));
    const terms = q.split(/\s+/);
    return commands
      .map((c) => {
        const hay = `${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return null;
        return { c, score: c.label.toLowerCase().startsWith(q) ? 0 : 1 };
      })
      .filter((x): x is { c: Command; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c);
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  let lastGroup = '';
  return (
    <motion.div className="palette" role="dialog" aria-label="Command palette" variants={dialogIn} initial="initial" animate="animate" exit="exit">
      <div className="palette-input">
        <Search size={17} className="faint" />
        <input
          autoFocus
          value={query}
          placeholder="Search views, actions, projects…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(filtered.length - 1, i + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
            if (e.key === 'Enter') run(filtered[index]);
            if (e.key === 'Escape') onClose();
          }}
          aria-activedescendant={filtered[index] ? `cmd-${filtered[index].id}` : undefined}
        />
        <kbd>esc</kbd>
      </div>
      <div className="palette-list" ref={listRef} role="listbox">
        {filtered.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <div key={c.id}>
              {header && <div className="menu-section">{header}</div>}
              <button
                id={`cmd-${c.id}`}
                data-index={i}
                role="option"
                aria-selected={i === index}
                className={`menu-item ${i === index ? 'active' : ''}`}
                onMouseMove={() => setIndex(i)}
                onClick={() => run(c)}
              >
                <span className="menu-icon">{c.icon}</span>
                <span className="menu-label">{c.label}</span>
                {c.hint && <span className="menu-hint">{c.hint}</span>}
                {i === index && <ArrowRight size={14} className="faint" />}
              </button>
            </div>
          );
        })}
        {!filtered.length && <div className="empty">No matches for “{query}”.</div>}
      </div>
    </motion.div>
  );
}

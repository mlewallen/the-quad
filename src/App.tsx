import { useEffect, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useStore } from './store';
import { closeProject, navigate, useRoute, useWorkspace, VIEWS } from './hooks';
import { useFeedback } from './feedback';
import { fadeUp, spring } from './lib/motion';
import { Sidebar, TopBar } from './components/Shell';
import CommandPalette from './components/CommandPalette';
import { ConfirmHost, Toaster } from './components/Feedback';
import Onboarding from './components/Onboarding';
import SettingsPanel from './components/Settings';
import ProjectDetail from './components/ProjectDetail';
import Celebration from './components/Celebration';
import { Modal } from './components/ui';
import Home from './views/Home';
import Gantt from './views/Gantt';
import Allocation from './views/Allocation';
import Disruptions from './views/Disruptions';
import Focus from './views/Focus';
import Manage from './views/Manage';
import Backlog from './views/Backlog';

const VIEW_COMPONENTS = { home: Home, gantt: Gantt, allocation: Allocation, disruptions: Disruptions, focus: Focus, manage: Manage, backlog: Backlog };

function useTheme() {
  const { theme, accent, uiScale } = useStore((s) => s.settings);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--ui-scale', String(uiScale));
  }, [theme, accent, uiScale, systemDark]);
}

/** Global keys: ⌘/Ctrl-K palette, 1–7 views, [ sidebar. Ignored while typing. */
function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const f = useFeedback.getState();
        f.setPaletteOpen(!f.paletteOpen);
        return;
      }
      const t = e.target instanceof Element ? e.target : null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog], .palette')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) navigate({ view: VIEWS[n - 1].id, page: false });
      if (e.key === '[') {
        const s = useStore.getState();
        s.updateSettings({ sidebarCollapsed: !s.settings.sidebarCollapsed });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled]);
}

export default function App() {
  useTheme();
  const onboarded = useStore((s) => s.onboarded);
  const ensurePlan = useStore((s) => s.ensurePlan);
  const workspace = useWorkspace();
  const route = useRoute();
  const detailMode = useStore((s) => s.settings.detailMode);
  const ready = onboarded && !!workspace;
  useShortcuts(ready);

  useEffect(() => {
    if (onboarded) ensurePlan();
  }, [onboarded, workspace?.id, ensurePlan]);

  if (!ready) {
    return (
      <MotionConfig reducedMotion="user">
        <Onboarding />
        <Celebration />
      </MotionConfig>
    );
  }

  const ViewComponent = VIEW_COMPONENTS[route.view];
  const showPage = !!route.project && route.page;
  const mode = route.page ? 'page' : detailMode === 'page' ? 'panel' : detailMode;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Sidebar view={route.view} />
        <div className="content">
          <TopBar view={route.view} />
          <div className="workarea">
            <main className="main">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={showPage ? `page:${route.project}` : route.view} variants={fadeUp} initial="initial" animate="animate" exit="exit" className="view-host">
                  {showPage ? (
                    <div className="full-page">
                      <ProjectDetail id={route.project!} mode="page" />
                    </div>
                  ) : (
                    <ViewComponent />
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
            <AnimatePresence>
              {route.project && !showPage && mode === 'panel' && <SidePanel key="panel" id={route.project} />}
            </AnimatePresence>
          </div>
        </div>
        <AnimatePresence>
          {route.project && !showPage && mode === 'modal' && (
            <Modal key="detail" onClose={closeProject}>
              <ProjectDetail id={route.project} mode="modal" />
            </Modal>
          )}
          {route.settings && (
            <Modal key="settings" wide onClose={() => navigate({ settings: null })}>
              <SettingsPanel section={route.settings} />
            </Modal>
          )}
        </AnimatePresence>
        <CommandPalette />
        <ConfirmHost />
        <Toaster />
        <Celebration />
      </div>
    </MotionConfig>
  );
}

function SidePanel({ id }: { id: string }) {
  const width = useStore((s) => s.settings.panelWidth);
  const update = useStore((s) => s.updateSettings);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => update({ panelWidth: Math.max(360, Math.min(900, startW + (startX - ev.clientX))) });
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <motion.aside
      className="side-panel"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1, transition: dragging ? { duration: 0 } : spring.smooth }}
      exit={{ width: 0, opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
    >
      <div className="side-panel-inner" style={{ width }}>
        <div className={`resizer ${dragging ? 'active' : ''}`} onPointerDown={onPointerDown} role="separator" aria-orientation="vertical" aria-label="Resize panel" />
        <motion.div key={id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          <ProjectDetail id={id} mode="panel" />
        </motion.div>
      </div>
    </motion.aside>
  );
}

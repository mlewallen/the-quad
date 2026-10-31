import { useEffect, useState } from 'react';
import { useStore } from './store';
import { closeProject, navigate, useRoute, useWorkspace } from './hooks';
import ContextBar from './components/ContextBar';
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

export default function App() {
  useTheme();
  const onboarded = useStore((s) => s.onboarded);
  const ensurePlan = useStore((s) => s.ensurePlan);
  const workspace = useWorkspace();
  const route = useRoute();
  const detailMode = useStore((s) => s.settings.detailMode);

  useEffect(() => {
    if (onboarded) ensurePlan();
  }, [onboarded, workspace?.id, ensurePlan]);

  if (!onboarded || !workspace) {
    return (
      <>
        <Onboarding />
        <Celebration />
      </>
    );
  }

  const ViewComponent = {
    home: Home,
    gantt: Gantt,
    allocation: Allocation,
    disruptions: Disruptions,
    focus: Focus,
    manage: Manage,
    backlog: Backlog,
  }[route.view];

  const showPage = route.project && route.page;
  const mode = route.page ? 'page' : detailMode === 'page' ? 'panel' : detailMode;

  return (
    <div className="app">
      <ContextBar view={route.view} />
      <div className="workarea">
        <main className="main">
          {showPage ? (
            <div className="full-page">
              <ProjectDetail id={route.project!} mode="page" />
            </div>
          ) : (
            <ViewComponent />
          )}
        </main>
        {route.project && !showPage && mode === 'panel' && <SidePanel id={route.project} />}
      </div>
      {route.project && !showPage && mode === 'modal' && (
        <Modal onClose={closeProject}>
          <ProjectDetail id={route.project} mode="modal" />
        </Modal>
      )}
      {route.settings && (
        <Modal wide onClose={() => navigate({ settings: null })}>
          <SettingsPanel section={route.settings} />
        </Modal>
      )}
      <Celebration />
    </div>
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
    const move = (ev: PointerEvent) => update({ panelWidth: Math.max(340, Math.min(900, startW + (startX - ev.clientX))) });
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside className="side-panel" style={{ width }}>
      <div className={`resizer ${dragging ? 'active' : ''}`} onPointerDown={onPointerDown} />
      <ProjectDetail id={id} mode="panel" />
    </aside>
  );
}

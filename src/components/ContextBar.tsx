import { useStore } from '../store';
import { navigate, openProject, useActivePlan, useEntries, useQuarterPlans, useWorkspace, VIEWS, type View } from '../hooks';
import { formatDate, quarterLabel, quarterStartUtc } from '../lib/quarters';

export default function ContextBar({ view }: { view: View }) {
  const workspaces = useStore((s) => s.workspaces);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const q = useStore((s) => s.currentQuarter);
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const setQuarter = useStore((s) => s.setQuarter);
  const setActivePlan = useStore((s) => s.setActivePlan);
  const createPlan = useStore((s) => s.createPlan);
  const duplicatePlan = useStore((s) => s.duplicatePlan);
  const addInitiatives = useStore((s) => s.addInitiatives);
  const workspace = useWorkspace()!;
  const plans = useQuarterPlans();
  const plan = useActivePlan();
  const entries = useEntries();
  const backlog = entries.filter((e) => !e.schedule.designerId).length;
  const start = quarterStartUtc(q, sm);
  // Quarters are 13 weeks; show Monday of week 1 through Friday of week 13.
  const end = start + (13 * 7 - 3) * 86_400_000;
  const label = workspace.config.labels.initiative;

  const onPlanChange = (v: string) => {
    if (v === '__new') createPlan();
    else if (v === '__dup' && plan) duplicatePlan(plan.id);
    else setActivePlan(v);
  };

  return (
    <>
      <header className="contextbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden><i /><i /><i /><i /></span>
          The Quad
        </div>
        <select
          className="select sm"
          style={{ width: 'auto', maxWidth: 200 }}
          value={workspace.id}
          aria-label="Workspace"
          onChange={(e) => (e.target.value === '__new' ? navigate({ settings: 'workspace' }) : setActiveWorkspace(e.target.value))}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
          <option value="__new">+ New workspace…</option>
        </select>

        <div className="quarter-nav">
          <button className="btn icon ghost" aria-label="Previous quarter" onClick={() => setQuarter(q - 1)}>‹</button>
          <div className="col" style={{ gap: 0, alignItems: 'center' }}>
            <span className="q">{quarterLabel(q)}</span>
            <span className="sub">{formatDate(start)} – {formatDate(end)}</span>
          </div>
          <button className="btn icon ghost" aria-label="Next quarter" onClick={() => setQuarter(q + 1)}>›</button>
        </div>

        <div className="row">
          <span className="label">Plan</span>
          <select className="select sm" style={{ width: 'auto' }} value={plan?.id ?? ''} onChange={(e) => onPlanChange(e.target.value)} aria-label="Active plan">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option disabled>──────</option>
            <option value="__new">+ New blank plan</option>
            <option value="__dup">⧉ Duplicate {plan?.name}</option>
          </select>
        </div>

        <span className="spacer" />
        <button
          className="btn primary"
          onClick={() => {
            const [id] = addInitiatives([{ name: `New ${label.toLowerCase()}` }]);
            if (id) openProject(id);
          }}
        >
          + {label}
        </button>
        <button className="btn icon" aria-label="Settings" title="Settings" onClick={() => navigate({ settings: 'appearance' })}>⚙</button>
      </header>
      <nav className="tabs">
        {VIEWS.map((v) => (
          <a key={v.id} href={`#/${v.id}`} className={v.id === view ? 'on' : ''}>
            {v.label}
            {v.id === 'backlog' && backlog > 0 && <span className="count">{backlog}</span>}
          </a>
        ))}
      </nav>
    </>
  );
}

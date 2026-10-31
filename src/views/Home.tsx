import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { entriesFor, openProject, useActivePlan, useDesigners, useEntries, useLoad, useQuarterPlans, useQuarterProjects, useWorkspace, useWorkspaceDisruptions } from '../hooks';
import type { Plan } from '../types';
import { WEEKS_PER_QUARTER } from '../types';
import { computeLoad, loadLevel, summarize } from '../lib/capacity';
import { quarterLabel } from '../lib/quarters';
import InitiativeTable from '../components/InitiativeTable';
import { Avatar, LoadChip } from '../components/ui';

export default function Home() {
  const workspace = useWorkspace()!;
  const entries = useEntries();
  const q = useStore((s) => s.currentQuarter);
  return (
    <div className="home">
      <PlansColumn />
      <section className="card">
        <div className="col-head">
          <h2>{workspace.config.labels.initiatives}</h2>
          <span className="chip">{entries.length}</span>
          <span className="spacer" />
          <span className="tiny faint">{quarterLabel(q)}</span>
        </div>
        <div className="col-body">
          <InitiativeTable entries={entries} />
        </div>
      </section>
      <TeamColumn />
    </div>
  );
}

function PlansColumn() {
  const plans = useQuarterPlans();
  const active = useActivePlan();
  const projects = useQuarterProjects();
  const designers = useDesigners();
  const disruptions = useWorkspaceDisruptions();
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const q = useStore((s) => s.currentQuarter);
  const { fromAbs } = useLoad();
  const { setActivePlan, createPlan, duplicatePlan, renamePlan, deletePlan } = useStore.getState();
  const [renaming, setRenaming] = useState<string | null>(null);

  const stats = useMemo(
    () =>
      Object.fromEntries(
        plans.map((p: Plan) => {
          const es = entriesFor(projects, p);
          const assigned = es.filter((e) => e.schedule.designerId).length;
          const confirmed = es.filter((e) => e.schedule.confirmed).length;
          const load = computeLoad(es, disruptions, designers.map((d) => d.id), fromAbs, WEEKS_PER_QUARTER, sm);
          const over = Object.values(load).reduce((a, w) => a + summarize(w).over, 0);
          return [p.id, { total: es.length, assigned, confirmed, over }];
        }),
      ),
    [plans, projects, designers, disruptions, fromAbs, sm],
  );

  return (
    <section className="card">
      <div className="col-head">
        <h2>Plans</h2>
        <span className="chip">{plans.length}</span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => createPlan()}>+ New</button>
      </div>
      <div className="col-body">
        {plans.map((p) => {
          const st = stats[p.id];
          return (
            <div key={p.id} className={`plan-item ${p.id === active?.id ? 'active' : ''}`} onClick={() => setActivePlan(p.id)}>
              <div className="row">
                {renaming === p.id ? (
                  <input
                    className="input sm"
                    autoFocus
                    defaultValue={p.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      renamePlan(p.id, e.target.value.trim() || p.name);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <b className="ellipsis">{p.name}</b>
                )}
                <span className="spacer" />
                {p.id === active?.id && <span className="chip accent">Active</span>}
              </div>
              <div className="stats">
                <div className="stat"><b>{st.assigned}/{st.total}</b><span>Assigned</span></div>
                <div className="stat"><b>{st.confirmed}</b><span>Confirmed</span></div>
                <div className="stat"><b style={{ color: st.over ? 'var(--over)' : undefined }}>{st.over}</b><span>Over wks</span></div>
              </div>
              <div className="row" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm ghost" onClick={() => setRenaming(p.id)}>Rename</button>
                <button className="btn sm ghost" onClick={() => duplicatePlan(p.id)}>Duplicate</button>
                <span className="spacer" />
                <button
                  className="btn sm ghost danger"
                  disabled={plans.length < 2}
                  title={plans.length < 2 ? 'A quarter needs at least one plan' : undefined}
                  onClick={() => confirm(`Delete ${p.name}?`) && deletePlan(p.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
        <p className="tiny faint" style={{ padding: '4px 2px' }}>
          Plans for {quarterLabel(q)} share {projects.length} item{projects.length === 1 ? '' : 's'}; each plan has its own assignments and dates.
        </p>
      </div>
    </section>
  );
}

function TeamColumn() {
  const designers = useDesigners();
  const entries = useEntries();
  const { load } = useLoad();
  return (
    <section className="card">
      <div className="col-head">
        <h2>Team</h2>
        <span className="chip">{designers.length}</span>
      </div>
      <div className="col-body">
        {designers.map((d) => {
          const s = summarize(load[d.id] ?? []);
          const mine = entries.filter((e) => e.schedule.designerId === d.id);
          const confirmed = mine.filter((e) => e.schedule.confirmed);
          return (
            <div key={d.id} style={{ padding: '10px 4px', borderBottom: '1px solid var(--border)' }}>
              <div className="row">
                <Avatar designer={d} />
                <b className="ellipsis">{d.name}</b>
                <span className="spacer" />
                <LoadChip pct={s.avg} />
              </div>
              <div className="loadbar" style={{ margin: '8px 0 6px' }}>
                <div className={`lvl-${loadLevel(s.avg)}`} style={{ width: `${Math.min(100, s.avg)}%` }} />
              </div>
              <div className="tiny muted" style={{ marginBottom: 4 }}>
                Peak {Math.round(s.peak)}% · {s.over ? <span style={{ color: 'var(--over)' }}>{s.over} over wks</span> : 'no overloads'} · {mine.length} assigned
              </div>
              {confirmed.length > 0 && (
                <div className="col" style={{ gap: 2 }}>
                  {confirmed.map((e) => (
                    <a key={e.project.id} className="small ellipsis" href="#" onClick={(ev) => { ev.preventDefault(); openProject(e.project.id); }}>
                      ✓ {e.project.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!designers.length && <div className="empty">No designers yet.</div>}
      </div>
    </section>
  );
}

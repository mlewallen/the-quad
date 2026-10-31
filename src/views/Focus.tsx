import { openProject, useDesigners, useEntries, useQuarterStart } from '../hooks';
import { formatWeekRange } from '../lib/quarters';
import { Avatar, PriorityChip } from '../components/ui';

export default function Focus() {
  const designers = useDesigners();
  const entries = useEntries();
  const qStart = useQuarterStart();
  return (
    <div className="view">
      <div className="view-head">
        <h1>Focus</h1>
        <span className="muted small">What each person is working on this quarter.</span>
      </div>
      <div className="cards">
        {designers.map((d) => {
          const mine = entries
            .filter((e) => e.schedule.designerId === d.id || e.schedule.pairDesignerId === d.id)
            .sort((a, b) => a.schedule.startWeek - b.schedule.startWeek);
          return (
            <div key={d.id} className="card card-pad">
              <div className="row" style={{ marginBottom: 6 }}>
                <Avatar designer={d} size="lg" />
                <b>{d.name}</b>
                <span className="spacer" />
                <span className="chip">{mine.length}</span>
              </div>
              {mine.map((e) => (
                <div key={e.project.id} className="focus-item" onClick={() => openProject(e.project.id)}>
                  <span className="swatch" style={{ background: d.color, opacity: e.schedule.confirmed ? 1 : 0.4 }} />
                  <div className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <div className="row">
                      <span className="name ellipsis" style={{ fontWeight: 500 }}>{e.project.name}</span>
                      <span className="spacer" />
                      <PriorityChip p={e.project.priority} />
                    </div>
                    <span className="tiny muted">
                      {e.schedule.phase} · {formatWeekRange(qStart + e.schedule.startWeek, e.schedule.duration)}
                      {e.schedule.pairDesignerId === d.id ? ' · pairing' : ''}
                      {e.schedule.confirmed ? '' : ' · tentative'}
                    </span>
                  </div>
                </div>
              ))}
              {!mine.length && <p className="small faint">Nothing on their plate this quarter.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

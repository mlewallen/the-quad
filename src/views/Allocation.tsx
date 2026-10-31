import { useStore } from '../store';
import { openProject, useDesigners, useEntries, useLoad, useQuarterStart } from '../hooks';
import { summarize } from '../lib/capacity';
import { formatAbsWeek, formatWeekRange } from '../lib/quarters';
import { Avatar, LoadChip, Sparkline } from '../components/ui';

export default function Allocation() {
  const designers = useDesigners();
  const entries = useEntries();
  const { load, fromAbs } = useLoad();
  const qStart = useQuarterStart();
  const updateSchedule = useStore((s) => s.updateSchedule);

  return (
    <div className="view">
      <div className="view-head">
        <h1>Allocation</h1>
        <span className="muted small">Weekly load per designer. Drag a slider to adjust max allocation.</span>
      </div>
      <div className="cards">
        {designers.map((d) => {
          const weeks = load[d.id] ?? [];
          const s = summarize(weeks);
          const mine = entries.filter((e) => e.schedule.designerId === d.id).sort((a, b) => a.schedule.startWeek - b.schedule.startWeek);
          return (
            <div key={d.id} className="card card-pad col" style={{ gap: 10 }}>
              <div className="row">
                <Avatar designer={d} size="lg" />
                <div className="col" style={{ gap: 0 }}>
                  <b>{d.name}</b>
                  <span className="tiny muted">{mine.length} assigned · peak {Math.round(s.peak)}%{s.over ? ` · ${s.over} over` : ''}</span>
                </div>
                <span className="spacer" />
                <LoadChip pct={s.avg} />
              </div>
              <Sparkline
                values={weeks.map((w) => w.total)}
                onBarTitle={(i) => `Week ${i + 1} (${formatAbsWeek(fromAbs + i)}): ${Math.round(weeks[i].total)}% — ${Math.round(weeks[i].projects)}% work, ${Math.round(weeks[i].disruptions)}% disruptions`}
              />
              <div>
                {mine.map((e) => (
                  <div key={e.project.id} className="alloc-item">
                    <div className="row">
                      <a href="#" className="ellipsis small" style={{ fontWeight: 500 }} onClick={(ev) => { ev.preventDefault(); openProject(e.project.id); }}>
                        {e.project.name}
                      </a>
                      <span className="spacer" />
                      <span className="mono">{e.schedule.allocation}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={5}
                      value={e.schedule.allocation}
                      aria-label={`Allocation for ${e.project.name}`}
                      onChange={(ev) => updateSchedule(e.project.id, { allocation: Number(ev.target.value) })}
                    />
                    <span className="tiny faint">{formatWeekRange(qStart + e.schedule.startWeek, e.schedule.duration)} · {e.schedule.phase}</span>
                  </div>
                ))}
                {!mine.length && <span className="small faint">Nothing assigned this quarter.</span>}
              </div>
            </div>
          );
        })}
      </div>
      {!designers.length && <div className="empty">Add designers in Settings → Team.</div>}
    </div>
  );
}

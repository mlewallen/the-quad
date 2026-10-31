import { motion } from 'motion/react';
import { Users } from 'lucide-react';
import { useStore } from '../store';
import { openProject, useDesigners, useEntries, useLoad, useQuarterStart } from '../hooks';
import { summarize } from '../lib/capacity';
import { formatAbsWeek, formatWeekRange } from '../lib/quarters';
import { staggerChild, staggerParent } from '../lib/motion';
import { Avatar, EmptyState, LoadChip, Sparkline } from '../components/ui';

export default function Allocation() {
  const designers = useDesigners();
  const entries = useEntries();
  const { load, fromAbs } = useLoad();
  const qStart = useQuarterStart();
  const updateSchedule = useStore((s) => s.updateSchedule);

  if (!designers.length) return <div className="view"><EmptyState icon={Users} title="No designers yet">Add designers in Settings → Team.</EmptyState></div>;

  return (
    <div className="view">
      <motion.div className="cards" variants={staggerParent} initial="initial" animate="animate">
        {designers.map((d) => {
          const weeks = load[d.id] ?? [];
          const s = summarize(weeks);
          const mine = entries.filter((e) => e.schedule.designerId === d.id).sort((a, b) => a.schedule.startWeek - b.schedule.startWeek);
          return (
            <motion.div key={d.id} className="card card-pad col" style={{ gap: 12 }} variants={staggerChild}>
              <div className="row">
                <Avatar designer={d} size="lg" />
                <div className="col" style={{ gap: 0 }}>
                  <b>{d.name}</b>
                  <span className="tiny faint">
                    {mine.length} assigned · peak {Math.round(s.peak)}%
                    {s.over ? <span style={{ color: 'var(--over)' }}> · {s.over} wks over</span> : ''}
                  </span>
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
                      <a href="#" className="ellipsis small" style={{ fontWeight: 500, color: 'var(--text)' }} onClick={(ev) => { ev.preventDefault(); openProject(e.project.id); }}>
                        {e.project.name}
                      </a>
                      <span className="spacer" />
                      <span className="small num" style={{ fontWeight: 600 }}>{e.schedule.allocation}%</span>
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
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

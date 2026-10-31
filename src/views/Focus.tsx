import { motion } from 'motion/react';
import { Users } from 'lucide-react';
import { openProject, useDesigners, useEntries, useQuarterStart } from '../hooks';
import { formatWeekRange } from '../lib/quarters';
import { staggerChild, staggerParent } from '../lib/motion';
import { Avatar, EmptyState, PriorityChip } from '../components/ui';

export default function Focus() {
  const designers = useDesigners();
  const entries = useEntries();
  const qStart = useQuarterStart();
  if (!designers.length) return <div className="view"><EmptyState icon={Users} title="No designers yet">Add designers in Settings → Team.</EmptyState></div>;
  return (
    <div className="view">
      <motion.div className="cards" variants={staggerParent} initial="initial" animate="animate">
        {designers.map((d) => {
          const mine = entries
            .filter((e) => e.schedule.designerId === d.id || e.schedule.pairDesignerId === d.id)
            .sort((a, b) => a.schedule.startWeek - b.schedule.startWeek);
          return (
            <motion.div key={d.id} className="card card-pad" variants={staggerChild}>
              <div className="row" style={{ marginBottom: 8 }}>
                <Avatar designer={d} size="lg" />
                <b>{d.name}</b>
                <span className="spacer" />
                <span className="chip">{mine.length}</span>
              </div>
              {mine.map((e) => (
                <div key={e.project.id} className="focus-item" onClick={() => openProject(e.project.id)} role="button" tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && openProject(e.project.id)}>
                  <span className="swatch" style={{ background: d.color, opacity: e.schedule.confirmed ? 1 : 0.4 }} />
                  <div className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <div className="row">
                      <span className="name ellipsis" style={{ fontWeight: 500, transition: 'color .15s' }}>{e.project.name}</span>
                      <span className="spacer" />
                      <PriorityChip p={e.project.priority} />
                    </div>
                    <span className="tiny faint">
                      {e.schedule.phase} · {formatWeekRange(qStart + e.schedule.startWeek, e.schedule.duration)}
                      {e.schedule.pairDesignerId === d.id ? ' · pairing' : ''}
                      {e.schedule.confirmed ? '' : ' · tentative'}
                    </span>
                  </div>
                </div>
              ))}
              {!mine.length && <p className="small faint">Nothing on their plate this quarter.</p>}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

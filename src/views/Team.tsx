import { motion } from 'motion/react';
import { Users } from 'lucide-react';
import { useStore } from '../store';
import { openDesigner, openProject, useDesigners, useEntries, useLoad, usePhase, useQuarterStart } from '../hooks';
import { summarize } from '../lib/capacity';
import { formatAbsWeek, formatWeekRange } from '../lib/quarters';
import { staggerChild, staggerParent } from '../lib/motion';
import { Avatar, EmptyState, LoadChip, PriorityChip, Slider, Sparkline } from '../components/ui';

/** One card per designer: weekly load, everything they're on, and allocation sliders for the work they own. */
export default function Team() {
  const designers = useDesigners();
  const entries = useEntries();
  const { load, fromAbs } = useLoad();
  const qStart = useQuarterStart();
  const updateSchedule = useStore((s) => s.updateSchedule);
  const phaseOf = usePhase();

  if (!designers.length) return <div className="view"><EmptyState icon={Users} title="No designers yet">Add designers in Settings → Team.</EmptyState></div>;

  return (
    <div className="view">
      <motion.div className="cards" variants={staggerParent} initial="initial" animate="animate">
        {designers.map((d) => {
          const weeks = load[d.id] ?? [];
          const s = summarize(weeks);
          const mine = entries
            .filter((e) => e.schedule.designerId === d.id || e.schedule.pairDesignerId === d.id)
            .sort((a, b) => a.schedule.startWeek - b.schedule.startWeek);
          const owned = mine.filter((e) => e.schedule.designerId === d.id).length;
          return (
            <motion.div key={d.id} className="card card-pad col team-card" style={{ gap: 12 }} variants={staggerChild}>
              <div className="row">
                <Avatar designer={d} size="lg" />
                <div className="col" style={{ gap: 0, minWidth: 0 }}>
                  <button className="designer-link link-btn ellipsis" onClick={() => openDesigner(d.id)}>{d.name}</button>
                  <span className="tiny faint">
                    {owned} owned{mine.length > owned ? ` · ${mine.length - owned} pairing` : ''} · peak {Math.round(s.peak)}%
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
                {mine.map((e) => {
                  const pairing = e.schedule.pairDesignerId === d.id;
                  return (
                    <div key={e.project.id} className="alloc-item">
                      <div className="row">
                        <span className="swatch" style={{ background: d.color, opacity: e.schedule.confirmed ? 1 : 0.4 }} aria-hidden />
                        <button className="link-btn ellipsis small team-project" onClick={() => openProject(e.project.id)}>
                          {e.project.name}
                        </button>
                        <span className="spacer" />
                        <PriorityChip p={e.project.priority} />
                        {!pairing && <span className="small num" style={{ fontWeight: 600, minWidth: 34, textAlign: 'right' }}>{e.schedule.allocation}%</span>}
                      </div>
                      {!pairing && (
                        <Slider
                          value={e.schedule.allocation}
                          min={5}
                          max={100}
                          step={5}
                          color={d.color}
                          ariaLabel={`Allocation for ${e.project.name}`}
                          format={(v) => `${v}%`}
                          onChange={(v) => updateSchedule(e.project.id, { allocation: v })}
                        />
                      )}
                      <span className="tiny faint">
                        {phaseOf(e)} · {formatWeekRange(qStart + e.schedule.startWeek, e.schedule.duration)}
                        {pairing ? ` · pairing at ${Math.round(e.schedule.allocation / 2)}%` : ''}
                        {e.schedule.confirmed ? '' : ' · tentative'}
                      </span>
                    </div>
                  );
                })}
                {!mine.length && <span className="small faint">Nothing on their plate this quarter.</span>}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

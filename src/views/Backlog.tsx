import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown, ArrowUp, CalendarClock, CalendarPlus, Diamond, Ellipsis, Flag, Inbox, Lightbulb, ListChecks, Plus, Search, Trash2, Wand2, type LucideIcon,
} from 'lucide-react';
import { confirmDialog, openBalancer, toast } from '../feedback';
import { backlogOf, planKey, useStore } from '../store';
import {
  openProjectPage, useDesignerMap, useDesigners, useEntries, useIsMobile, useQuarterStart, useWorkspace, useWorkspaceDisruptions, useWorkspaceEntries,
} from '../hooks';
import type { ID, Project, Schedule } from '../types';
import { PRIORITIES, WEEKS_PER_QUARTER } from '../types';
import { computeLoad } from '../lib/capacity';
import { effortWeeks } from '../lib/curves';
import { formatAbsWeek, quarterLabel, utcToAbsWeek } from '../lib/quarters';
import { effortFor, gaSlipWeeks } from '../lib/sizing';
import { MenuDivider, MenuItem, MenuLabel, Popover } from '../components/Popover';
import { Select } from '../components/inputs';
import { Avatar, DesignerSelect, PriorityChip } from '../components/ui';

/*
 * Backlog as a horizon board: everything not yet owned or not yet in a quarter,
 * laid out by when it's meant to happen. Each lane sets the effort still to place
 * against the team's free capacity for that horizon, every item is the same card,
 * and work moves between lanes with a menu or by dragging.
 */

type LaneId = 'now' | 'next' | 'later' | 'unscheduled';

interface Item {
  project: Project;
  /** Its schedule in its quarter's active plan, or its draft while unscheduled. */
  schedule?: Schedule;
}

interface Lane {
  id: LaneId;
  title: string;
  sub: string;
  icon: LucideIcon;
  /** Where a card dropped here goes. */
  quarter: number | null;
  items: Item[];
  /** Effort still to place (unassigned work), in designer-weeks. */
  demand: number;
  /** The team's free designer-weeks over this horizon; null when it has no dates. */
  free: number | null;
}

const PRI = { P0: 0, P1: 1, P2: 2, P3: 3 };

/** Planned effort if there's a schedule, otherwise what the size implies. */
const effortOf = ({ project: p, schedule: s }: Item) => (s ? effortWeeks(s.curve, s.duration, s.allocation) : effortFor(p.workType, p.size));
const fmt = (n: number) => (n >= 10 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1));

function useLanes(filter: (p: Project) => boolean): Lane[] {
  const workspace = useWorkspace()!;
  const projects = useStore((s) => s.projects);
  const plans = useStore((s) => s.plans);
  const activePlan = useStore((s) => s.activePlan);
  const q = useStore((s) => s.currentQuarter);
  const sm = useStore((s) => s.settings.fiscalStartMonth);
  const designers = useDesigners();
  const entries = useWorkspaceEntries();
  const disruptions = useWorkspaceDisruptions();
  const qStart = useQuarterStart();

  // Free capacity per week across the next four quarters (100% minus planned work and time off).
  const freeByWeek = useMemo(() => {
    const load = computeLoad(entries, disruptions, designers.map((d) => d.id), qStart, WEEKS_PER_QUARTER * 4, sm);
    return Array.from({ length: WEEKS_PER_QUARTER * 4 }, (_, i) => designers.reduce((a, d) => a + Math.max(0, 100 - (load[d.id]?.[i]?.total ?? 0)) / 100, 0));
  }, [entries, disruptions, designers, qStart, sm]);
  const freeBetween = (from: number, to: number) => freeByWeek.slice(Math.max(0, from), Math.max(0, to)).reduce((a, b) => a + b, 0);
  const nowIdx = Math.max(0, utcToAbsWeek(Date.now()) - qStart);

  return useMemo(() => {
    const scheduleOf = (p: Project) => {
      if (p.quarter == null) return p.draft ?? undefined;
      const own = plans.filter((x) => x.workspaceId === workspace.id && x.quarter === p.quarter);
      return (own.find((x) => x.id === activePlan[planKey(workspace.id, p.quarter!)]) ?? own[0])?.schedules[p.id];
    };
    const mine = projects.filter((p) => p.workspaceId === workspace.id && filter(p)).map((p) => ({ project: p, schedule: scheduleOf(p) }));
    const byPriority = (a: Item, b: Item) => PRI[a.project.priority] - PRI[b.project.priority] || a.project.name.localeCompare(b.project.name);
    const unowned = (xs: Item[]) => xs.filter((x) => !x.schedule?.designerId);
    const demand = (xs: Item[]) => unowned(xs).reduce((a, x) => a + effortOf(x), 0);

    const now = mine.filter((x) => x.project.quarter === q && x.schedule && !x.schedule.designerId).sort(byPriority);
    const next = mine.filter((x) => x.project.quarter === q + 1).sort(byPriority);
    const later = mine.filter((x) => x.project.quarter != null && x.project.quarter > q + 1)
      .sort((a, b) => a.project.quarter! - b.project.quarter! || byPriority(a, b));
    const rankOf = new Map(backlogOf(projects, workspace.id).map((p, i) => [p.id, i]));
    const unscheduled = mine.filter((x) => x.project.quarter == null).sort((a, b) => (rankOf.get(a.project.id) ?? 0) - (rankOf.get(b.project.id) ?? 0));

    return [
      { id: 'now', title: 'Needs an owner', sub: `${quarterLabel(q)} · rest of this quarter`, icon: Inbox, quarter: q, items: now, demand: demand(now), free: freeBetween(nowIdx, WEEKS_PER_QUARTER) },
      { id: 'next', title: 'Next quarter', sub: quarterLabel(q + 1), icon: CalendarClock, quarter: q + 1, items: next, demand: demand(next), free: freeBetween(WEEKS_PER_QUARTER, WEEKS_PER_QUARTER * 2) },
      { id: 'later', title: 'Later', sub: `${quarterLabel(q + 2)} and beyond`, icon: CalendarPlus, quarter: q + 2, items: later, demand: demand(later), free: freeBetween(WEEKS_PER_QUARTER * 2, WEEKS_PER_QUARTER * 4) },
      { id: 'unscheduled', title: 'Unscheduled', sub: 'Ranked ideas and requests', icon: Lightbulb, quarter: null, items: unscheduled, demand: demand(unscheduled), free: null },
    ] satisfies Lane[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, plans, activePlan, workspace.id, q, filter, freeByWeek, nowIdx]);
}

export default function Backlog() {
  const workspace = useWorkspace()!;
  const projects = useStore((s) => s.projects);
  const mobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('');
  const [area, setArea] = useState('');
  const [laneOnPhone, setLaneOnPhone] = useState<LaneId>('now');
  const areas = useMemo(
    () => [...new Set(projects.filter((p) => p.workspaceId === workspace.id && p.productArea).map((p) => p.productArea))].sort(),
    [projects, workspace.id],
  );
  const filter = useMemo(() => {
    const ql = query.trim().toLowerCase();
    return (p: Project) =>
      (!ql || `${p.name} ${p.ticket} ${p.productArea} ${p.pm}`.toLowerCase().includes(ql)) && (!priority || p.priority === priority) && (!area || p.productArea === area);
  }, [query, priority, area]);
  const lanes = useLanes(filter);
  const unassigned = useEntries().filter((e) => !e.schedule.designerId).length;
  const filtered = !!(query || priority || area);
  const shown = mobile ? lanes.filter((l) => l.id === laneOnPhone) : lanes;

  return (
    <div className="view backlog-board-view">
      <div className="board-bar">
        <div className="search board-search">
          <Search size={14} aria-hidden />
          <input className="input sm" placeholder="Filter by name, ticket, area…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter backlog" />
        </div>
        <Select size="sm" width="auto" value={priority} onChange={setPriority} ariaLabel="Priority" options={[{ value: '', label: 'All priorities' }, ...PRIORITIES.map((p) => ({ value: p, label: <PriorityChip p={p} />, text: p }))]} />
        {areas.length > 0 && (
          <Select size="sm" width="auto" menuWidth={200} value={area} onChange={setArea} ariaLabel={workspace.config.labels.productArea} options={[{ value: '', label: `All ${workspace.config.labels.productArea.toLowerCase()}s` }, ...areas.map((a) => ({ value: a, label: a }))]} />
        )}
        {filtered && <button className="btn sm ghost" onClick={() => { setQuery(''); setPriority(''); setArea(''); }}>Clear</button>}
        <span className="spacer" />
        <button className="btn primary" disabled={!unassigned} onClick={openBalancer} title={unassigned ? undefined : 'Everything this quarter has an owner'}>
          <Wand2 size={15} /> Auto-balance…
        </button>
      </div>

      {mobile && (
        <div className="segmented board-lane-switch" role="radiogroup" aria-label="Horizon">
          {lanes.map((l) => (
            <button key={l.id} role="radio" aria-checked={laneOnPhone === l.id} className={laneOnPhone === l.id ? 'on' : ''} onClick={() => setLaneOnPhone(l.id)}>
              {l.title.split(' ')[0]} <span className="faint">{l.items.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className={`board ${mobile ? 'single' : ''}`}>
        {shown.map((lane) => <LaneColumn key={lane.id} lane={lane} filtered={filtered} />)}
      </div>
    </div>
  );
}

/* ---------- lanes ---------- */

function LaneColumn({ lane, filtered }: { lane: Lane; filtered: boolean }) {
  const { moveToQuarter } = useStore.getState();
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData('text/x-quad-project');
    const from = e.dataTransfer.getData('text/x-quad-lane');
    if (!id || from === lane.id) return;
    const p = useStore.getState().projects.find((x) => x.id === id);
    if (!p) return;
    const prev = p.quarter;
    moveToQuarter([id], lane.quarter);
    toast(lane.quarter == null ? `${p.name} moved to unscheduled` : `${p.name} planned for ${quarterLabel(lane.quarter)}`, {
      tone: 'success', action: { label: 'Undo', run: () => moveToQuarter([id], prev) },
    });
  };
  const ratio = lane.free ? lane.demand / lane.free : lane.demand > 0 ? 2 : 0;
  const tone = lane.free == null ? '' : ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : 'ok';

  // Later lanes span quarters, so their cards get small quarter headings.
  let lastQ: number | null | undefined;
  return (
    <section
      className={`lane ${over ? 'drop' : ''}`}
      aria-labelledby={`lane-${lane.id}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-quad-project')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={onDrop}
    >
      <header className="lane-head">
        <div className="row" style={{ gap: 8 }}>
          <span className="panel-icon"><lane.icon size={14} /></span>
          <div className="col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
            <h2 id={`lane-${lane.id}`} className="lane-title">{lane.title} <span className="lane-count">{lane.items.length}</span></h2>
            <span className="tiny faint ellipsis">{lane.sub}</span>
          </div>
        </div>
        {lane.free != null ? (
          <div className={`lane-meter ${tone}`} title="Effort without an owner, against the team’s free designer-weeks over this horizon">
            <div className="lane-meter-bar"><span style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
            <span className="tiny">
              <b className="num">{fmt(lane.demand)}</b> wks to place · <b className="num">{fmt(lane.free)}</b> free
              {ratio > 1 && <span className="lane-gap"> · {fmt(lane.demand - lane.free)} short</span>}
            </span>
          </div>
        ) : (
          <div className="lane-meter">
            <span className="tiny"><b className="num">{fmt(lane.demand)}</b> effort wks waiting, highest rank first</span>
          </div>
        )}
        {lane.id === 'unscheduled' && <QuickAdd />}
      </header>

      <ol className="lane-cards">
        <AnimatePresence initial={false}>
          {lane.items.map((it, i) => {
            const heading = lane.id === 'later' && it.project.quarter !== lastQ ? it.project.quarter : null;
            lastQ = it.project.quarter;
            return (
              <motion.li key={it.project.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14 } }}>
                {heading != null && <div className="lane-subhead">{quarterLabel(heading)}</div>}
                <Card item={it} lane={lane} rank={lane.id === 'unscheduled' ? i : undefined} total={lane.items.length} />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {!lane.items.length && <p className="lane-empty small faint">{filtered ? 'Nothing here matches the filters.' : EMPTY[lane.id]}</p>}
    </section>
  );
}

const EMPTY: Record<LaneId, string> = {
  now: 'Every project this quarter has an owner.',
  next: 'Nothing planned for next quarter yet. Drag an idea here, or use “Move to”.',
  later: 'Nothing slotted further out.',
  unscheduled: 'No ideas waiting. Add one above.',
};

function QuickAdd() {
  const labels = useWorkspace()!.config.labels;
  const [draft, setDraft] = useState('');
  const add = () => {
    const names = draft.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!names.length) return;
    useStore.getState().addToBacklog(names);
    setDraft('');
  };
  return (
    <form className="row lane-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <input className="input sm" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add an idea…`} aria-label={`New unscheduled ${labels.initiative.toLowerCase()}`} />
      <button className="btn sm icon" type="submit" disabled={!draft.trim()} aria-label="Add"><Plus size={14} /></button>
    </form>
  );
}

/* ---------- cards ---------- */

/** A card moved by menu lands in another lane as a new element; it takes focus there. */
let focusOnMount: ID | null = null;

function Card({ item, lane, rank, total }: { item: Item; lane: Lane; rank?: number; total: number }) {
  const { project: p, schedule: s } = item;
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const sm = useStore((st) => st.settings.fiscalStartMonth);
  const { updateSchedule, moveInBacklog } = useStore.getState();
  const owner = s?.designerId ? dmap[s.designerId] : undefined;
  const slip = s ? gaSlipWeeks(p, s, sm) : null;
  // Reordering moves the card in the DOM, which drops focus; put it back on the same control.
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (!refocus) return;
    document.querySelector<HTMLElement>(`[data-card-ctl="${refocus}"]`)?.focus();
    setRefocus(null);
  }, [refocus, rank]);
  // Target this card's own button: the old copy may still be animating out of its previous lane.
  const nameRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount !== p.id) return;
    focusOnMount = null;
    nameRef.current?.focus();
  }, [p.id]);

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/x-quad-project', p.id);
    e.dataTransfer.setData('text/x-quad-lane', lane.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const rankMove = (dir: -1 | 1) => {
    moveInBacklog(p.id, dir);
    const edge = dir < 0 ? rank === 1 : rank === total - 2;
    setRefocus(`${p.id}:${edge ? (dir < 0 ? 'down' : 'up') : dir < 0 ? 'up' : 'down'}`);
  };

  return (
    <article className={`bcard pri-${p.priority.toLowerCase()}`} draggable onDragStart={onDragStart} aria-label={p.name}>
      <div className="row bcard-top">
        {rank != null && <span className="bcard-rank num" aria-label={`Rank ${rank + 1}`}>{rank + 1}</span>}
        <PriorityChip p={p.priority} />
        {p.ticket && <span className="mono tiny faint">{p.ticket}</span>}
        <span className="spacer" />
        {rank != null && (
          <span className="row bcard-rankctl" style={{ gap: 0 }}>
            <button className="btn sm ghost icon" data-card-ctl={`${p.id}:up`} disabled={rank === 0} aria-label={`Move ${p.name} up`} onClick={() => rankMove(-1)}><ArrowUp size={13} /></button>
            <button className="btn sm ghost icon" data-card-ctl={`${p.id}:down`} disabled={rank === total - 1} aria-label={`Move ${p.name} down`} onClick={() => rankMove(1)}><ArrowDown size={13} /></button>
          </span>
        )}
        <CardMenu item={item} lane={lane} />
      </div>
      <button ref={nameRef} className="link-btn bcard-name" onClick={() => openProjectPage(p.id)}>{p.name}</button>
      <div className="tiny muted bcard-meta">
        {p.size} {p.workType} · {fmt(effortOf(item))} effort wks{s ? ` · ${s.duration}w` : ''}{p.productArea ? ` · ${p.productArea}` : ''}
      </div>
      <Readiness item={item} owner={owner?.name} ownerAvatar={<Avatar designer={owner} />} slip={slip} />
      {lane.id === 'now' && (
        <DesignerSelect size="sm" designers={designers} value={null} allowNone={false} placeholder="Assign…" ariaLabel={`Assign ${p.name}`} onChange={(v) => v && updateSchedule(p.id, { designerId: v })} />
      )}
    </article>
  );
}

/** How far the plan has got, at a glance: owner, phases, milestones, GA. */
function Readiness({ item, owner, ownerAvatar, slip }: { item: Item; owner?: string; ownerAvatar: ReactNode; slip: number | null }) {
  const { project: p, schedule: s } = item;
  const phases = s?.phasePlan?.length;
  const ms = s?.milestones.length ?? 0;
  const bits: { key: string; on: boolean; icon: ReactNode; text: string; tone?: string }[] = [
    { key: 'owner', on: !!owner, icon: ownerAvatar, text: owner ?? 'No owner' },
    { key: 'phases', on: !!phases, icon: <ListChecks size={12} />, text: phases ? `${phases} phases` : 'Default phases' },
    { key: 'ms', on: ms > 0, icon: <Diamond size={11} />, text: ms ? `${ms} milestone${ms === 1 ? '' : 's'}` : 'No milestones' },
  ];
  if (p.gaTargetWeek != null) bits.push({ key: 'ga', on: true, icon: <Flag size={11} />, text: `GA ${formatAbsWeek(p.gaTargetWeek)}${slip && slip > 0 ? ` (+${slip}w)` : ''}`, tone: slip && slip > 0 ? 'over' : undefined });
  return (
    <ul className="bcard-ready" aria-label="Plan">
      {/* Missing pieces shrink to an icon, so a planned card reads fuller than an empty one. */}
      {bits.map((b) => (
        <li key={b.key} className={`${b.on ? 'on' : 'gap'} ${b.tone ?? ''}`} title={b.on ? undefined : b.text}>
          {b.icon}<span className={b.on ? undefined : 'sr-only'}>{b.text}</span>
        </li>
      ))}
    </ul>
  );
}

function CardMenu({ item, lane }: { item: Item; lane: Lane }) {
  const { project: p } = item;
  const q = useStore((s) => s.currentQuarter);
  const { moveToQuarter, deleteProjects } = useStore.getState();
  const targets: { id: ID; label: string; quarter: number | null }[] = [
    { id: 'q0', label: `${quarterLabel(q)} (this quarter)`, quarter: q },
    { id: 'q1', label: quarterLabel(q + 1), quarter: q + 1 },
    { id: 'q2', label: quarterLabel(q + 2), quarter: q + 2 },
    { id: 'q3', label: quarterLabel(q + 3), quarter: q + 3 },
    { id: 'u', label: 'Unscheduled', quarter: null },
  ];
  const move = (to: number | null) => {
    const prev = p.quarter;
    focusOnMount = p.id;
    // If it lands somewhere off the board (planned and owned), don't let it grab focus later.
    setTimeout(() => { if (focusOnMount === p.id) focusOnMount = null; }, 800);
    moveToQuarter([p.id], to);
    toast(to == null ? `${p.name} moved to unscheduled` : `${p.name} planned for ${quarterLabel(to)}`, { tone: 'success', action: { label: 'Undo', run: () => moveToQuarter([p.id], prev) } });
  };
  return (
    <Popover
      align="end"
      width={220}
      trigger={({ open, toggle }) => (
        <button className="btn sm ghost icon" aria-label={`Actions for ${p.name}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Ellipsis size={14} /></button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<ListChecks size={15} />} onSelect={() => { close(); openProjectPage(p.id); }}>Open plan</MenuItem>
          {lane.id === 'now' && <MenuItem icon={<Wand2 size={15} />} onSelect={() => { close(); openBalancer(); }}>Auto-balance…</MenuItem>}
          <MenuDivider />
          <MenuLabel>Move to</MenuLabel>
          {targets.map((t) => (
            <MenuItem key={t.id} active={p.quarter === t.quarter} disabled={p.quarter === t.quarter} onSelect={() => { close(); move(t.quarter); }}>
              {t.label}
            </MenuItem>
          ))}
          {p.quarter == null && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<Trash2 size={15} />}
                danger
                onSelect={async () => {
                  close();
                  if (await confirmDialog({ title: `Delete “${p.name}”?`, body: 'It’s removed from the backlog, with its draft plan. This can’t be undone.', confirmLabel: 'Delete', destructive: true })) deleteProjects([p.id]);
                }}
              >
                Delete
              </MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

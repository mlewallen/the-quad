import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowUp, Check, Inbox, Pin, Search, Trash2, X } from 'lucide-react';
import { confirmDialog, toast } from '../feedback';
import { spring } from '../lib/motion';
import { useStore } from '../store';
import { openProject, useDesignerMap, useDesigners, usePhase, useQuarterStart, useWorkspace } from '../hooks';
import type { Entry } from '../lib/capacity';
import type { ID } from '../types';
import { PRIORITIES, SIZES } from '../types';
import { formatWeekRange } from '../lib/quarters';
import { Avatar, EmptyState, PriorityChip } from './ui';

type Col = 'name' | 'designer' | 'phase' | 'priority' | 'size' | 'workType' | 'start' | 'duration' | 'allocation' | 'confirmed' | 'ticket' | 'productArea' | 'pm' | 'em';
type SortKey = Col;

const COMPACT: Col[] = ['name', 'designer', 'phase', 'priority', 'start', 'confirmed'];
const FULL: Col[] = ['name', 'ticket', 'designer', 'phase', 'priority', 'workType', 'size', 'start', 'duration', 'allocation', 'productArea', 'pm', 'em', 'confirmed'];

const PRI_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SIZE_ORDER = { S: 0, M: 1, L: 2, XL: 3 };

export default function InitiativeTable({ entries, variant = 'compact' }: { entries: Entry[]; variant?: 'compact' | 'full' }) {
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const dmap = useDesignerMap();
  const qStart = useQuarterStart();
  const phaseOf = usePhase();
  const labels = workspace.config.labels;
  const cols = variant === 'full' ? FULL : COMPACT;

  const [query, setQuery] = useState('');
  const [fDesigner, setFDesigner] = useState('');
  const [fPhase, setFPhase] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'priority', dir: 1 });
  const [selected, setSelected] = useState<Set<ID>>(new Set());
  const anchor = useRef<ID | null>(null);

  const rows = useMemo(() => {
    const ql = query.trim().toLowerCase();
    const filtered = entries.filter(({ project: p, schedule: s }) => {
      if (ql && !`${p.name} ${p.ticket} ${p.productArea} ${p.pm} ${p.em}`.toLowerCase().includes(ql)) return false;
      if (fDesigner === '__none' ? s.designerId : fDesigner && s.designerId !== fDesigner && s.pairDesignerId !== fDesigner) return false;
      if (fPhase && phaseOf({ project: p, schedule: s }) !== fPhase) return false;
      if (fPriority && p.priority !== fPriority) return false;
      if (fStatus === 'confirmed' && !s.confirmed) return false;
      if (fStatus === 'tentative' && s.confirmed) return false;
      return true;
    });
    const val = (e: Entry): string | number => {
      const { project: p, schedule: s } = e;
      switch (sort.key) {
        case 'designer': return s.designerId ? dmap[s.designerId]?.name ?? '' : '￿';
        case 'phase': return workspace.config.phases.indexOf(phaseOf(e));
        case 'priority': return PRI_ORDER[p.priority];
        case 'size': return SIZE_ORDER[p.size];
        case 'start': return s.startWeek;
        case 'duration': return s.duration;
        case 'allocation': return s.allocation;
        case 'confirmed': return s.confirmed ? 0 : 1;
        default: return String(p[sort.key as 'name'] ?? '').toLowerCase();
      }
    };
    return filtered.slice().sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = va < vb ? -1 : va > vb ? 1 : a.project.name.localeCompare(b.project.name);
      return c * sort.dir;
    });
  }, [entries, query, fDesigner, fPhase, fPriority, fStatus, sort, dmap, workspace.config.phases, phaseOf]);

  const visibleIds = rows.map((r) => r.project.id);
  const selIds = visibleIds.filter((id) => selected.has(id));
  const allSelected = rows.length > 0 && selIds.length === rows.length;

  const toggle = (id: ID, shift: boolean) => {
    const next = new Set(selected);
    if (shift && anchor.current && visibleIds.includes(anchor.current)) {
      const [a, b] = [visibleIds.indexOf(anchor.current), visibleIds.indexOf(id)].sort((x, y) => x - y);
      const target = !selected.has(id);
      for (const rid of visibleIds.slice(a, b + 1)) target ? next.add(rid) : next.delete(rid);
    } else {
      next.has(id) ? next.delete(id) : next.add(id);
      anchor.current = id;
    }
    setSelected(next);
  };

  const head = (key: Col, label: string) => (
    <th key={key} className="sortable" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} className="sort-icon" /> : <ArrowDown size={12} className="sort-icon" />)}
    </th>
  );
  const headLabels: Record<Col, string> = {
    name: labels.initiative, designer: 'Designer', phase: 'Phase', priority: 'Pri', size: 'Size', workType: 'Type',
    start: 'When', duration: 'Wks', allocation: 'Alloc', confirmed: 'Status', ticket: labels.ticket,
    productArea: labels.productArea, pm: labels.pm, em: labels.em,
  };

  return (
    <div className="col" style={{ gap: 0, minHeight: 0 }}>
      <div className="filters">
        <div className="search">
          <Search size={14} />
          <input className="input sm" placeholder="Filter by name, ticket, partner…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter" />
        </div>
        <select className="select sm" value={fDesigner} onChange={(e) => setFDesigner(e.target.value)} aria-label="Filter by designer">
          <option value="">All designers</option>
          <option value="__none">Unassigned</option>
          {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="select sm" value={fPhase} onChange={(e) => setFPhase(e.target.value)} aria-label="Filter by phase">
          <option value="">All phases</option>
          {workspace.config.phases.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="select sm" value={fPriority} onChange={(e) => setFPriority(e.target.value)} aria-label="Filter by priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="select sm" value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="tentative">Tentative</option>
        </select>
      </div>

      <AnimatePresence>
        {selIds.length > 0 && (
          <motion.div key="bulk" initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto', transition: spring.snappy }} exit={{ opacity: 0, y: -6, height: 0, transition: { duration: 0.14 } }}>
            <BulkBar ids={selIds} onDone={() => setSelected(new Set())} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="check">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
                />
              </th>
              {cols.map((c) => head(c, headLabels[c]))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project: p, schedule: s }) => {
              const d = s.designerId ? dmap[s.designerId] : undefined;
              const pair = s.pairDesignerId ? dmap[s.pairDesignerId] : undefined;
              const cell: Record<Col, React.ReactNode> = {
                name: (
                  <div className="row" style={{ gap: 6 }}>
                    <span className="ellipsis" style={{ fontWeight: 500, maxWidth: 280 }}>{p.name}</span>
                    {p.epic && <span className="chip accent">Epic</span>}
                  </div>
                ),
                designer: (
                  <div className="row" style={{ gap: 4 }}>
                    <Avatar designer={d} />
                    {pair && <Avatar designer={pair} />}
                    <span className="ellipsis small">{d?.name ?? <span className="faint">Unassigned</span>}</span>
                  </div>
                ),
                phase: (
                  <span className="small row" style={{ gap: 4 }}>
                    {phaseOf({ project: p, schedule: s })}
                    {s.phaseOverride && <Pin size={11} className="faint" aria-label="set manually" />}
                  </span>
                ),
                priority: <PriorityChip p={p.priority} />,
                size: p.size,
                workType: <span className="small">{p.workType}</span>,
                start: <span className="small nowrap muted">{formatWeekRange(qStart + s.startWeek, s.duration)}</span>,
                duration: s.duration,
                allocation: `${s.allocation}%`,
                confirmed: s.confirmed ? <span className="chip ok">Confirmed</span> : <span className="chip">Tentative</span>,
                ticket: <span className="mono">{p.ticket}</span>,
                productArea: <span className="small">{p.productArea}</span>,
                pm: <span className="small">{p.pm}</span>,
                em: <span className="small">{p.em}</span>,
              };
              return (
                <motion.tr layout="position" transition={spring.smooth} key={p.id} className={`clickable ${selected.has(p.id) ? 'selected' : ''}`} onClick={() => openProject(p.id)}>
                  <td className="check" onClick={(e) => { e.stopPropagation(); toggle(p.id, e.shiftKey); }}>
                    <input type="checkbox" checked={selected.has(p.id)} readOnly aria-label={`Select ${p.name}`} />
                  </td>
                  {cols.map((c) => <td key={c}>{cell[c]}</td>)}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          entries.length
            ? <EmptyState icon={Search} title="Nothing matches these filters" />
            : <EmptyState icon={Inbox} title={`No ${labels.initiatives.toLowerCase()} this quarter yet`}>Add one from the top bar or import a spreadsheet.</EmptyState>
        )}
      </div>
    </div>
  );
}

function BulkBar({ ids, onDone }: { ids: ID[]; onDone: () => void }) {
  const bulk = useStore((s) => s.bulkUpdate);
  const del = useStore((s) => s.deleteProjects);
  const designers = useDesigners();
  const workspace = useWorkspace()!;
  const pick = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '') return;
    fn(e.target.value);
    e.target.value = '';
  };
  return (
    <div className="bulkbar">
      <b>{ids.length} selected</b>
      <span className="faint tiny">Shift-click to select a range</span>
      <span className="spacer" />
      <select className="select sm" style={{ width: 'auto' }} defaultValue="" onChange={pick((v) => bulk(ids, {}, { designerId: v === '__none' ? null : v }))}>
        <option value="" disabled>Assign…</option>
        <option value="__none">Unassign</option>
        {designers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select className="select sm" style={{ width: 'auto' }} defaultValue="" onChange={pick((v) => bulk(ids, {}, { phaseOverride: v === '__auto' ? null : v }))}>
        <option value="" disabled>Phase…</option>
        <option value="__auto">Follow schedule</option>
        {workspace.config.phases.map((p) => <option key={p}>{p}</option>)}
      </select>
      <select className="select sm" style={{ width: 'auto' }} defaultValue="" onChange={pick((v) => bulk(ids, { priority: v as never }, {}))}>
        <option value="" disabled>Priority…</option>
        {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
      </select>
      <select className="select sm" style={{ width: 'auto' }} defaultValue="" onChange={pick((v) => bulk(ids, { size: v as never }, {}))}>
        <option value="" disabled>Size…</option>
        {SIZES.map((p) => <option key={p}>{p}</option>)}
      </select>
      <select className="select sm" style={{ width: 'auto' }} defaultValue="" onChange={pick((v) => bulk(ids, { workType: v }, {}))}>
        <option value="" disabled>Type…</option>
        {workspace.config.workTypes.map((p) => <option key={p}>{p}</option>)}
      </select>
      <button className="btn sm" onClick={() => { bulk(ids, {}, { confirmed: true }); toast(`Confirmed ${ids.length}`, { tone: 'success' }); }}><Check size={13} /> Confirm</button>
      <button className="btn sm" onClick={() => bulk(ids, {}, { confirmed: false })}>Unconfirm</button>
      <button
        className="btn sm danger"
        onClick={async () => {
          const ok = await confirmDialog({
            title: `Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?`,
            body: 'They are removed from every plan in this quarter. This can’t be undone.',
            confirmLabel: 'Delete',
            destructive: true,
          });
          if (ok) {
            del(ids);
            onDone();
            toast(`Deleted ${ids.length} item${ids.length === 1 ? '' : 's'}`);
          }
        }}
      >
        <Trash2 size={13} /> Delete
      </button>
      <button className="btn sm ghost icon" aria-label="Clear selection" onClick={onDone}><X size={14} /></button>
    </div>
  );
}

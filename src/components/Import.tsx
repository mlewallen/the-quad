import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useDesigners, useWorkspace } from '../hooks';
import type { Priority, Project, Size } from '../types';
import { PRIORITIES, SIZES } from '../types';
import { parseDelimited, sheetsCsvUrl } from '../lib/csv';

type Target =
  | '' | 'name' | 'designer' | 'size' | 'priority' | 'workType' | 'ticket' | 'reference'
  | 'pm' | 'em' | 'goal' | 'gaTarget' | 'productArea' | 'notes';

const TARGETS: { id: Target; label: string; guess: RegExp }[] = [
  { id: 'name', label: 'Name', guess: /^(name|title|initiative|project|summary)$/i },
  { id: 'designer', label: 'Designer', guess: /designer|assignee|owner/i },
  { id: 'size', label: 'Size', guess: /size|t-?shirt|effort/i },
  { id: 'priority', label: 'Priority', guess: /priority|pri\b/i },
  { id: 'workType', label: 'Work type', guess: /type/i },
  { id: 'ticket', label: 'Ticket', guess: /ticket|jira|key|issue/i },
  { id: 'reference', label: 'Reference', guess: /link|url|ref/i },
  { id: 'pm', label: 'PM', guess: /^pm$|product manager/i },
  { id: 'em', label: 'EM', guess: /^em$|eng/i },
  { id: 'goal', label: 'Goal', guess: /goal|okr/i },
  { id: 'gaTarget', label: 'GA target', guess: /\bga\b|launch|target/i },
  { id: 'productArea', label: 'Product area', guess: /area|group|team|pillar/i },
  { id: 'notes', label: 'Notes', guess: /note|desc/i },
];

export default function Import() {
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const addInitiatives = useStore((s) => s.addInitiatives);
  const [source, setSource] = useState<'paste' | 'file' | 'sheets'>('paste');
  const [text, setText] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Target[] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [stage, setStage] = useState<'input' | 'map' | 'preview'>('input');

  const rows = useMemo(() => (text ? parseDelimited(text) : []), [text]);
  const header = hasHeader ? rows[0] ?? [] : (rows[0] ?? []).map((_, i) => `Column ${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;

  const load = (t: string) => {
    setText(t);
    const parsed = parseDelimited(t);
    const used = new Set<Target>();
    setMapping(
      (parsed[0] ?? []).map((h) => {
        const hit = TARGETS.find((x) => !used.has(x.id) && x.guess.test(h.trim()));
        if (hit) used.add(hit.id);
        return hit?.id ?? '';
      }),
    );
    setStage('map');
    setStatus(null);
  };

  const fetchSheet = async () => {
    const url = sheetsCsvUrl(sheetUrl);
    if (!url) return setStatus('That doesn’t look like a Google Sheets link.');
    setStatus('Loading…');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const t = await res.text();
      if (t.trimStart().startsWith('<')) throw new Error('not shared');
      load(t);
    } catch {
      setStatus('Couldn’t read that sheet. Share it as “Anyone with the link can view”, or copy the cells and paste them instead.');
    }
  };

  const records = useMemo(() => {
    if (!mapping) return [];
    const byName = new Map(designers.map((d) => [d.name.toLowerCase(), d.id]));
    return body
      .map((r) => {
        const get = (t: Target) => {
          const i = mapping.indexOf(t);
          return i >= 0 ? (r[i] ?? '').trim() : '';
        };
        const size = get('size').toUpperCase();
        const pri = get('priority').toUpperCase().replace(/^(\d)$/, 'P$1');
        const wt = workspace.config.workTypes.find((w) => w.toLowerCase() === get('workType').toLowerCase());
        const designerName = get('designer').toLowerCase();
        // Exact name, else first-name match ("Maya" → "Maya Chen").
        const designerId = designerName
          ? byName.get(designerName) ?? designers.find((d) => d.name.toLowerCase().split(' ')[0] === designerName.split(' ')[0])?.id ?? null
          : null;
        const extra: Partial<Project> = {};
        for (const k of ['ticket', 'reference', 'pm', 'em', 'goal', 'gaTarget', 'productArea', 'notes'] as const) {
          const v = get(k);
          if (v) extra[k] = v;
        }
        return {
          name: get('name'),
          designerId,
          designerRaw: get('designer'),
          size: (SIZES.includes(size as Size) ? size : 'M') as Size,
          priority: (PRIORITIES.includes(pri as Priority) ? pri : 'P2') as Priority,
          workType: wt,
          extra,
        };
      })
      .filter((r) => r.name);
  }, [body, mapping, designers, workspace.config.workTypes]);

  const confirmImport = () => {
    addInitiatives(records.map((r) => ({ name: r.name, designerId: r.designerId, size: r.size, priority: r.priority, workType: r.workType, extra: r.extra })));
    setStatus(`Imported ${records.length} item${records.length === 1 ? '' : 's'} into the current quarter.`);
    setStage('input');
    setText('');
    setMapping(null);
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div>
        <h2>Import</h2>
        <p className="small muted">Bring {workspace.config.labels.initiatives.toLowerCase()} in from a spreadsheet. They land in the current quarter.</p>
      </div>

      {stage === 'input' && (
        <>
          <div className="segmented">
            <button className={source === 'paste' ? 'on' : ''} onClick={() => setSource('paste')}>Paste</button>
            <button className={source === 'file' ? 'on' : ''} onClick={() => setSource('file')}>Upload file</button>
            <button className={source === 'sheets' ? 'on' : ''} onClick={() => setSource('sheets')}>Google Sheets</button>
          </div>
          {source === 'paste' && (
            <>
              <textarea className="textarea mono" rows={8} placeholder="Paste cells from a spreadsheet (TSV) or CSV, including the header row" onChange={(e) => setText(e.target.value)} value={text} />
              <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!text.trim()} onClick={() => load(text)}>Next: map columns</button>
            </>
          )}
          {source === 'file' && (
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) load(await f.text());
              }}
            />
          )}
          {source === 'sheets' && (
            <div className="col">
              <div className="row">
                <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
                <button className="btn primary" disabled={!sheetUrl} onClick={fetchSheet}>Load</button>
              </div>
              <span className="tiny faint">Reads sheets shared as “Anyone with the link”. For private sheets, select the cells in Sheets, copy, and use Paste.</span>
            </div>
          )}
        </>
      )}

      {stage === 'map' && mapping && (
        <>
          <div className="row">
            <h3>Map columns</h3>
            <span className="spacer" />
            <label className="row small"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> First row is a header</label>
          </div>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table className="data">
              <thead>
                <tr>{header.map((h, i) => <th key={i}>{h}</th>)}</tr>
                <tr>
                  {header.map((_, i) => (
                    <th key={i} style={{ top: 30 }}>
                      <select className="select sm" value={mapping[i] ?? ''} onChange={(e) => setMapping(mapping.map((m, j) => (j === i ? (e.target.value as Target) : m === e.target.value ? '' : m)))}>
                        <option value="">Ignore</option>
                        {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.slice(0, 5).map((r, i) => <tr key={i}>{header.map((_, j) => <td key={j} className="small">{r[j]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setStage('input')}>Back</button>
            <span className="spacer" />
            {!mapping.includes('name') && <span className="small" style={{ color: 'var(--over)' }}>Map a column to Name</span>}
            <button className="btn primary" disabled={!mapping.includes('name')} onClick={() => setStage('preview')}>Preview</button>
          </div>
        </>
      )}

      {stage === 'preview' && (
        <>
          <h3>Preview — {records.length} item{records.length === 1 ? '' : 's'}</h3>
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table className="data">
              <thead><tr><th>Name</th><th>Designer</th><th>Size</th><th>Priority</th><th>Type</th></tr></thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td className="small">
                      {r.designerId ? designers.find((d) => d.id === r.designerId)?.name : r.designerRaw ? <span style={{ color: 'var(--warn)' }}>“{r.designerRaw}” not found → backlog</span> : <span className="faint">Backlog</span>}
                    </td>
                    <td>{r.size}</td>
                    <td>{r.priority}</td>
                    <td className="small">{r.workType ?? workspace.config.workTypes[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setStage('map')}>Back</button>
            <span className="spacer" />
            <button className="btn primary" disabled={!records.length} onClick={confirmImport}>Import {records.length}</button>
          </div>
        </>
      )}
      {status && <p className="small muted">{status}</p>}
    </div>
  );
}

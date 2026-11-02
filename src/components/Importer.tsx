import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CircleCheck, ClipboardPaste, FileUp, Link2, Plug, RefreshCw, Sheet, Sparkles, X,
} from 'lucide-react';
import { useStore, type NewInitiative, type ProjectUpdate } from '../store';
import { closeImporter, toast, useFeedback, type ImporterRequest } from '../feedback';
import { useDesigners, useIsMobile, useQuarterProjects, useQuarterStart, useWorkspace } from '../hooks';
import type { ExternalSource } from '../types';
import { sheetsCsvUrl } from '../lib/csv';
import {
  CONNECTORS, FIELD_LABELS, parseInput, planImport, rowsToItems, SAMPLES, type ExternalItem, type ItemField, type ParsedInput,
} from '../lib/ingest';
import { formatWeekRange } from '../lib/quarters';
import { ease, sheetIn } from '../lib/motion';
import { Avatar, PriorityChip, useFocusTrap } from './ui';
import { Checkbox, Select } from './inputs';

type Tab = 'paste' | 'upload' | 'sheets' | 'trackers';

const SOURCE_LABEL: Record<ExternalSource, string> = {
  jira: 'Jira', asana: 'Asana', servicenow: 'ServiceNow', linear: 'Linear', sheet: 'Spreadsheet', paste: 'Pasted text',
};

/** Global modal host, opened by paste-anywhere, file drop, ⌘K or the top bar. */
export function ImporterModal() {
  const req = useFeedback((s) => s.importer);
  const sheet = useIsMobile();
  useEffect(() => {
    if (!req) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=alertdialog]') && closeImporter();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [req]);
  return (
    <AnimatePresence>
      {req && (
        <motion.div
          className={`overlay center ${sheet ? 'sheet-overlay' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onMouseDown={(e) => e.target === e.currentTarget && closeImporter()}
        >
          <ImporterDialog req={req} sheet={sheet} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ImporterDialog({ req, sheet }: { req: ImporterRequest; sheet: boolean }) {
  const ref = useFocusTrap<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={`modal importer-modal ${sheet ? 'sheet' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="importer-title"
      {...(sheet
        ? { variants: sheetIn, initial: 'initial', animate: 'animate', exit: 'exit' }
        : {
            initial: { opacity: 0, y: 12, scale: 0.98 },
            animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 360, damping: 34 } },
            exit: { opacity: 0, y: 6, transition: { duration: 0.14 } },
          })}
    >
      <div className="importer-head">
        <span className="panel-icon"><Sparkles size={15} /></span>
        <div className="col" style={{ gap: 0, flex: 1 }}>
          <h2 id="importer-title">Add projects</h2>
          <span className="tiny faint">Paste, drop a file, or bring in an export from your tracker.</span>
        </div>
        <button className="btn icon ghost" aria-label="Close" onClick={closeImporter}><X size={16} /></button>
      </div>
      <ImportFlow key={`${req.text ?? ''}${req.filename ?? ''}${req.tab ?? ''}`} initialText={req.text} initialFilename={req.filename} initialTab={req.tab} onDone={closeImporter} />
    </motion.div>
  );
}

export function ImportFlow({
  initialText, initialFilename, initialTab, onDone,
}: { initialText?: string; initialFilename?: string; initialTab?: Tab; onDone?: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'paste');
  const [text, setText] = useState(initialText ?? '');
  const [filename, setFilename] = useState<string | undefined>(initialFilename);
  const [stage, setStage] = useState<'source' | 'map' | 'review'>(initialText ? 'source' : 'source');
  const [mapping, setMapping] = useState<(ItemField | '')[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const parsed: ParsedInput | null = useMemo(() => (text.trim() ? parseInput(text, filename) : null), [text, filename]);
  useEffect(() => setMapping(parsed?.mapping ?? null), [parsed]);

  const items: ExternalItem[] = useMemo(() => {
    if (!parsed) return [];
    if (parsed.kind === 'items') return parsed.items ?? [];
    return rowsToItems(parsed.rows ?? [], mapping ?? parsed.mapping ?? [], parsed.source);
  }, [parsed, mapping]);

  const load = (t: string, name?: string) => {
    setText(t);
    setFilename(name);
    setTab('paste');
    setHint(null);
  };

  const proceed = () => setStage(parsed?.kind === 'table' ? 'map' : 'review');

  if (stage === 'map' && parsed?.kind === 'table') {
    return <MapStep parsed={parsed} mapping={mapping ?? []} setMapping={setMapping} count={items.length} onBack={() => setStage('source')} onNext={() => setStage('review')} />;
  }
  if (stage === 'review') {
    return <ReviewStep items={items} source={parsed?.source ?? 'paste'} onBack={() => setStage(parsed?.kind === 'table' ? 'map' : 'source')} onDone={onDone} />;
  }

  return (
    <div className="importer">
      <div className="segmented importer-tabs" role="tablist">
        {([
          ['paste', 'Paste', ClipboardPaste],
          ['upload', 'Upload file', FileUp],
          ['sheets', 'Google Sheets', Sheet],
          ['trackers', 'Jira, Asana & more', Plug],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: ease.out } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
          {tab === 'paste' && (
            <div className="col" style={{ gap: 10 }}>
              <textarea
                className="textarea mono importer-text"
                autoFocus
                value={text}
                onChange={(e) => { setText(e.target.value); setFilename(undefined); }}
                placeholder={'Paste cells from a spreadsheet, a CSV/JSON export, tracker links, or one project per line:\n\nCheckout redesign @maya !P1 ~L #Checkout 6w 50%\nhttps://acme.atlassian.net/browse/DSN-142'}
                spellCheck={false}
              />
              <div className="row tiny faint" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span>Try an example:</span>
                {Object.entries(SAMPLES).map(([k, s]) => (
                  <button key={k} className="chip example-chip" onClick={() => load(s.text, s.filename)}>{s.label}</button>
                ))}
              </div>
              <details className="syntax-help">
                <summary>Quick-add syntax</summary>
                <div className="grid2 tiny" style={{ marginTop: 8 }}>
                  <span><code>@maya</code> or <code>@"Maya Chen"</code> designer</span>
                  <span><code>!P1</code> / <code>!high</code> priority</span>
                  <span><code>~L</code> or <code>~5</code> size or points</span>
                  <span><code>#Checkout</code> product area</span>
                  <span><code>6w</code> duration in weeks</span>
                  <span><code>50%</code> allocation</span>
                </div>
              </details>
            </div>
          )}
          {tab === 'upload' && <DropZone hint={hint} onFile={(t, name) => load(t, name)} />}
          {tab === 'sheets' && <SheetsTab onLoaded={(t) => load(t, 'sheet.csv')} />}
          {tab === 'trackers' && (
            <div className="connector-grid">
              {CONNECTORS.map((c) => (
                <div key={c.id} className="connector" style={{ '--cc': c.color } as React.CSSProperties}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="connector-logo">{c.name[0]}</span>
                    <div className="col" style={{ gap: 0, flex: 1 }}>
                      <b>{c.name}</b>
                      <span className="tiny faint">{c.blurb}</span>
                    </div>
                  </div>
                  <ol className="tiny muted">{c.exportSteps.map((st) => <li key={st}>{st}</li>)}</ol>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => { setTab('upload'); setHint(`Drop your ${c.name} CSV or JSON export`); }}><FileUp size={13} /> Import export</button>
                    <button className="btn sm ghost" onClick={() => load(SAMPLES[c.id]?.text ?? SAMPLES.jira.text, SAMPLES[c.id]?.filename ?? 'jira.csv')}>Try sample</button>
                    <span className="spacer" />
                    <span className="chip" title="Live sync will reuse this same import pipeline"><RefreshCw size={11} /> Live sync soon</span>
                  </div>
                </div>
              ))}
              <p className="tiny faint" style={{ gridColumn: '1 / -1' }}>
                Imported projects remember their tracker key, so importing the same export again updates them instead of duplicating.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="importer-foot">
        {parsed ? (
          <span className="small">
            <CircleCheck size={14} style={{ color: items.length ? 'var(--ok)' : 'var(--text-3)', verticalAlign: -2, marginRight: 6 }} />
            {items.length} project{items.length === 1 ? '' : 's'} found · <b>{SOURCE_LABEL[parsed.source]}</b>
            {parsed.kind === 'table' && ` · ${parsed.headers?.length} columns`}
            {parsed.note && <span className="faint"> · {parsed.note}</span>}
          </span>
        ) : (
          <span className="small faint">Tip: you can paste a spreadsheet anywhere in the app, or drop a file on the window.</span>
        )}
        <span className="spacer" />
        <button className="btn primary" disabled={!items.length && parsed?.kind !== 'table'} onClick={proceed}>
          {parsed?.kind === 'table' ? 'Map columns' : 'Review'} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

function DropZone({ onFile, hint }: { onFile: (text: string, name: string) => void; hint: string | null }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const read = async (f?: File) => f && onFile(await f.text(), f.name);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); read(e.dataTransfer.files[0]); }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
    >
      <motion.span className="dropzone-icon" animate={{ y: over ? -4 : 0, scale: over ? 1.08 : 1 }}><FileUp size={22} /></motion.span>
      <b>{hint ?? 'Drop a CSV, TSV or JSON file'}</b>
      <span className="small faint">or click to choose. Jira, Asana, ServiceNow and Linear exports are recognised automatically.</span>
      <input ref={input} type="file" hidden accept=".csv,.tsv,.txt,.json,text/csv,application/json" onChange={(e) => read(e.target.files?.[0])} />
    </div>
  );
}

function SheetsTab({ onLoaded }: { onLoaded: (text: string) => void }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const go = async () => {
    const csv = sheetsCsvUrl(url);
    if (!csv) return setStatus('That doesn’t look like a Google Sheets link.');
    setStatus('Loading…');
    try {
      const res = await fetch(csv);
      const t = await res.text();
      if (!res.ok || t.trimStart().startsWith('<')) throw new Error();
      onLoaded(t);
    } catch {
      setStatus('Couldn’t read that sheet. Share it as “Anyone with the link can view”, or copy the cells and paste them instead.');
    }
  };
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row">
        <Link2 size={16} className="faint" />
        <input className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        <button className="btn primary" disabled={!url} onClick={go}>Load</button>
      </div>
      <span className="tiny faint">{status ?? 'Works with sheets shared as “Anyone with the link”. For private sheets, select the cells, copy, and paste them anywhere in the app.'}</span>
    </div>
  );
}

function MapStep({
  parsed, mapping, setMapping, count, onBack, onNext,
}: { parsed: ParsedInput; mapping: (ItemField | '')[]; setMapping: (m: (ItemField | '')[]) => void; count: number; onBack: () => void; onNext: () => void }) {
  const headers = parsed.headers ?? [];
  const rows = parsed.rows ?? [];
  return (
    <div className="importer">
      <div className="row">
        <div className="col" style={{ gap: 2 }}>
          <h3>Match columns</h3>
          <span className="tiny faint">We guessed from the headers{parsed.source !== 'sheet' && parsed.source !== 'paste' ? ` (looks like a ${SOURCE_LABEL[parsed.source]} export)` : ''}. Change anything that’s off; ignored columns aren’t imported.</span>
        </div>
      </div>
      <div className="table-wrap map-table">
        <table className="data">
          <thead>
            <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
            <tr>
              {headers.map((_, i) => (
                <th key={i} style={{ top: 33 }}>
                  <Select
                    size="sm"
                    className={mapping[i] ? 'mapped' : ''}
                    value={mapping[i] ?? ''}
                    ariaLabel={`Map column ${headers[i] || i + 1}`}
                    onChange={(v) => setMapping(mapping.map((m, j) => (j === i ? (v as ItemField) : m === v ? '' : m)))}
                    options={[{ value: '', label: 'Ignore' }, ...(Object.keys(FIELD_LABELS) as ItemField[]).map((f) => ({ value: f, label: FIELD_LABELS[f] }))]}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((r, i) => <tr key={i}>{headers.map((_, j) => <td key={j} className={`small ${mapping[j] ? '' : 'faint'}`}>{r[j]}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      <div className="importer-foot">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <span className="spacer" />
        {!mapping.includes('title') && <span className="small" style={{ color: 'var(--over)' }}>Choose which column is the Name</span>}
        <button className="btn primary" disabled={!mapping.includes('title')} onClick={onNext}>Review {count} <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}

function ReviewStep({ items, source, onBack, onDone }: { items: ExternalItem[]; source: ExternalSource; onBack: () => void; onDone?: () => void }) {
  const workspace = useWorkspace()!;
  const designers = useDesigners();
  const projects = useQuarterProjects();
  const qStart = useQuarterStart();
  const applyImport = useStore((s) => s.applyImport);
  const plan = useMemo(() => planImport(items, { projects, designers, config: workspace.config, quarterStartAbs: qStart }), [items, projects, designers, workspace.config, qStart]);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [updateExisting, setUpdateExisting] = useState(true);

  const included = plan.filter((r, i) => !skip.has(i) && (updateExisting || r.action === 'create'));
  const creates = included.filter((r) => r.action === 'create');
  const updates = included.filter((r) => r.action === 'update');
  const warnings = included.reduce((a, r) => a + r.warnings.length, 0);
  const childCount = plan.reduce((a, r) => a + (r.item.children?.length ?? 0), 0);

  const go = () => {
    const create: NewInitiative[] = creates.map((r) => ({
      name: r.project.name ?? r.item.title,
      designerId: r.schedule.designerId ?? null,
      size: r.project.size,
      priority: r.project.priority,
      workType: r.project.workType,
      startWeek: r.schedule.startWeek,
      extra: r.project,
      schedule: r.schedule,
    }));
    const update: ProjectUpdate[] = updates.map((r) => ({ id: r.existing!.id, project: r.project, schedule: r.schedule }));
    const res = applyImport(create, update);
    toast(`Added ${res.created.length}${res.updated ? `, updated ${res.updated}` : ''} from ${SOURCE_LABEL[source]}`, { tone: 'success' });
    onDone?.();
  };

  return (
    <div className="importer">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h3>Review</h3>
        <span className="chip accent">{SOURCE_LABEL[source]}</span>
        <span className="chip ok">{creates.length} new</span>
        {plan.some((r) => r.action === 'update') && <span className="chip">{updates.length} update{updates.length === 1 ? '' : 's'}</span>}
        {warnings > 0 && <span className="chip warn"><AlertTriangle size={11} /> {warnings} to check</span>}
        {childCount > 0 && <span className="chip" title="Child issues are folded into their epic as its phases">{childCount} task{childCount === 1 ? '' : 's'} → phases</span>}
        <span className="spacer" />
        {plan.some((r) => r.action === 'update') && (
          <Checkbox className="small" checked={updateExisting} onChange={setUpdateExisting}>Update matching projects</Checkbox>
        )}
      </div>
      <div className="table-wrap review-table">
        <table className="data">
          <thead>
            <tr><th className="check" /><th></th><th>Project</th><th>Designer</th><th>Pri</th><th>Size</th><th>Phase</th><th>When</th></tr>
          </thead>
          <tbody>
            {plan.map((r, i) => {
              const off = skip.has(i) || (!updateExisting && r.action === 'update');
              const d = r.designer.designer;
              return (
                <tr key={i} className={off ? 'off' : ''}>
                  <td className="check">
                    <Checkbox
                      checked={!off}
                      disabled={!updateExisting && r.action === 'update'}
                      onChange={() => { const n = new Set(skip); n.has(i) ? n.delete(i) : n.add(i); setSkip(n); }}
                      ariaLabel={`Include ${r.item.title}`}
                    />
                  </td>
                  <td>
                    <span className={`chip ${r.action === 'create' ? 'ok' : ''}`} title={r.matchedBy ? `Matches an existing project by ${r.matchedBy}` : undefined}>
                      {r.action === 'create' ? 'New' : 'Update'}
                    </span>
                  </td>
                  <td>
                    <div className="col" style={{ gap: 0 }}>
                      <span className="small ellipsis" style={{ fontWeight: 500, maxWidth: 260 }}>{r.project.name ?? r.existing?.name}{r.project.epic && <span className="chip accent" style={{ marginLeft: 6 }}>Epic</span>}</span>
                      <span className="tiny faint">
                        {r.item.externalId && <span className="mono">{r.item.externalId}</span>}
                        {r.item.childrenOnly && <span> · phases from its tasks</span>}
                        {r.schedule.phasePlan && (
                          <span className="import-phases" style={{ display: 'block' }}>
                            {r.schedule.phasePlan.map((p, k) => <span key={k} className="chip" title={p.ticket}>{p.phase} · {p.weeks}w</span>)}
                          </span>
                        )}
                        {r.warnings.map((w) => <span key={w} style={{ color: 'var(--warn)', display: 'block' }}><AlertTriangle size={10} /> {w}</span>)}
                      </span>
                    </div>
                  </td>
                  <td className="small">
                    {d ? <span className="row" style={{ gap: 6 }}><Avatar designer={d} />{d.name}{r.designer.how !== 'name' && <span className="faint tiny">by {r.designer.how}</span>}</span> : <span className="faint">Backlog</span>}
                  </td>
                  <td>{r.project.priority ? <PriorityChip p={r.project.priority} /> : <span className="faint">–</span>}</td>
                  <td className="small">{r.project.size ?? <span className="faint">–</span>}</td>
                  <td className="small">{r.schedule.phaseOverride ?? <span className="faint">Auto</span>}</td>
                  <td className="small faint nowrap">
                    {r.schedule.startWeek !== undefined || r.schedule.duration ? formatWeekRange(qStart + (r.schedule.startWeek ?? 0), r.schedule.duration ?? 4) : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="importer-foot">
        <button className="btn ghost" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <span className="spacer" />
        <span className="tiny faint">Goes into the current quarter and active plan.</span>
        <button className="btn primary" disabled={!included.length} onClick={go}>
          Import {included.length}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import type { Designer } from '../types';
import { loadLevel } from '../lib/capacity';

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || '?';
}

export function Avatar({ designer, size }: { designer?: Designer; size?: 'lg' }) {
  if (!designer) return <span className={`avatar ${size ?? ''}`} style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>–</span>;
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: designer.color }} title={designer.name}>
      {initials(designer.name)}
    </span>
  );
}

export function PriorityChip({ p }: { p: string }) {
  return <span className={`chip ${p.toLowerCase()}`}>{p}</span>;
}

export function LoadChip({ pct }: { pct: number }) {
  const lvl = loadLevel(pct);
  return <span className={`chip ${lvl === 'idle' ? '' : lvl}`}>{Math.round(pct)}%</span>;
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fn();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [fn]);
}

export function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  const key = `section:${title}`;
  const [open, setOpen] = useState(() => {
    const v = localStorage.getItem(key);
    return v == null ? defaultOpen : v === '1';
  });
  const toggle = () => {
    localStorage.setItem(key, open ? '0' : '1');
    setOpen(!open);
  };
  return (
    <div className="section">
      <button className={`section-head ${open ? 'open' : ''}`} onClick={toggle} aria-expanded={open}>
        <span className="chev">▸</span>
        {title}
        <span className="spacer" />
        {aside}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Text input that commits on blur/enter, so typing doesn't spam the store. */
export function TextInput({
  value, onCommit, placeholder, className = 'input', type = 'text',
}: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; type?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={className}
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

export function DesignerSelect({
  designers, value, onChange, allowNone = true, noneLabel = 'Unassigned', className = 'select',
}: { designers: Designer[]; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; noneLabel?: string; className?: string }) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">{noneLabel}</option>}
      {designers.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}

export function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="col">
      <div className="list-editor">
        {items.map((it) => (
          <span key={it} className="chip">
            {it}
            <button aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}>×</button>
          </span>
        ))}
      </div>
      <div className="row">
        <input className="input sm" value={draft} placeholder={placeholder ?? 'Add…'} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

export function Sparkline({ values, height = 56, onBarTitle }: { values: number[]; height?: number; onBarTitle?: (i: number) => string }) {
  const max = Math.max(120, ...values);
  return (
    <div className="spark" style={{ height }}>
      <div className="cap" style={{ bottom: `${(100 / max) * 100}%` }} />
      {values.map((v, i) => (
        <div key={i} className={`b lvl-${loadLevel(v)}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} title={onBarTitle?.(i) ?? `${Math.round(v)}%`} />
      ))}
    </div>
  );
}

export function HealthStrip({ values }: { values: number[] }) {
  return (
    <div className="health" style={{ gridTemplateColumns: `repeat(${values.length}, 1fr)` }}>
      {values.map((v, i) => (
        <div key={i} className={`lvl-${loadLevel(v)}`} title={`${Math.round(v)}%`} />
      ))}
    </div>
  );
}

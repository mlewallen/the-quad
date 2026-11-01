import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { Designer } from '../types';
import { loadLevel } from '../lib/capacity';
import { dialogIn, ease, sheetIn } from '../lib/motion';
import { useIsMobile } from '../hooks';
import { Select, type SelectOption } from './inputs';

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || '?';
}

export function Avatar({ designer, size }: { designer?: Designer; size?: 'lg' }) {
  if (!designer) return <span className={`avatar empty-avatar ${size ?? ''}`}>–</span>;
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: designer.color }} title={designer.name}>
      {initials(designer.name)}
    </span>
  );
}

/** Accessible name for a schedule bar: everything the bar's color, styling and position show. */
export function barLabel(o: { name: string; designer?: string; pair?: string; allocation: number; confirmed: boolean; range: string; phase?: string }) {
  return [
    o.name,
    o.designer ?? 'Unassigned',
    o.pair ? `paired with ${o.pair}` : '',
    `${o.allocation}%`,
    o.confirmed ? 'confirmed' : 'tentative',
    o.phase ?? '',
    o.range,
  ].filter(Boolean).join(', ');
}

export function PriorityChip({ p }: { p: string }) {
  return <span className={`chip ${p.toLowerCase()}`}>{p}</span>;
}

export function LoadChip({ pct }: { pct: number }) {
  const lvl = loadLevel(pct);
  return <span className={`chip load ${lvl === 'idle' ? '' : lvl}`}>{Math.round(pct)}%</span>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Focus management for dialogs and panels: moves focus in when mounted (to an
 * element already focused inside, a [data-autofocus] element, the first
 * focusable control, or the container itself), optionally keeps Tab inside,
 * and returns focus to whatever had it before when unmounted.
 */
export function useFocusTrap<T extends HTMLElement>({ trap = true, initial = 'first' }: { trap?: boolean; initial?: 'first' | 'container' } = {}): RefObject<T | null> {
  const ref = useRef<T>(null);
  // Read during the first render: by the time effects run, autoFocus inside may already have moved focus.
  const [previous] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // autoFocus inside has already run by now; respect it.
    if (!root.contains(document.activeElement)) {
      const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? (initial === 'first' ? focusables(root)[0] : undefined) ?? root;
      if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (!trap || e.key !== 'Tab') return;
      // An inner layer (confirm dialog, popover) handles its own Tab.
      if (document.querySelector('[role=alertdialog]') && !root.querySelector('[role=alertdialog]')) return;
      const items = focusables(root);
      if (!items.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = root.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // A real close has already removed the dialog from the DOM by now. If it's still
      // attached (StrictMode's dev-only remount, or the options changed), keep focus where it is.
      if (root.isConnected) return;
      // Only hand focus back if it's still ours to give (not moved on to something new).
      if (previous?.isConnected && (root.contains(document.activeElement) || document.activeElement === document.body || !document.activeElement)) previous.focus({ preventScroll: true });
    };
  }, [trap, initial, previous]);
  return ref;
}

/** Overlay + dialog with spring entrance. Must be rendered inside <AnimatePresence>. */
export function Modal({ onClose, children, wide, size, label }: { onClose: () => void; children: ReactNode; wide?: boolean; size?: 'settings'; label?: string }) {
  useEscape(onClose);
  const ref = useFocusTrap<HTMLDivElement>();
  // Phones get a bottom sheet instead of a centred dialog.
  const sheet = useIsMobile();
  return (
    <motion.div
      className={`overlay ${size === 'settings' ? 'center' : ''} ${sheet ? 'sheet-overlay' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div ref={ref} className={`modal ${wide ? 'wide' : ''} ${size ? `${size}-modal` : ''} ${sheet ? 'sheet' : ''}`} role="dialog" aria-modal="true" aria-label={label} variants={sheet ? sheetIn : dialogIn} initial="initial" animate="animate" exit="exit">
        {sheet && <span className="sheet-grabber" aria-hidden />}
        {children}
      </motion.div>
    </motion.div>
  );
}

export function useEscape(fn: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      // Let the innermost layer (confirm dialog, palette, popover) handle Escape first.
      if (e.key === 'Escape' && !document.querySelector('[role=alertdialog], .palette, .popover')) fn();
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
        <ChevronRight size={15} className="chev" />
        {title}
        <span className="spacer" />
        {aside}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.24, ease: ease.out } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.16, ease: ease.in } }}
            style={{ overflow: 'hidden' }}
          >
            <div className="section-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
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
  value, onCommit, placeholder, className = 'input', type = 'text', ariaLabel,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; type?: string; ariaLabel?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={className}
      type={type}
      value={v}
      placeholder={placeholder}
      aria-label={ariaLabel}
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
  designers, value, onChange, allowNone = true, noneLabel = 'Unassigned', ariaLabel, size, placeholder,
}: { designers: Designer[]; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; noneLabel?: string; ariaLabel?: string; size?: 'sm'; placeholder?: string }) {
  const options: SelectOption<string>[] = [
    ...(allowNone ? [{ value: '', label: noneLabel, icon: <Avatar /> }] : []),
    ...designers.map((d) => ({ value: d.id, label: d.name, icon: <Avatar designer={d} /> })),
  ];
  return <Select value={placeholder && value == null ? undefined : value ?? ''} options={options} onChange={(v) => onChange(v || null)} ariaLabel={ariaLabel} size={size} placeholder={placeholder} menuWidth={220} />;
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
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.span key={it} className="chip" layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {it}
              <button aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}>×</button>
            </motion.span>
          ))}
        </AnimatePresence>
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
        <motion.div
          key={i}
          className={`b lvl-${loadLevel(v)}`}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: i * 0.015, duration: 0.35, ease: ease.out }}
          style={{ height: `${Math.max(2, (v / max) * 100)}%`, transformOrigin: 'bottom' }}
          title={onBarTitle?.(i) ?? `${Math.round(v)}%`}
        />
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

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div className="empty-state" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <span className="empty-icon"><Icon size={20} strokeWidth={1.75} /></span>
      <b>{title}</b>
      {children && <p className="muted small">{children}</p>}
      {action}
    </motion.div>
  );
}

/** Toolbar row at the top of a view (titles now live in the top bar). */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

/**
 * Native range input (keeps keyboard + screen reader support) with a styled
 * filled track, soft thumb, and a value bubble that appears while dragging.
 */
export function Slider({
  value, min, max, step = 1, onChange, ariaLabel, format = (v) => `${v}`, color, marks,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  format?: (v: number) => string;
  color?: string;
  /** Optional reference ticks under the track, e.g. [50] for a halfway marker. */
  marks?: number[];
}) {
  const frac = (Math.min(max, Math.max(min, value)) - min) / (max - min || 1);
  return (
    <div className="slider" style={{ '--frac': frac, ...(color ? { '--fill': color } : {}) } as React.CSSProperties}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {marks?.map((m) => (
        <span key={m} className="slider-mark" style={{ '--mfrac': (m - min) / (max - min) } as React.CSSProperties} />
      ))}
      <span className="slider-bubble" aria-hidden>{format(value)}</span>
    </div>
  );
}

/** iOS-style toggle; a button with role="switch" so it's keyboard and screen-reader friendly. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <motion.span className="switch-knob" layout transition={{ type: 'spring', stiffness: 700, damping: 40 }} />
    </button>
  );
}

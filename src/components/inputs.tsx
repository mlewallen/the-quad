import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';
import { Popover } from './Popover';
import { readableOn } from '../lib/motion';

/*
 * The app's form controls. Every one is drawn by us (no OS menus, spinners,
 * checkmarks or color wells) and shares the .select / .input look and the
 * popover menus the week picker uses.
 */

export interface SelectOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Plain text for type-ahead and the trigger's accessible name; defaults to the label when it's a string. */
  text?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Options sharing a group get a small header above them. */
  group?: string;
}

const textOf = <V extends string | number>(o: SelectOption<V>) => o.text ?? (typeof o.label === 'string' ? o.label : String(o.value));

/**
 * Single-choice dropdown: a .select-styled button and a listbox menu.
 * Arrow keys, Home/End and type-ahead move through options; Enter or Space picks.
 * With `placeholder` and a value that matches no option, it works as an action
 * menu ("Assign…") that shows the placeholder again after each pick.
 */
export function Select<V extends string | number>({
  value, options, onChange, placeholder = 'Select…', size, ariaLabel, width, menuWidth = 180, disabled, className = '', renderValue, id, describedBy,
}: {
  value: V | null | undefined;
  options: SelectOption<V>[];
  onChange: (v: V) => void;
  placeholder?: string;
  size?: 'sm';
  ariaLabel?: string;
  width?: number | string;
  menuWidth?: number;
  disabled?: boolean;
  className?: string;
  renderValue?: (o: SelectOption<V> | undefined) => ReactNode;
  id?: string;
  describedBy?: string;
}) {
  const current = options.find((o) => o.value === value);
  const shown = renderValue ? renderValue(current) : current ? (
    <>
      {current.icon && <span className="select-icon">{current.icon}</span>}
      <span className="ellipsis">{current.label}</span>
    </>
  ) : <span className="ellipsis select-placeholder">{placeholder}</span>;
  return (
    <Popover
      role="presentation"
      width={menuWidth}
      matchTriggerWidth
      className="select-menu"
      trigger={({ open, toggle, setOpen }) => (
        <button
          type="button"
          id={id}
          className={`select select-trigger ${size ?? ''} ${open ? 'open' : ''} ${className}`}
          style={width != null ? { width } : undefined}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ? `${ariaLabel}: ${current ? textOf(current) : placeholder}` : undefined}
          aria-describedby={describedBy}
        >
          {shown}
          <ChevronDown size={size ? 13 : 14} className="select-chevron" aria-hidden />
        </button>
      )}
    >
      {(close) => <Listbox value={value} options={options} label={ariaLabel} onPick={(v) => { close(); if (v !== value || current == null) onChange(v); }} />}
    </Popover>
  );
}

function Listbox<V extends string | number>({ value, options, label, onPick }: { value: V | null | undefined; options: SelectOption<V>[]; label?: string; onPick: (v: V) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const items = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)') ?? [])];

  useEffect(() => {
    const list = items();
    (list.find((b) => b.getAttribute('aria-selected') === 'true') ?? list[0])?.focus({ preventScroll: false });
  }, []);

  const onKey = (e: KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(list.length - 1, i + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Tab') e.preventDefault();
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      next = list.findIndex((b) => (b.dataset.text ?? '').toLowerCase().startsWith(typed.current.text));
    }
    if (next >= 0) {
      e.preventDefault();
      list[next].focus();
    }
  };

  let lastGroup: string | undefined;
  return (
    <div ref={ref} role="listbox" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => {
        const header = o.group && o.group !== lastGroup ? o.group : null;
        lastGroup = o.group;
        const on = o.value === value;
        return (
          <div key={String(o.value)} role="presentation">
            {header && <div className="menu-section" role="presentation">{header}</div>}
            <button type="button" role="option" aria-selected={on} data-text={textOf(o)} disabled={o.disabled} className={`menu-item select-option ${on ? 'on' : ''}`} onClick={() => onPick(o.value)}>
              {o.icon && <span className="menu-icon">{o.icon}</span>}
              <span className="menu-label">{o.label}</span>
              {o.hint && <span className="menu-hint">{o.hint}</span>}
              <span className="select-check" aria-hidden>{on && <Check size={14} />}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Styled checkbox. With children, the whole label is the click target and its text is the accessible name. */
export function Checkbox({
  checked, onChange, ariaLabel, disabled, indeterminate, children, className = '',
}: {
  checked: boolean;
  onChange: (v: boolean, e: MouseEvent) => void;
  ariaLabel?: string;
  disabled?: boolean;
  indeterminate?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`checkbox ${children ? 'with-label' : ''} ${className}`}
      onClick={(e) => onChange(!checked, e)}
    >
      <span className={`check-box ${checked || indeterminate ? 'on' : ''}`} aria-hidden>
        {indeterminate ? <Minus size={11} strokeWidth={3} /> : checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      {children && <span className="check-text">{children}</span>}
    </button>
  );
}

/** Whole-number field with − / + steppers; arrow keys step too. Typing commits on each valid value. */
export function NumberField({
  value, onChange, min = -Infinity, max = Infinity, step = 1, ariaLabel, size, suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
  size?: 'sm';
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const set = (v: number) => {
    const c = clamp(v);
    setDraft(String(c));
    if (c !== value) onChange(c);
  };
  return (
    <div className={`number-field ${size ?? ''}`}>
      <button type="button" className="number-step" tabIndex={-1} aria-label={`Decrease ${ariaLabel}`} disabled={value <= min} onClick={() => set(value - step)}><Minus size={12} /></button>
      <input
        className={`input ${size ?? ''}`}
        inputMode="numeric"
        role="spinbutton"
        aria-label={ariaLabel}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        value={draft}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d-]/g, '');
          setDraft(t);
          const n = parseInt(t, 10);
          if (!Number.isNaN(n) && n >= min && n <= max && n !== value) onChange(n);
        }}
        onBlur={() => setDraft(String(value))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            set(value + (e.key === 'ArrowUp' ? step : -step));
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {suffix && <span className="number-suffix" aria-hidden>{suffix}</span>}
      <button type="button" className="number-step" tabIndex={-1} aria-label={`Increase ${ariaLabel}`} disabled={value >= max} onClick={() => set(value + step)}><Plus size={12} /></button>
    </div>
  );
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** Color choice from a swatch grid, plus a hex field for anything else. */
export function ColorField({
  value, onChange, swatches, ariaLabel, trigger,
}: {
  value: string;
  onChange: (hex: string) => void;
  swatches: string[];
  ariaLabel: string;
  /** Custom trigger content (e.g. an avatar); defaults to a swatch button. */
  trigger?: (p: { open: boolean; toggle: () => void }) => ReactNode;
}) {
  return (
    <Popover
      role="dialog"
      width={232}
      trigger={(t) =>
        trigger ? trigger(t) : (
          <button type="button" className={`color-trigger ${t.open ? 'open' : ''}`} onClick={t.toggle} aria-haspopup="dialog" aria-expanded={t.open} aria-label={`${ariaLabel}: ${value}`}>
            <span style={{ background: value }} />
          </button>
        )
      }
    >
      {(close) => <ColorPanel value={value} swatches={swatches} label={ariaLabel} onPick={(c, done) => { onChange(c); if (done) close(); }} />}
    </Popover>
  );
}

function ColorPanel({ value, swatches, label, onPick }: { value: string; swatches: string[]; label: string; onPick: (c: string, done: boolean) => void }) {
  const [hex, setHex] = useState(value);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const btns = [...(grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    (btns.find((b) => b.getAttribute('aria-pressed') === 'true') ?? btns[0])?.focus();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    const btns = [...(grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const cols = 6;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (d == null || i < 0) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, i + d))].focus();
  };
  const commit = () => {
    const m = HEX.exec(hex.trim());
    if (m) onPick(`#${m[1].toLowerCase()}`, false);
    else setHex(value);
  };
  return (
    <div className="color-panel" aria-label={label}>
      <div ref={grid} className="color-grid" onKeyDown={onKey}>
        {swatches.map((c) => (
          <button key={c} type="button" className={`color-swatch ${c.toLowerCase() === value.toLowerCase() ? 'on' : ''}`} style={{ background: c, color: readableOn(c) }} aria-label={c} aria-pressed={c.toLowerCase() === value.toLowerCase()} onClick={() => onPick(c, true)}>
            {c.toLowerCase() === value.toLowerCase() && <Check size={13} strokeWidth={3} />}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className="color-preview" style={{ background: HEX.test(hex.trim()) ? `#${HEX.exec(hex.trim())![1]}` : value }} aria-hidden />
        <input className="input sm mono" value={hex} aria-label="Hex color" onChange={(e) => setHex(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} spellCheck={false} />
      </div>
    </div>
  );
}

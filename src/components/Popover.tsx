import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { popIn } from '../lib/motion';

/**
 * Anchored popover, rendered in a portal on <body> so it is never clipped by
 * an ancestor's overflow (e.g. the sidebar). Position is computed from the
 * trigger's rect and kept in sync on scroll/resize. Closes on outside click,
 * Escape, or when a child calls `close`.
 */
export function Popover({
  trigger, children, align = 'start', width = 260, side = 'bottom',
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  side?: 'bottom' | 'right';
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const place = () => {
    const el = anchor.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Match the app's UI-scale zoom: lengths on a zoomed element are multiplied
    // by the zoom, so viewport positions are divided by it.
    const z = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    const vw = window.innerWidth;
    // Never wider than the viewport (phones); a no-op at desktop sizes.
    const w = Math.min(width * z, vw - 16);
    const gap = 6 * z;
    let top: number;
    let left: number;
    let origin: string;
    if (side === 'right') {
      // Near the bottom of the viewport, grow upward from the trigger instead.
      if (r.top > window.innerHeight / 2) {
        setStyle({ bottom: (window.innerHeight - r.bottom) / z, left: Math.min(r.right + gap, vw - w - 8) / z, width: w / z, zoom: z, transformOrigin: 'left bottom' });
        return;
      }
      [top, left, origin] = [r.top, Math.min(r.right + gap, vw - w - 8), 'left top'];
    }
    else if (align === 'end') [top, left, origin] = [r.bottom + gap, Math.max(8, r.right - w), 'top right'];
    else [top, left, origin] = [r.bottom + gap, Math.max(8, Math.min(r.left, vw - w - 8)), 'top left'];
    setStyle({ top: top / z, left: left / z, width: w / z, zoom: z, transformOrigin: origin });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="popover-anchor" ref={anchor}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={panel} className="popover" role="menu" style={style} variants={popIn} initial="initial" animate="animate" exit="exit">
              {children(() => setOpen(false))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

export function MenuItem({
  icon, children, onSelect, hint, active, danger, disabled,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  hint?: ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button role="menuitem" className={`menu-item ${active ? 'active' : ''} ${danger ? 'danger' : ''}`} onClick={onSelect} disabled={disabled}>
      {icon && <span className="menu-icon">{icon}</span>}
      <span className="menu-label">{children}</span>
      {hint && <span className="menu-hint">{hint}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-section">{children}</div>;
}

export function MenuDivider() {
  return <div className="menu-divider" />;
}

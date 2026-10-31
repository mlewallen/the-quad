import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { popIn } from '../lib/motion';

/**
 * Anchored popover. `trigger` receives the open state and a toggle; the panel
 * closes on outside click, Escape, or when a child calls `close`.
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
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pos =
    side === 'right'
      ? { left: 'calc(100% + 8px)', bottom: 0 }
      : align === 'end'
        ? { right: 0, top: 'calc(100% + 6px)' }
        : { left: 0, top: 'calc(100% + 6px)' };

  return (
    <div className="popover-anchor" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            className="popover"
            role="menu"
            style={{ width, ...pos, transformOrigin: side === 'right' ? 'left bottom' : align === 'end' ? 'top right' : 'top left' }}
            variants={popIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
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

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { dismissToast, useFeedback } from '../feedback';
import { dialogIn, spring } from '../lib/motion';

export function Toaster() {
  const toasts = useFeedback((s) => s.toasts);
  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast ${t.tone}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.snappy }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
          >
            {t.tone === 'success' ? <CircleCheck size={16} /> : t.tone === 'danger' ? <TriangleAlert size={16} /> : <Info size={16} />}
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  dismissToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConfirmHost() {
  const req = useFeedback((s) => s.confirm);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') req.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    setTimeout(() => confirmBtn.current?.focus(), 30);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          className="overlay center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          onMouseDown={(e) => e.target === e.currentTarget && req.resolve(false)}
        >
          <motion.div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" variants={dialogIn} initial="initial" animate="animate" exit="exit">
            <div className={`dialog-icon ${req.destructive ? 'danger' : ''}`}>
              {req.destructive ? <TriangleAlert size={18} /> : <Info size={18} />}
            </div>
            <h2 id="confirm-title">{req.title}</h2>
            {req.body && <p className="muted">{req.body}</p>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn ghost" onClick={() => req.resolve(false)}>Cancel</button>
              <button ref={confirmBtn} className={`btn ${req.destructive ? 'destructive' : 'primary'}`} onClick={() => req.resolve(true)}>
                {req.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

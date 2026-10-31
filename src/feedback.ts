import { create } from 'zustand';

/** Transient UI feedback (toasts, confirm dialogs, command palette). Never persisted. */

export type ToastTone = 'neutral' | 'success' | 'danger';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

export interface ImporterRequest {
  text?: string;
  filename?: string;
  tab?: 'paste' | 'upload' | 'sheets' | 'trackers';
}

interface FeedbackState {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  paletteOpen: boolean;
  setPaletteOpen(open: boolean): void;
  /** Open importer modal (paste anywhere, file drop, palette). */
  importer: ImporterRequest | null;
}

export const useFeedback = create<FeedbackState>()((set) => ({
  toasts: [],
  confirm: null,
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  importer: null,
}));

export function openImporter(req: ImporterRequest = {}) {
  useFeedback.setState({ importer: req, paletteOpen: false });
}

export function closeImporter() {
  useFeedback.setState({ importer: null });
}

let nextId = 1;

export function toast(message: string, opts: { tone?: ToastTone; action?: Toast['action']; duration?: number } = {}) {
  const id = nextId++;
  useFeedback.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, tone: opts.tone ?? 'neutral', action: opts.action }] }));
  setTimeout(() => dismissToast(id), opts.duration ?? 3600);
}

export function dismissToast(id: number) {
  useFeedback.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** In-app replacement for window.confirm. */
export function confirmDialog(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.setState({
      confirm: {
        ...req,
        resolve: (ok) => {
          useFeedback.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

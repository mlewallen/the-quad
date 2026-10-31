import { useRef } from 'react';
import type { Curve, CurveShape } from '../types';
import { CURVE_LABELS, curveFactors } from '../lib/curves';

/**
 * Per-week allocation shape. Dragging any bar switches the curve to "custom"
 * and stores factors at the current duration; they're resampled
 * proportionally if duration changes later.
 */
export default function CurveEditor({
  curve, duration, max, onChange, color = 'var(--accent)',
}: { curve: Curve; duration: number; max: number; onChange: (c: Curve) => void; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const factors = curveFactors(curve, duration);

  const setFromPointer = (clientX: number, clientY: number, working: number[]) => {
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(duration - 1, Math.floor(((clientX - rect.left) / rect.width) * duration)));
    const f = Math.max(0, Math.min(1, 1 - (clientY - rect.top - 6) / (rect.height - 12)));
    working[i] = Math.round(f * 20) / 20;
    onChange({ shape: 'custom', values: working.slice() });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const working = factors.slice();
    setFromPointer(e.clientX, e.clientY, working);
    const move = (ev: PointerEvent) => setFromPointer(ev.clientX, ev.clientY, working);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="col">
      <div className="segmented" role="radiogroup" aria-label="Curve shape">
        {(Object.keys(CURVE_LABELS) as CurveShape[]).map((s) => (
          <button
            key={s}
            className={curve.shape === s ? 'on' : ''}
            role="radio"
            aria-checked={curve.shape === s}
            onClick={() => onChange(s === 'custom' ? { shape: 'custom', values: factors } : { shape: s })}
          >
            {CURVE_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="curve-editor" ref={ref} onPointerDown={onPointerDown} style={{ paddingTop: 18 }}>
        {factors.map((f, i) => (
          <div key={i} className="bar" style={{ height: `${Math.max(2, f * 100)}%`, background: color }} title={`Week ${i + 1}: ${Math.round(f * max)}%`}>
            {duration <= 16 && <span>{Math.round(f * max)}</span>}
          </div>
        ))}
      </div>
      <span className="tiny faint">Drag bars to draw a custom curve. Values are % of the designer's week.</span>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export default function Celebration() {
  const celebration = useStore((s) => s.celebration);
  const dismiss = useStore((s) => s.dismissCelebration);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(dismiss, 3200);
    const cv = canvas.current;
    if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => clearTimeout(timer);
    const ctx = cv.getContext('2d')!;
    cv.width = innerWidth;
    cv.height = innerHeight;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const colors = [accent, '#f59e0b', '#ec4899', '#14b8a6', '#22c55e', '#6366f1'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: innerHeight - 60,
      vx: (Math.random() - 0.5) * 14,
      vy: -8 - Math.random() * 12,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 5 + Math.random() * 5,
      h: 3 + Math.random() * 4,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - frame / 150);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (frame < 150) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [celebration, dismiss]);

  if (!celebration) return null;
  return (
    <>
      <canvas ref={canvas} className="confetti" key={celebration.id} />
      <div className="celebrate-toast" role="status" onClick={dismiss}>
        🎉 {celebration.message}
        {celebration.unlocked && <span className="celebrate-unlock">Unlocked “{celebration.unlocked}”</span>}
      </div>
    </>
  );
}

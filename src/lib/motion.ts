import type { Transition, Variants } from 'motion/react';

/**
 * Motion tokens. Principles (see docs/design-critique.md):
 * fast and physical, enter softly / exit faster, motion explains change,
 * and everything degrades to opacity-only under prefers-reduced-motion
 * (handled globally by <MotionConfig reducedMotion="user">).
 */

export const spring = {
  /** Small chrome: buttons, menus, chips. */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } as Transition,
  /** Panels, dialogs, layout shifts. */
  smooth: { type: 'spring', stiffness: 360, damping: 34 } as Transition,
  /** Gantt bars settling after a drop. */
  settle: { type: 'spring', stiffness: 420, damping: 32 } as Transition,
};

export const ease = {
  out: [0.16, 1, 0.3, 1] as const,
  in: [0.4, 0, 1, 1] as const,
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: ease.in } },
};

export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.1, ease: ease.in } },
};

export const dialogIn: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.smooth },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14, ease: ease.in } },
};

/** Bottom sheet on phones: slides up from the bottom edge, same spring as dialogs. */
export const sheetIn: Variants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: spring.smooth },
  exit: { y: '100%', transition: { duration: 0.2, ease: ease.in } },
};

/** Parent/child pair for staggered list/card reveals. Capped so long lists don't drag. */
export const staggerParent: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
};

export const staggerChild: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.26, ease: ease.out } },
};

/** Pick black or white text for a hex background (WCAG relative luminance). */
export function readableOn(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast vs white = 1.05 / (L + 0.05); vs near-black (#111) ≈ (L + 0.05) / 0.056
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.056 ? '#fff' : '#111';
}

import { useEffect, useRef, useState } from 'react';

const SWEEP_MS = 1800;
const TICK_MS = 50;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Smoothly animates from the previously displayed value to `targetSeconds`
 * whenever it changes, instead of snapping — so a target that jumps forward
 * in large, irregular steps (e.g. one Kafka micro-batch at a time) still
 * reads as a continuously flowing clock rather than a jump-cut.
 *
 * Uses setInterval rather than requestAnimationFrame: rAF is throttled to
 * (near) zero in a background/unfocused tab, which would freeze the clock
 * entirely — setInterval degrades to coarser but still-live updates instead.
 */
export function useSmoothClock(targetSeconds: number | null): number | null {
  const [displaySeconds, setDisplaySeconds] = useState<number | null>(null);
  const displayRef = useRef<number | null>(null);
  displayRef.current = displaySeconds;

  useEffect(() => {
    if (targetSeconds == null) return;

    const from = displayRef.current ?? targetSeconds;
    const to = targetSeconds;
    const start = Date.now();

    setDisplaySeconds(from);
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / SWEEP_MS);
      setDisplaySeconds(from + (to - from) * easeOutCubic(t));
      if (t >= 1) clearInterval(id);
    }, TICK_MS);

    return () => clearInterval(id);
  }, [targetSeconds]);

  return displaySeconds;
}

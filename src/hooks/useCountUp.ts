import { useEffect, useState } from 'react';

export function useCountUp(end: number, duration = 2000, active = true) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || end === 0) return;

    let startTime: number | null = null;
    let raf: number;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * end));
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, duration, active]);

  return value;
}

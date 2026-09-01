import { useCountUp } from '../../hooks/useCountUp';
import { useInView } from '../../hooks/useInView';

interface Props {
  end: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  labelClassName?: string;
  label: string;
  compact?: boolean;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function AnimatedCounter({
  end, prefix = '', suffix = '', decimals = 0, duration = 2000,
  className = '', labelClassName = '', label, compact = false,
}: Props) {
  const { ref, inView } = useInView(0.2);
  const value = useCountUp(end, duration, inView);

  const display = compact ? formatCompact(value) : value.toLocaleString();
  const final = decimals > 0
    ? (value / Math.pow(10, decimals)).toFixed(decimals)
    : display;

  return (
    <div ref={ref} className={className}>
      <span className={`pulse-counter-num ${className ? className + '-num' : ''}`}>
        {prefix}{final}{suffix}
      </span>
      <span className={`pulse-counter-lbl ${labelClassName}`}>{label}</span>
    </div>
  );
}

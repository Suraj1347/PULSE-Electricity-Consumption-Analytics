import { motion } from 'framer-motion';

interface Props {
  className?: string;
  size?: number;
  rings?: number;
  active?: boolean;
}

export default function EnergyPulse({ className = '', size = 200, rings = 3, active = true }: Props) {
  return (
    <div className={`pulse-energy-wrapper ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <motion.div
        className="pulse-energy-core"
        animate={active ? {
          scale: [1, 1.15, 1],
          opacity: [0.8, 1, 0.8],
        } : { scale: 0, opacity: 0 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      {Array.from({ length: rings }, (_, i) => (
        <motion.div
          key={i}
          className="pulse-energy-ring"
          animate={active ? {
            scale: [0.3, 1.2],
            opacity: [0.5, 0],
          } : { scale: 0, opacity: 0 }}
          transition={{
            duration: 2.5,
            delay: i * 0.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

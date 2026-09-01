import { motion } from 'framer-motion';
import { useInView } from '../hooks/useInView';
import EnergyPulse from '../components/EnergyPulse/EnergyPulse';
import './Final.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function Final() {
  const { ref, inView } = useInView(0.2);

  return (
    <section ref={ref} className="final">
      <div className="final-atmo" />
      <div className="final-inner">
        <motion.div
          className="final-pulse"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 1.2, ease: EASE }}
        >
          <EnergyPulse size={100} />
        </motion.div>

        <motion.h2
          className="final-headline"
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 1, delay: 0.3, ease: EASE }}
        >
          THE SIGNAL WAS ALWAYS THERE.
        </motion.h2>

        <motion.h3
          className="final-sub"
          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={inView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 1, delay: 0.6, ease: EASE }}
        >
          PULSE MADE IT VISIBLE.
        </motion.h3>

        <motion.div
          className="final-stats-row"
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
        >
          <span className="final-stat">2,075,259 readings</span>
          <span className="final-stat-dot" />
          <span className="final-stat">47 months</span>
          <span className="final-stat-dot" />
          <span className="final-stat">7 analytics</span>
          <span className="final-stat-dot" />
          <span className="final-stat">1 pipeline</span>
        </motion.div>

        <motion.div
          className="final-source"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 0.5 } : {}}
          transition={{ duration: 1, delay: 1.2 }}
        >
          <span>UCI Machine Learning Repository</span>
          <span className="final-dot" />
          <span>Individual Household Electric Power Consumption</span>
          <span className="final-dot" />
          <span>Group 16 — BDC Continuous Assessment</span>
        </motion.div>
      </div>
    </section>
  );
}

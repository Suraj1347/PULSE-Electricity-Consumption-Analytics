import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useInView } from '../hooks/useInView';
import SectionReveal from '../components/SectionReveal/SectionReveal';
import './Engine.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const PIPELINE = [
  { n: '01', title: 'UCI Dataset', metric: '126.8 MB', sub: '2,075,259 rows', desc: 'Individual Household Electric Power Consumption', color: 'var(--text-secondary)' },
  { n: '02', title: 'HDFS Raw', metric: '/pulse/raw/', sub: '1 DataNode', desc: 'Distributed storage on Hadoop 3.4.1', color: 'var(--blue)' },
  { n: '03', title: 'Apache Spark', metric: 'PySpark 4.2.0', sub: 'local[*]', desc: 'Batch analytics engine for large-scale computation', color: 'var(--accent)' },
  { n: '04', title: '7 Analytics', metric: '7 outputs', sub: 'patterns + anomalies', desc: 'Pattern extraction, aggregation, and detection', color: 'var(--accent)' },
  { n: '05', title: 'HDFS Output', metric: '/pulse/output/', sub: '7 outputs', desc: 'Verified results stored in distributed filesystem', color: 'var(--blue)' },
  { n: '06', title: 'PULSE', metric: 'Verified', sub: 'analytics visualization', desc: 'Visual intelligence interface for energy analysis', color: 'var(--accent)' },
];

const BADGES = [
  { label: 'ROWS', value: '2,075,259' },
  { label: 'MISSING BLOCKS', value: '0' },
  { label: 'CORRUPT REPLICAS', value: '0' },
  { label: 'UNDER-REPLICATED', value: '0' },
  { label: 'HDFS USAGE', value: '127.88 MB' },
];

export default function Engine() {
  const { ref, inView } = useInView(0.1);
  const [activeStep, setActiveStep] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    let i = 0;
    const interval = setInterval(() => {
      setActiveStep(i);
      i++;
      if (i >= PIPELINE.length) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [inView]);

  return (
    <section className="eng">
      <div className="eng-atmo" />
      <div className="eng-inner">
        <SectionReveal>
          <div className="eng-header">
            <div>
              <span className="pulse-section-num">06</span>
              <h2 className="pulse-section-title">DATA ENGINE</h2>
            </div>
            <p className="eng-subtitle">The verified pipeline architecture — 2,075,259 raw records transformed through a full HDFS-to-dashboard system.</p>
          </div>
        </SectionReveal>

        {/* Pipeline */}
        <div className="eng-pipeline-wrap" ref={ref}>
          <div className="eng-pipeline">
            {PIPELINE.map((step, i) => (
              <div key={step.n} className="eng-pipeline-step">
                <motion.div
                  className={`eng-node ${activeStep >= i ? 'eng-node--active' : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: i * 0.15, ease: EASE }}
                >
                  <div className="eng-node-header">
                    <span className="eng-node-n">{step.n}</span>
                    <span className="eng-node-title">{step.title}</span>
                  </div>
                  <div className="eng-node-metric" style={{ color: step.color }}>{step.metric}</div>
                  <span className="eng-node-sub">{step.sub}</span>
                  <span className="eng-node-desc">{step.desc}</span>
                </motion.div>

                {i < PIPELINE.length - 1 && (
                  <div className="eng-connector">
                    <motion.div
                      className="eng-connector-line"
                      initial={{ scaleX: 0 }}
                      animate={activeStep >= i ? { scaleX: 1 } : {}}
                      transition={{ duration: 0.4, delay: i * 0.15 + 0.2, ease: EASE }}
                    />
                    <motion.div
                      className="eng-connector-pulse"
                      initial={{ opacity: 0 }}
                      animate={activeStep >= i ? { opacity: [0, 1, 0] } : {}}
                      transition={{ duration: 1.2, delay: i * 0.15 + 0.4, ease: 'easeInOut' }}
                    />
                    <svg className="eng-connector-arrow" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6h8M7 3l3 3-3 3" stroke="var(--accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Verification Badges */}
        <SectionReveal delay={0.5}>
          <div className="eng-badges">
            <div className="eng-badges-header">
              <span className="eng-badges-label">PIPELINE VERIFICATION</span>
              <span className="eng-badges-tag">SPARK + HDFS VERIFIED</span>
            </div>
            <div className="eng-badges-grid">
              {BADGES.map((b, i) => (
                <motion.div
                  key={b.label}
                  className="eng-badge"
                  initial={{ opacity: 0, y: 12 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.6 + i * 0.08, ease: EASE }}
                >
                  <span className="eng-badge-value">{b.value}</span>
                  <span className="eng-badge-label">{b.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { loadSummary, loadDailyConsumption, loadHourlyProfile, loadWeeklyPattern, loadFingerprint, loadAnomalies } from '../data/dataLoader';
import type { SparkSummary, DailyConsumptionPoint, HourlyProfilePoint, WeeklyPatternPoint, FingerprintRecord, AnomalyRecord } from '../types/analytics';
import { useInView } from '../hooks/useInView';
import AnimatedCounter from '../components/AnimatedCounter/AnimatedCounter';
import EmergenceIntro from '../components/EmergenceIntro/EmergenceIntro';
import './CommandCenter.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function MiniChart({ data }: { data: DailyConsumptionPoint[] }) {
  if (data.length === 0) return null;
  const recent = data.slice(-365);
  return (
    <ResponsiveContainer width="100%" height={64}>
      <AreaChart data={recent} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ccMiniGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="consumption" stroke="var(--accent)" strokeWidth={1} fill="url(#ccMiniGrad)" dot={false} animationDuration={2000} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MiniHourly({ data }: { data: HourlyProfilePoint[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(h => h.averageConsumption));
  return (
    <div className="cc-hourly-mini">
      {data.map((h, i) => (
        <div key={h.hour} className="cc-hourly-mini-col">
          <div className="cc-hourly-mini-track">
            <motion.div
              className={`cc-hourly-mini-fill ${h.hour === 20 ? 'cc-hourly-mini-fill--peak' : ''}`}
              initial={{ height: 0 }}
              animate={{ height: `${(h.averageConsumption / max) * 100}%` }}
              transition={{ duration: 0.5, delay: 0.6 + i * 0.03, ease: EASE }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FingerprintPreview({ data }: { data: FingerprintRecord[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.avg_kw));
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="cc-fp-preview">
      {days.map(day => (
        <div key={day} className="cc-fp-row">
          {Array.from({ length: 24 }, (_, h) => {
            const cell = data.find(d => d.day === day && d.hour === h);
            const val = cell?.avg_kw ?? 0;
            const intensity = max > 0 ? val / max : 0;
            return (
              <div
                key={h}
                className="cc-fp-cell"
                style={{ background: `rgba(0, 212, 170, ${Math.max(0.03, intensity * 0.7)})` }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function CommandCenter() {
  const [introComplete, setIntroComplete] = useState(false);
  const [summary, setSummary] = useState<SparkSummary | null>(null);
  const [daily, setDaily] = useState<DailyConsumptionPoint[]>([]);
  const [hourly, setHourly] = useState<HourlyProfilePoint[]>([]);
  const [fp, setFp] = useState<FingerprintRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [weekly, setWeekly] = useState<WeeklyPatternPoint[]>([]);
  const { ref: heroRef } = useInView(0.1);
  const { ref: gridRef, inView: gridInView } = useInView(0.15);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  useEffect(() => {
    Promise.all([loadSummary(), loadDailyConsumption(), loadHourlyProfile(), loadWeeklyPattern(), loadFingerprint(), loadAnomalies()])
      .then(([s, d, h, w, f, a]) => { setSummary(s); setDaily(d); setHourly(h); setWeekly(w); setFp(f); setAnomalies(a); })
      .catch(() => {});
  }, []);

  const peakHour = hourly.length > 0 ? hourly.reduce((max, h) => h.averageConsumption > max.averageConsumption ? h : max, hourly[0]) : null;
  const peakMetric = peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '--';

  const weekendPremium = (() => {
    if (weekly.length === 0) return 0;
    const weekendDays = weekly.filter(d => d.day === 'Saturday' || d.day === 'Sunday');
    const weekdayDays = weekly.filter(d => d.day !== 'Saturday' && d.day !== 'Sunday');
    const weekendAvg = weekendDays.length > 0 ? weekendDays.reduce((s, d) => s + d.averageConsumption, 0) / weekendDays.length : 0;
    const weekdayAvg = weekdayDays.length > 0 ? weekdayDays.reduce((s, d) => s + d.averageConsumption, 0) / weekdayDays.length : 0;
    return weekdayAvg > 0 ? Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100) : 0;
  })();

  return (
    <section className={`cc ${introComplete ? 'cc--ready' : ''}`} id="command-center">
      {/* Emergence Intro Overlay */}
      {!introComplete && (
        <EmergenceIntro onComplete={handleIntroComplete} />
      )}

      <div className="cc-atmo" />

      {/* Hero Brand Area */}
      <div className="cc-hero" ref={heroRef}>
        <motion.div
          className="cc-brand"
          initial={{ opacity: 0, filter: 'blur(20px)' }}
          animate={introComplete ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(20px)' }}
          transition={{ duration: introComplete ? 0.8 : 0, delay: introComplete ? 0.2 : 0, ease: EASE }}
        >
          <motion.h1
            className="cc-title"
            initial={{ opacity: 0, letterSpacing: '30px', scale: 1.05 }}
            animate={introComplete ? { opacity: 1, letterSpacing: '14px', scale: 1 } : { opacity: 0, letterSpacing: '30px', scale: 1.05 }}
            transition={{ duration: introComplete ? 1 : 0, ease: EASE }}
          >
            PULSE
          </motion.h1>
          <motion.p
            className="cc-tagline"
            initial={{ opacity: 0, y: 12 }}
            animate={introComplete ? { opacity: 0.7, y: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: introComplete ? 0.8 : 0, delay: 0.2, ease: EASE }}
          >
            ENERGY INTELLIGENCE
          </motion.p>
        </motion.div>

        <motion.p
          className="cc-hero-statement"
          initial={{ opacity: 0, y: 20 }}
          animate={introComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: introComplete ? 0.7 : 0, delay: 0.5, ease: EASE }}
        >
          One household in Sceaux, France — every minute for 47 months.
          2,075,259 readings transformed into energy intelligence through Apache Spark and HDFS.
        </motion.p>

        <motion.div
          className="cc-hero-meta"
          initial={{ opacity: 0 }}
          animate={introComplete ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: introComplete ? 0.6 : 0, delay: 0.7 }}
        >
          <span className="cc-hero-tag">SPARK VERIFIED</span>
          <span className="cc-hero-sep">/</span>
          <span className="cc-hero-text">UCI Machine Learning Repository</span>
          <span className="cc-hero-sep">/</span>
          <span className="cc-hero-text">Sceau, France</span>
          <span className="cc-hero-sep">/</span>
          <span className="cc-hero-text">Dec 2006 — Nov 2010</span>
        </motion.div>
      </div>

      {/* Metric Grid */}
      <div className="cc-grid-wrap" ref={gridRef}>
        <div className="cc-grid">
          {/* Primary: Total Energy */}
          <motion.div
            className="cc-card cc-card--primary"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">TOTAL ENERGY</span>
              <span className="cc-card-badge">PRIMARY</span>
            </div>
            <div className="cc-card-value-row">
              <AnimatedCounter
                end={summary ? Math.round(summary.total_energy_kwh * 100) : 3728375}
                decimals={2}
                duration={2200}
                label=""
                className="cc-card-value"
              />
              <span className="cc-card-unit">kWh</span>
            </div>
            <MiniChart data={daily} />
          </motion.div>

          {/* Readings */}
          <motion.div
            className="cc-card"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">READINGS</span>
            </div>
            <div className="cc-card-value-row">
              <AnimatedCounter
                end={summary ? summary.raw_rows : 2075259}
                duration={2400}
                label=""
                className="cc-card-value"
                compact
              />
            </div>
            <span className="cc-card-sub">minute-level records</span>
          </motion.div>

          {/* Months */}
          <motion.div
            className="cc-card"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.14, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">DURATION</span>
            </div>
            <div className="cc-card-value-row">
              <AnimatedCounter end={47} duration={1600} label="" className="cc-card-value" />
              <span className="cc-card-unit">months</span>
            </div>
            <span className="cc-card-sub">1-minute resolution</span>
          </motion.div>

          {/* Peak Power */}
          <motion.div
            className="cc-card"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">PEAK POWER</span>
            </div>
            <div className="cc-card-value-row">
              <AnimatedCounter
                end={summary ? Math.round(summary.peak_active_power_kw * 100) : 1112}
                decimals={2}
                duration={1800}
                label=""
                className="cc-card-value"
              />
              <span className="cc-card-unit">kW</span>
            </div>
            <span className="cc-card-sub">instantaneous peak</span>
          </motion.div>

          {/* Anomalies */}
          <motion.div
            className="cc-card cc-card--warning"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.26, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">ANOMALIES</span>
              <span className="cc-card-badge cc-card-badge--warn">DETECTED</span>
            </div>
            <div className="cc-card-value-row">
              <AnimatedCounter end={anomalies.length || 82} duration={1600} label="" className="cc-card-value cc-card-value--warn" />
            </div>
            <span className="cc-card-sub">{'>'}2&sigma; deviations</span>
          </motion.div>

          {/* Peak Hour */}
          <motion.div
            className="cc-card"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.32, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">PEAK HOUR</span>
            </div>
            <div className="cc-card-value-row cc-card-value-row--text">
              <span className="cc-card-value-text">{peakMetric}</span>
            </div>
            <span className="cc-card-sub">highest avg consumption</span>
          </motion.div>

          {/* Weekend Premium */}
          <motion.div
            className="cc-card"
            initial={{ opacity: 0, y: 24 }}
            animate={gridInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.38, ease: EASE }}
          >
            <div className="cc-card-header">
              <span className="cc-card-label">WEEKEND</span>
            </div>
            <div className="cc-card-value-row cc-card-value-row--text">
              <span className="cc-card-value-text cc-card-value-text--blue">+{weekendPremium}%</span>
            </div>
            <span className="cc-card-sub">weekend premium</span>
          </motion.div>
        </div>
      </div>

      {/* Bottom Row: Hourly Mini + Fingerprint Preview */}
      <div className="cc-bottom-row">
        <motion.div
          className="cc-bottom-block"
          initial={{ opacity: 0, y: 20 }}
          animate={gridInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.4, ease: EASE }}
        >
          <div className="cc-bottom-header">
            <span className="cc-bottom-label">HOURLY SIGNATURE</span>
            <span className="cc-bottom-tag">24 HOURS</span>
          </div>
          <MiniHourly data={hourly} />
        </motion.div>

        <motion.div
          className="cc-bottom-block"
          initial={{ opacity: 0, y: 20 }}
          animate={gridInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.48, ease: EASE }}
        >
          <div className="cc-bottom-header">
            <span className="cc-bottom-label">ENERGY FINGERPRINT</span>
            <span className="cc-bottom-tag">7 x 24</span>
          </div>
          <FingerprintPreview data={fp} />
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="cc-scroll-cta"
        initial={{ opacity: 0 }}
        animate={introComplete ? { opacity: 0.4 } : { opacity: 0 }}
        transition={{ duration: 1, delay: introComplete ? 2 : 0 }}
      >
        <span className="cc-scroll-text">SCROLL TO EXPLORE</span>
        <motion.div
          className="cc-scroll-line"
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  );
}

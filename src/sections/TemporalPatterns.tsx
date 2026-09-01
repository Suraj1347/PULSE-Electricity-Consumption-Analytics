import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { loadHourlyProfile, loadWeeklyPattern, loadFingerprint } from '../data/dataLoader';
import type { HourlyProfilePoint, WeeklyPatternPoint, FingerprintRecord } from '../types/analytics';
import { useInView } from '../hooks/useInView';
import SectionReveal from '../components/SectionReveal/SectionReveal';
import HeatmapGrid from '../components/HeatmapGrid/HeatmapGrid';
import './TemporalPatterns.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const FP_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function HourlySection({ data }: { data: HourlyProfilePoint[] }) {
  const { ref, inView } = useInView(0.15);
  const maxVal = Math.max(...data.map(h => h.averageConsumption));
  const peakHour = data.reduce((max, h) => h.averageConsumption > max.averageConsumption ? h : max, data[0]);
  const troughHour = data.reduce((min, h) => h.averageConsumption < min.averageConsumption ? h : min, data[0]);
  const [hover, setHover] = useState<HourlyProfilePoint | null>(null);

  return (
    <div ref={ref} className="tp-section">
      <div className="tp-section-header">
        <div>
          <span className="tp-section-label">A. HOURLY PROFILE</span>
          <span className="tp-section-tag">24 BINS</span>
        </div>
        <div className="tp-peak-info">
          <span className="tp-peak-badge tp-peak-badge--high">
            PEAK {String(peakHour.hour).padStart(2, '0')}:00
          </span>
          <span className="tp-peak-badge tp-peak-badge--low">
            TROUGH {String(troughHour.hour).padStart(2, '0')}:00
          </span>
        </div>
      </div>

      <div className="tp-hourly-chart">
        {data.map((h, i) => {
          const pct = (h.averageConsumption / maxVal) * 100;
          const isPeak = h.hour === peakHour.hour;
          const isTrough = h.hour === troughHour.hour;
          return (
            <div
              key={h.hour}
              className="tp-bar-col"
              onMouseEnter={() => setHover(h)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="tp-bar-track">
                <motion.div
                  className={`tp-bar-fill ${isPeak ? 'tp-bar-fill--peak' : ''} ${isTrough ? 'tp-bar-fill--trough' : ''}`}
                  initial={{ height: 0 }}
                  animate={inView ? { height: `${pct}%` } : {}}
                  transition={{ duration: 0.5, delay: i * 0.03, ease: EASE }}
                />
              </div>
              <span className="tp-bar-h">{String(h.hour).padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>

      {hover && (
        <div className="tp-hover-info">
          <span className="tp-hover-label">{String(hover.hour).padStart(2, '0')}:00</span>
          <span className="tp-hover-value">{hover.averageConsumption.toFixed(2)} kW</span>
        </div>
      )}
    </div>
  );
}

function WeeklySection({ data }: { data: WeeklyPatternPoint[] }) {
  const { ref, inView } = useInView(0.15);
  const max = Math.max(...data.map(w => w.averageConsumption));
  const weekendDays = data.filter(d => d.day === 'Saturday' || d.day === 'Sunday');
  const weekdayDays = data.filter(d => d.day !== 'Saturday' && d.day !== 'Sunday');
  const weekendAvg = weekendDays.length > 0
    ? weekendDays.reduce((s, d) => s + d.averageConsumption, 0) / weekendDays.length : 0;
  const weekdayAvg = weekdayDays.length > 0
    ? weekdayDays.reduce((s, d) => s + d.averageConsumption, 0) / weekdayDays.length : 0;
  const premium = weekdayAvg > 0 ? Math.round(((weekendAvg - weekdayAvg) / weekdayAvg) * 100) : 0;

  return (
    <div ref={ref} className="tp-section">
      <div className="tp-section-header">
        <div>
          <span className="tp-section-label">B. WEEKLY PATTERN</span>
          <span className="tp-section-tag">7 DAYS</span>
        </div>
        <div className="tp-weekend-badge">
          <span className="tp-weekend-num">+{premium}%</span>
          <span className="tp-weekend-lbl">Weekend premium</span>
        </div>
      </div>

      <div className="tp-weekly-chart">
        {data.map((w, i) => {
          const pct = (w.averageConsumption / max) * 100;
          const isWknd = w.day === 'Saturday' || w.day === 'Sunday';
          return (
            <div key={w.day} className="tp-w-row">
              <span className="tp-w-day">{w.day.slice(0, 3)}</span>
              <div className="tp-w-track">
                <motion.div
                  className={`tp-w-fill ${isWknd ? 'tp-w-fill--wknd' : ''}`}
                  initial={{ width: 0 }}
                  animate={inView ? { width: `${pct}%` } : {}}
                  transition={{ duration: 0.6, delay: i * 0.06, ease: EASE }}
                />
              </div>
              <span className="tp-w-val">{w.averageConsumption.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FingerprintSection({ data }: { data: FingerprintRecord[] }) {
  return (
    <div className="tp-section">
      <div className="tp-section-header">
        <div>
          <span className="tp-section-label">C. ENERGY FINGERPRINT</span>
          <span className="tp-section-tag">7 x 24</span>
        </div>
      </div>
      <p className="tp-fp-explain">
        Each cell represents average power consumption for a specific day-of-week and hour-of-day combination.
        Brighter cells indicate higher consumption — revealing when this household uses the most energy.
      </p>
      <HeatmapGrid data={data.map(d => ({ day: d.day, hour: d.hour, value: d.avg_kw }))} dayLabels={FP_DAYS} />
    </div>
  );
}

export default function TemporalPatterns() {
  const [hourlyData, setHourlyData] = useState<HourlyProfilePoint[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyPatternPoint[]>([]);
  const [fpData, setFpData] = useState<FingerprintRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadHourlyProfile(), loadWeeklyPattern(), loadFingerprint()])
      .then(([h, w, f]) => { setHourlyData(h); setWeeklyData(w); setFpData(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="tp">
        <div className="tp-inner">
          <span className="pulse-section-num">02</span>
          <h2 className="pulse-section-title">TEMPORAL PATTERNS</h2>
          <div className="tp-loading">Loading Spark analytics...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="tp">
      <div className="tp-atmo" />
      <div className="tp-inner">
        <SectionReveal>
          <div className="tp-header">
            <div>
              <span className="pulse-section-num">02</span>
              <h2 className="pulse-section-title">TEMPORAL PATTERNS</h2>
            </div>
            <p className="tp-subtitle">When does this household use energy? Three views reveal the temporal signature — hourly, weekly, and the full 168-cell fingerprint.</p>
          </div>
        </SectionReveal>

        <div className="tp-columns">
          <SectionReveal delay={0.1} direction="left">
            <HourlySection data={hourlyData} />
          </SectionReveal>

          <SectionReveal delay={0.2} direction="right">
            <WeeklySection data={weeklyData} />
          </SectionReveal>
        </div>

        <SectionReveal delay={0.3}>
          <FingerprintSection data={fpData} />
        </SectionReveal>
      </div>
    </section>
  );
}

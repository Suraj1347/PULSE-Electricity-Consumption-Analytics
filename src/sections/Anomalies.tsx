import { useState, useEffect, useMemo } from 'react';
import { loadAnomalies } from '../data/dataLoader';
import type { AnomalyRecord } from '../types/analytics';
import SectionReveal from '../components/SectionReveal/SectionReveal';
import './Anomalies.css';

export default function Anomalies() {
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<AnomalyRecord | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadAnomalies()
      .then(setAnomalies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const warnings = anomalies.filter(a => a.severity === 'warning');
    const criticals = anomalies.filter(a => a.severity === 'critical');
    const maxVal = anomalies.length > 0 ? Math.max(...anomalies.map(a => a.value)) : 0;
    const minVal = anomalies.length > 0 ? Math.min(...anomalies.map(a => a.value)) : 0;
    return {
      warnings: warnings.length,
      criticals: criticals.length,
      total: anomalies.length,
      maxVal,
      minVal,
      topAnomalies: [...anomalies].sort((a, b) => b.value - a.value).slice(0, 8),
    };
  }, [anomalies]);

  if (loading) {
    return (
      <section className="anom">
        <div className="anom-inner">
          <SectionReveal>
            <span className="pulse-section-num">04</span>
            <h2 className="pulse-section-title">ANOMALY RADAR</h2>
          </SectionReveal>
          <div className="anom-loading">Loading Spark analytics...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="anom">
      <div className="anom-atmo" />
      <div className="anom-inner">
        <SectionReveal>
          <div className="anom-header">
            <div>
              <span className="pulse-section-num">04</span>
              <h2 className="pulse-section-title">ANOMALY RADAR</h2>
            </div>
            <p className="anom-subtitle">Statistically detected deviations from the rolling baseline — {stats.total} days that break the pattern.</p>
          </div>
        </SectionReveal>

        {/* Stats Cards */}
        <SectionReveal delay={0.1}>
          <div className="anom-stats">
            <div className="anom-stat anom-stat--total">
              <span className="anom-stat-num">{stats.total}</span>
              <span className="anom-stat-lbl">TOTAL ANOMALIES</span>
              <span className="anom-stat-desc">detected across 1,442 days</span>
            </div>
            <div className="anom-stat anom-stat--warn">
              <span className="anom-stat-num">{stats.warnings}</span>
              <span className="anom-stat-lbl">WARNING</span>
              <span className="anom-stat-desc">{'>'} 2&sigma; deviation</span>
            </div>
            <div className="anom-stat anom-stat--crit">
              <span className="anom-stat-num">{stats.criticals}</span>
              <span className="anom-stat-lbl">CRITICAL</span>
              <span className="anom-stat-desc">{'>'} 3&sigma; deviation</span>
            </div>
          </div>
        </SectionReveal>

        {/* Method Badge */}
        <SectionReveal delay={0.15}>
          <div className="anom-method">
            <span className="anom-method-tag">ROLLING 30-DAY BASELINE</span>
            <span className="anom-method-sep">/</span>
            <span className="anom-method-text">Statistical anomaly detection via rolling window standard deviation</span>
          </div>
        </SectionReveal>

        {/* Timeline */}
        <SectionReveal delay={0.2}>
          <div className="anom-timeline-block">
            <div className="anom-timeline-label-row">
              <span className="anom-timeline-section-label">TIMELINE</span>
              <span className="anom-timeline-section-tag">{anomalies[0]?.date} — {anomalies[anomalies.length - 1]?.date}</span>
            </div>
            <div className="anom-timeline">
              <div className="anom-timeline-track">
                {anomalies.map((a, i) => {
                  const left = `${(i / (anomalies.length - 1)) * 100}%`;
                  const isCrit = a.severity === 'critical';
                  const normHeight = 12 + ((a.value - stats.minVal) / (stats.maxVal - stats.minVal || 1)) * 32;
                  return (
                    <div
                      key={a.date}
                      className={`anom-dot ${isCrit ? 'anom-dot--crit' : ''}`}
                      style={{ left, height: normHeight }}
                      onMouseEnter={(e) => { setSel(a); setMousePos({ x: e.clientX, y: e.clientY }); }}
                      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setSel(null)}
                    />
                  );
                })}
              </div>
              <div className="anom-timeline-labels">
                <span>{anomalies[0]?.date}</span>
                <span>{anomalies[Math.floor(anomalies.length / 2)]?.date}</span>
                <span>{anomalies[anomalies.length - 1]?.date}</span>
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* Top Anomalies Panel */}
        <SectionReveal delay={0.3}>
          <div className="anom-top-block">
            <div className="anom-top-header">
              <span className="anom-top-label">TOP ANOMALIES</span>
              <span className="anom-top-tag">MOST EXTREME</span>
            </div>
            <div className="anom-top-list">
              {stats.topAnomalies.map((a, i) => {
                const isCrit = a.severity === 'critical';
                const deviation = a.value - ((a.expected_min + a.expected_max) / 2);
                return (
                  <div
                    key={a.date}
                    className={`anom-top-item ${isCrit ? 'anom-top-item--crit' : ''}`}
                    onMouseEnter={(e) => { setSel(a); setMousePos({ x: e.clientX, y: e.clientY }); }}
                    onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setSel(null)}
                  >
                    <div className="anom-top-rank">
                      <span className="anom-top-rank-num">{i + 1}</span>
                    </div>
                    <div className="anom-top-info">
                      <span className="anom-top-date">{a.date}</span>
                      <span className="anom-top-range">
                        expected {a.expected_min.toFixed(1)}–{a.expected_max.toFixed(1)} kWh
                      </span>
                    </div>
                    <div className="anom-top-right">
                      <span className={`anom-top-value ${isCrit ? 'anom-top-value--crit' : 'anom-top-value--warn'}`}>
                        {a.value.toFixed(2)} kWh
                      </span>
                      <span className="anom-top-deviation">
                        {deviation > 0 ? '+' : ''}{deviation.toFixed(2)} from baseline
                      </span>
                    </div>
                    <span className={`anom-top-severity ${isCrit ? 'anom-top-severity--crit' : ''}`}>
                      {a.severity.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </SectionReveal>

        {/* Tooltip */}
        {sel && (
          <div
            className="anom-tooltip"
            style={{
              position: 'fixed',
              left: mousePos.x + 16,
              top: mousePos.y - 60,
            }}
          >
            <span className="anom-tooltip-date">{sel.date}</span>
            <span className="anom-tooltip-value" style={{ color: sel.severity === 'critical' ? 'var(--red)' : 'var(--amber)' }}>
              {sel.value.toFixed(2)} kWh
            </span>
            <span className="anom-tooltip-range">
              baseline: {sel.expected_min.toFixed(1)}–{sel.expected_max.toFixed(1)}
            </span>
            <span className="anom-tooltip-sev">{sel.severity.toUpperCase()}</span>
          </div>
        )}
      </div>
    </section>
  );
}

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { loadDailyConsumption, loadAnomalies, loadSummary } from '../data/dataLoader';
import type { DailyConsumptionPoint, AnomalyRecord, SparkSummary } from '../types/analytics';
import SectionReveal from '../components/SectionReveal/SectionReveal';
import AnimatedCounter from '../components/AnimatedCounter/AnimatedCounter';
import './DailySignal.css';

interface TipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: DailyConsumptionPoint }>;
}

function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="ds-tip">
      <span className="ds-tip-date">{d.date}</span>
      <span className="ds-tip-val">{payload[0].value.toFixed(2)} <em>kWh</em></span>
    </div>
  );
}

export default function DailySignal() {
  const [data, setData] = useState<DailyConsumptionPoint[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [summary, setSummary] = useState<SparkSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadDailyConsumption(), loadAnomalies(), loadSummary()])
      .then(([d, a, s]) => { setData(d); setAnomalies(a); setSummary(s); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const anomalyDates = new Set(anomalies.map(a => a.date));
  const avgPower = summary?.avg_active_power_kw ?? 1.09;
  const peakDay = data.length > 0 ? data.reduce((max, d) => d.consumption > max.consumption ? d : max, data[0]) : null;
  const warningCount = anomalies.filter(a => a.severity === 'warning').length;
  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;

  if (loading) {
    return (
      <section className="ds">
        <div className="ds-inner">
          <SectionReveal>
            <span className="pulse-section-num">01</span>
            <h2 className="pulse-section-title">DAILY SIGNAL</h2>
          </SectionReveal>
          <div className="ds-loading">Loading Spark analytics...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="ds">
      <div className="ds-atmo" />
      <div className="ds-inner">
        <SectionReveal>
          <div className="ds-header">
            <div>
              <span className="pulse-section-num">01</span>
              <h2 className="pulse-section-title">DAILY SIGNAL</h2>
            </div>
            <p className="ds-subtitle">The aggregate power signature across {data.length.toLocaleString()} days reveals the rhythm of human habit.</p>
          </div>
        </SectionReveal>

        {/* Stats Row */}
        <SectionReveal delay={0.15}>
          <div className="ds-stats">
            <div className="ds-stat">
              <AnimatedCounter end={data.length} duration={1800} label="DAYS" className="ds-stat-num" />
            </div>
            <div className="ds-stat">
              <AnimatedCounter end={warningCount} duration={1400} label="WARNINGS" className="ds-stat-num ds-stat-num--warn" />
            </div>
            <div className="ds-stat">
              <AnimatedCounter end={criticalCount} duration={1400} label="CRITICAL" className="ds-stat-num ds-stat-num--crit" />
            </div>
            {peakDay && (
              <div className="ds-stat ds-stat--highlight">
                <span className="ds-stat-date">{peakDay.date}</span>
                <span className="ds-stat-label">PEAK DAY</span>
              </div>
            )}
          </div>
        </SectionReveal>

        {/* Main Chart */}
        <SectionReveal delay={0.25}>
          <div className="ds-chart-wrap">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.12} />
                    <stop offset="40%" stopColor="#00d4aa" stopOpacity={0.04} />
                    <stop offset="100%" stopColor="#00d4aa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                  interval={Math.floor(data.length / 6)}
                  tickFormatter={(v: string) => v.split('-')[0]}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                  width={40}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip content={<Tip />} />
                <ReferenceLine
                  y={avgPower}
                  stroke="rgba(74,158,255,0.25)"
                  strokeDasharray="4 4"
                  label={{ value: 'AVG', position: 'right', style: { fill: 'rgba(74,158,255,0.4)', fontSize: 9, fontFamily: 'var(--mono)' } }}
                />
                {peakDay && (
                  <ReferenceDot
                    x={peakDay.date}
                    y={peakDay.consumption}
                    r={5}
                    fill="var(--accent)"
                    stroke="var(--bg)"
                    strokeWidth={2}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="consumption"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  fill="url(#dsGrad)"
                  animationDuration={2400}
                  animationEasing="ease-out"
                  dot={(p: Record<string, unknown>) => {
                    const cx = p.cx as number | undefined;
                    const cy = p.cy as number | undefined;
                    const pl = p.payload as DailyConsumptionPoint | undefined;
                    if (cx !== undefined && cy !== undefined && pl && anomalyDates.has(pl.date)) {
                      const isCrit = anomalies.find(a => a.date === pl.date)?.severity === 'critical';
                      return (
                        <g key={pl.date}>
                          <circle cx={cx} cy={cy} r={4} fill={isCrit ? 'var(--red)' : 'var(--amber)'} opacity={0.15} />
                          <circle cx={cx} cy={cy} r={2} fill={isCrit ? 'var(--red)' : 'var(--amber)'} opacity={0.9} />
                        </g>
                      );
                    }
                    return null;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionReveal>

        {/* Legend */}
        <SectionReveal delay={0.35}>
          <div className="ds-legend">
            <span className="ds-leg-item"><i className="ds-leg-line" /> Daily signal</span>
            <span className="ds-leg-item"><i className="ds-leg-dash" /> Rolling average</span>
            <span className="ds-leg-item"><i className="ds-leg-dot ds-leg-dot--warn" /> Warning</span>
            <span className="ds-leg-item"><i className="ds-leg-dot ds-leg-dot--crit" /> Critical</span>
          </div>
        </SectionReveal>
      </div>
    </section>
  );
}

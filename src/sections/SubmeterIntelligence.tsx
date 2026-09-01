import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { loadSummary, loadSubMeterData } from '../data/dataLoader';
import type { SparkSummary, SubMeterData } from '../types/analytics';
import SectionReveal from '../components/SectionReveal/SectionReveal';
import './SubmeterIntelligence.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface TipProps {
  active?: boolean;
  payload?: Array<{ payload: SubMeterData }>;
}

function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="si-tip">
      <span className="si-tip-cat">{d.label}</span>
      <span className="si-tip-val">{d.value.toLocaleString()} Wh</span>
    </div>
  );
}

export default function SubmeterIntelligence() {
  const [summary, setSummary] = useState<SparkSummary | null>(null);
  const [subData, setSubData] = useState<SubMeterData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadSummary(), loadSubMeterData()])
      .then(([s, d]) => { setSummary(s); setSubData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalKwh = summary?.total_energy_kwh ?? 37284;
  const meteredWh = subData.reduce((s, d) => s + d.value, 0);
  const meteredKwh = meteredWh / 1000;
  const unmeteredKwh = totalKwh - meteredKwh;

  const chartData = [
    ...subData.map(d => ({
      name: d.label,
      value: d.value,
      color: d.color,
      category: d.category,
    })),
    {
      name: 'Unmetered',
      value: Math.max(0, unmeteredKwh * 1000),
      color: '#374151',
      category: 'unmetered',
    },
  ];

  const categories = [
    { key: 'kitchen', label: 'Kitchen', icon: '01', color: 'var(--accent)' },
    { key: 'laundry', label: 'Laundry', icon: '02', color: 'var(--blue)' },
    { key: 'water_ac', label: 'Water Heater + AC', icon: '03', color: 'var(--amber)' },
    { key: 'unmetered', label: 'Unmetered', icon: '--', color: '#374151' },
  ];

  if (loading) {
    return (
      <section className="si">
        <div className="si-inner">
          <SectionReveal>
            <span className="pulse-section-num">03</span>
            <h2 className="pulse-section-title">SUBMETER INTELLIGENCE</h2>
          </SectionReveal>
          <div className="si-loading">Loading Spark analytics...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="si">
      <div className="si-atmo" />
      <div className="si-inner">
        <SectionReveal>
          <div className="si-header">
            <div>
              <span className="pulse-section-num">03</span>
              <h2 className="pulse-section-title">SUBMETER INTELLIGENCE</h2>
            </div>
            <p className="si-subtitle">Three independent meters decompose total consumption into functional components — revealing where energy actually goes.</p>
          </div>
        </SectionReveal>

        <div className="si-layout">
          {/* Donut chart */}
          <SectionReveal delay={0.15}>
            <div className="si-chart-block">
              <div className="si-donut-wrap">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={90}
                      outerRadius={140}
                      dataKey="value"
                      animationDuration={1800}
                      animationEasing="ease-out"
                      strokeWidth={0}
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} opacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center label */}
                <div className="si-donut-center">
                  <span className="si-donut-total">{Math.round(totalKwh).toLocaleString()}</span>
                  <span className="si-donut-unit">kWh TOTAL</span>
                </div>
              </div>
            </div>
          </SectionReveal>

          {/* Category cards */}
          <SectionReveal delay={0.25}>
            <div className="si-cards">
              {categories.map((cat, i) => {
                const dataItem = subData.find(d => d.category === cat.key);
                const kwh = cat.key === 'unmetered' ? unmeteredKwh : (dataItem ? dataItem.value / 1000 : 0);
                const pct = totalKwh > 0 ? (kwh / totalKwh) * 100 : 0;

                return (
                  <motion.div
                    key={cat.key}
                    className="si-card"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 + i * 0.1, ease: EASE }}
                  >
                    <div className="si-card-left">
                      <span className="si-card-icon" style={{ color: cat.color }}>{cat.icon}</span>
                      <div className="si-card-info">
                        <span className="si-card-label">{cat.label}</span>
                        <div className="si-card-bar-track">
                          <motion.div
                            className="si-card-bar-fill"
                            style={{ background: cat.color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: 0.5 + i * 0.1, ease: EASE }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="si-card-right">
                      <span className="si-card-kwh">{kwh > 0 ? kwh.toFixed(0) : '--'}</span>
                      <span className="si-card-pct">{pct > 0 ? `${pct.toFixed(0)}%` : '--'}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}

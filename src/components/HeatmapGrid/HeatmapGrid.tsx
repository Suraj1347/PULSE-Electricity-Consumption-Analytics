import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useInView } from '../../hooks/useInView';
import './HeatmapGrid.css';

interface Cell {
  day: string;
  hour: number;
  value: number;
}

interface Props {
  data: Cell[];
  dayLabels: string[];
}

function getIntensity(val: number, max: number): number {
  if (max === 0) return 0;
  return val / max;
}

function getCellColor(intensity: number): string {
  if (intensity < 0.1) return 'rgba(0, 212, 170, 0.04)';
  if (intensity < 0.25) return 'rgba(0, 212, 170, 0.1)';
  if (intensity < 0.45) return 'rgba(0, 212, 170, 0.2)';
  if (intensity < 0.65) return 'rgba(0, 212, 170, 0.35)';
  if (intensity < 0.8) return 'rgba(0, 212, 170, 0.55)';
  return 'rgba(0, 212, 170, 0.78)';
}

export default function HeatmapGrid({ data, dayLabels }: Props) {
  const { ref, inView } = useInView(0.1);
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const maxVal = useMemo(() => Math.max(...data.map(d => d.value)), [data]);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div ref={ref} className="fp-heatmap-container">
      <div className="fp-heatmap">
        <div className="fp-hour-labels">
          <span />
          {hours.map(h => (
            <span key={h} className="fp-hour-lbl">{h === 0 ? '00' : String(h).padStart(2, '0')}</span>
          ))}
        </div>

        {dayLabels.map((day, dayIdx) => (
          <div key={day} className="fp-row">
            <span className="fp-day-lbl">{day.slice(0, 3)}</span>
            {hours.map(h => {
              const cell = data.find(d => d.day === day && d.hour === h);
              const val = cell?.value ?? 0;
              const intensity = getIntensity(val, maxVal);
              const globalIdx = dayIdx * 24 + h;
              return (
                <motion.div
                  key={h}
                  className="fp-cell"
                  style={{ backgroundColor: getCellColor(intensity) }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={inView ? { opacity: 1, scale: 1 } : {}}
                  transition={{
                    duration: 0.4,
                    delay: globalIdx * 0.008,
                    ease: 'easeOut',
                  }}
                  onMouseEnter={(e) => {
                    setHoveredCell({ day, hour: h, value: val });
                    setMousePos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHoveredCell(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="fp-scale">
        <span className="fp-scale-lbl">Low</span>
        <div className="fp-scale-bar">
          {[0.04, 0.1, 0.2, 0.35, 0.55, 0.78].map((op, i) => (
            <div key={i} className="fp-scale-c" style={{ background: `rgba(0, 212, 170, ${op})` }} />
          ))}
        </div>
        <span className="fp-scale-lbl">High</span>
        <span className="fp-scale-val">{maxVal.toFixed(1)} kW</span>
      </div>

      {hoveredCell && (
        <div
          className="fp-tooltip"
          style={{
            position: 'fixed',
            left: mousePos.x + 16,
            top: mousePos.y - 48,
            transform: 'none',
          }}
        >
          <span>{hoveredCell.day} {String(hoveredCell.hour).padStart(2, '0')}:00</span>
          <span className="fp-tooltip-v">{hoveredCell.value.toFixed(2)} kW</span>
        </div>
      )}
    </div>
  );
}

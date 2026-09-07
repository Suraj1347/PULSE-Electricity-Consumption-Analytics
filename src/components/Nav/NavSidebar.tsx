import { useState, useEffect, useCallback } from 'react';

interface NavItem {
  id: string;
  label: string;
  num: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'command-center', label: 'Command Center', num: '01' },
  { id: 'daily-signal', label: 'Daily Signal', num: '02' },
  { id: 'temporal', label: 'Temporal Patterns', num: '03' },
  { id: 'anomalies', label: 'Anomaly Radar', num: '04' },
  { id: 'submeter', label: 'Submeter', num: '05' },
  { id: 'engine', label: 'Data Engine', num: '06' },
  { id: 'live-stream', label: 'Live Stream', num: '07' },
  { id: 'closing', label: 'Closing', num: '08' },
];

export default function NavSidebar() {
  const [active, setActive] = useState('command-center');

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActive(id);
          }
        },
        { threshold: 0.3, rootMargin: '-80px 0px -40% 0px' }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <nav className="nav-sidebar" aria-label="Main navigation">
      <div className="nav-logo">
        <span className="nav-logo-text">PULSE</span>
        <span className="nav-logo-tag">ENERGY INTELLIGENCE</span>
      </div>

      <div className="nav-items">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? 'nav-item--active' : ''}`}
            onClick={() => handleClick(item.id)}
            aria-current={active === item.id ? 'true' : undefined}
          >
            <span className="nav-item-num">{item.num}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="nav-footer">
        <span className="nav-footer-text">PySpark 4.2.0 / HDFS</span>
      </div>
    </nav>
  );
}

export { NAV_ITEMS };

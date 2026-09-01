import { useState, useEffect, useCallback } from 'react';
import { NAV_ITEMS } from './NavSidebar';

const ICONS: Record<string, string> = {
  'command-center': '\u25C9',
  'daily-signal': '\u223F',
  'temporal': '\u2237',
  'anomalies': '\u26A0',
  'submeter': '\u25C8',
  'engine': '\u2699',
  'closing': '\u2606',
};

export default function NavBottom() {
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
        { threshold: 0.3, rootMargin: '-60px 0px -40% 0px' }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <nav className="nav-bottom" aria-label="Mobile navigation">
      <div className="nav-bottom-items">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-bottom-item ${active === item.id ? 'nav-bottom-item--active' : ''}`}
            onClick={() => handleClick(item.id)}
            aria-label={item.label}
            aria-current={active === item.id ? 'true' : undefined}
          >
            <span className="nav-bottom-icon">{ICONS[item.id] || item.num}</span>
            <span>{item.num}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

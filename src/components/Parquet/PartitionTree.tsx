import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ParquetPartition, ParquetYearSummary } from '../../types/parquet';
import { formatBytes, monthName } from './format';

interface PartitionTreeProps {
  years: ParquetYearSummary[];
  selectedKey: string | null;
  onSelect: (partition: ParquetPartition | null) => void;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function PartitionTree({
  years,
  selectedKey,
  onSelect,
}: PartitionTreeProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setExpandedYears(previous => {
      const availableYears = new Set(years.map(year => year.year));
      const stillValid = new Set([...previous].filter(year => availableYears.has(year)));
      if (stillValid.size > 0) return stillValid;
      if (years.length === 0) return new Set();

      const selectedYear = selectedKey ? Number(selectedKey.split('-')[0]) : null;
      const preferred =
        selectedYear != null && availableYears.has(selectedYear)
          ? selectedYear
          : years[years.length - 1].year;
      return new Set([preferred]);
    });
  }, [years, selectedKey]);

  useEffect(() => {
    if (!selectedKey) return;
    const year = Number(selectedKey.split('-')[0]);
    setExpandedYears(previous => {
      if (previous.has(year)) return previous;
      const next = new Set(previous);
      next.add(year);
      return next;
    });
  }, [selectedKey]);

  const toggleYear = (year: number) => {
    setExpandedYears(previous => {
      const next = new Set(previous);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const totalPartitions = years.reduce((sum, year) => sum + year.partitionCount, 0);
  const totalSize = years.reduce((sum, year) => sum + year.sizeBytes, 0);

  return (
    <aside className="pq-panel pq-tree" aria-label="Parquet partition explorer">
      <div className="pq-panel-header">
        <span className="pq-panel-label">PARTITION HIERARCHY</span>
        <span className="pq-panel-tag">
          {years.length} YEARS / {totalPartitions} MONTHS
        </span>
      </div>

      <button
        type="button"
        className={`pq-tree-root ${selectedKey === null ? 'pq-tree-root--selected' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="pq-tree-root-icon" aria-hidden="true">
          ▦
        </span>
        <span className="pq-tree-root-text">
          <span className="pq-tree-root-name">Parquet Dataset</span>
          <span className="pq-tree-root-path">year=YYYY / month=MM</span>
        </span>
        <span className="pq-tree-root-meta">{formatBytes(totalSize)}</span>
      </button>

      {years.length === 0 ? (
        <div className="pq-tree-empty">No actual partitions are available.</div>
      ) : (
        <div className="pq-tree-years">
          {years.map(year => {
            const open = expandedYears.has(year.year);
            return (
              <div className="pq-year" key={year.year}>
                <button
                  type="button"
                  className="pq-year-btn"
                  onClick={() => toggleYear(year.year)}
                  aria-expanded={open}
                  aria-label={`${year.year}: ${year.partitionCount} month partitions`}
                >
                  <span className={`pq-chevron ${open ? 'pq-chevron--open' : ''}`} aria-hidden="true">
                    ›
                  </span>
                  <span className="pq-year-num">{year.year}</span>
                  <span className="pq-year-meta">
                    {year.partitionCount} {year.partitionCount === 1 ? 'month' : 'months'}
                    <span className="pq-year-size"> · {formatBytes(year.sizeBytes)}</span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      className="pq-months"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: EASE }}
                    >
                      {year.months.map(partition => {
                        const key = `${partition.year}-${partition.month}`;
                        const selected = selectedKey === key;
                        return (
                          <button
                            type="button"
                            key={key}
                            className={`pq-month ${selected ? 'pq-month--selected' : ''}`}
                            onClick={() => onSelect(partition)}
                            aria-pressed={selected}
                          >
                            <span className="pq-month-dot" aria-hidden="true" />
                            <span className="pq-month-name">{monthName(partition.month)}</span>
                            <span className="pq-month-meta">
                              {partition.fileCount} {partition.fileCount === 1 ? 'file' : 'files'}
                              <span className="pq-month-size"> · {formatBytes(partition.sizeBytes)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <div className="pq-tree-note">
        Only partitions present in the live HDFS listing or the last Spark manifest are shown.
      </div>
    </aside>
  );
}

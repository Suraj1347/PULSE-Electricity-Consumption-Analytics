import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ParquetMetadata } from '../../types/parquet';
import PartitionStorageChart from './PartitionStorageChart';
import { formatBytes, formatCount } from './format';

interface StorageChartsProps {
  metadata: ParquetMetadata;
}

const TOOLTIP_STYLE = {
  background: 'var(--surface-solid)',
  border: '1px solid var(--surface-border)',
  borderRadius: 8,
  fontSize: 11,
};

export default function StorageCharts({ metadata }: StorageChartsProps) {
  const storageData = metadata.years.map(year => ({
    year: String(year.year),
    sizeMB: Number((year.sizeBytes / (1024 * 1024)).toFixed(3)),
    sizeLabel: formatBytes(year.sizeBytes),
    files: year.fileCount,
    partitions: year.partitionCount,
    rows: year.rowCount,
  }));

  const countData = metadata.years.map(year => ({
    year: String(year.year),
    partitions: year.partitionCount,
    files: year.fileCount,
  }));

  if (storageData.length === 0) {
    return (
      <div className="pq-panel pq-chart-empty">
        No year-level metadata is available to chart.
      </div>
    );
  }

  return (
    <div className="pq-charts">
      <section className="pq-panel pq-chart">
        <div className="pq-chart-header">
          <span className="pq-chart-label">STORAGE DISTRIBUTION BY YEAR</span>
          <span className="pq-chart-tag">HDFS BYTES</span>
        </div>
        <div className="pq-chart-canvas">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={storageData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.035)" />
              <XAxis dataKey="year" axisLine={false} tickLine={false} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={value => (Number(value) >= 100 ? `${Math.round(Number(value))}` : `${Number(value).toFixed(1)}`)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.025)' }}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={label => `Year ${label}`}
                formatter={value => [`${Number(value).toFixed(2)} MB`, 'Parquet storage']}
              />
              <Bar dataKey="sizeMB" fill="var(--accent)" opacity={0.78} radius={[3, 3, 0, 0]} maxBarSize={54} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="pq-chart-foot">
          <span>{formatBytes(metadata.totalSizeBytes)} total</span>
          <span>{metadata.totalFiles} files across {metadata.years.length} years</span>
        </div>
      </section>

      <section className="pq-panel pq-chart">
        <div className="pq-chart-header">
          <span className="pq-chart-label">PARTITION COUNT BY YEAR</span>
          <span className="pq-chart-tag">YEAR × MONTH</span>
        </div>
        <div className="pq-chart-canvas">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={countData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.035)" />
              <XAxis dataKey="year" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.025)' }}
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={label => `Year ${label}`}
                formatter={(value) => [formatCount(Number(value)), 'partitions']}
              />
              <Bar dataKey="partitions" fill="var(--blue)" opacity={0.72} radius={[3, 3, 0, 0]} maxBarSize={54} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="pq-chart-foot">
          <span>{formatCount(metadata.totalPartitions)} partitions</span>
          <span>{formatCount(metadata.totalFiles)} Parquet files</span>
        </div>
      </section>

      <PartitionStorageChart metadata={metadata} />
    </div>
  );
}

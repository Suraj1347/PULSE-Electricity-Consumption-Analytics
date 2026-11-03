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
import { formatBytes, formatCount } from './format';

interface PartitionStorageChartProps {
  metadata: ParquetMetadata;
}

const TOOLTIP_STYLE = {
  background: 'var(--surface-solid)',
  border: '1px solid var(--surface-border)',
  borderRadius: 8,
  fontSize: 11,
};

/**
 * One bar per real year=YYYY/month=MM HDFS directory. Unlike the year-level
 * charts above, this exposes the actual storage distribution across the
 * physical partitions returned by the live HDFS listing.
 */
export default function PartitionStorageChart({ metadata }: PartitionStorageChartProps) {
  if (metadata.partitions.length === 0) return null;

  const data = metadata.partitions.map(partition => ({
    label: `${partition.year}-${partition.month}`,
    sizeMB: Number((partition.sizeBytes / (1024 * 1024)).toFixed(3)),
  }));

  // With ~48 real partitions, showing every x-axis label would overlap.
  // Keep roughly a dozen ticks while preserving the full label in the tooltip.
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <section className="pq-panel pq-chart pq-chart--wide">
      <div className="pq-chart-header">
        <span className="pq-chart-label">PARTITION STORAGE · YEAR × MONTH</span>
        <span className="pq-chart-tag">ONE BAR PER HDFS DIRECTORY</span>
      </div>
      <div className="pq-chart-canvas">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.035)" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              interval={tickInterval}
              tickFormatter={value => String(value).slice(2)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={value =>
                Number(value) >= 100
                  ? `${Math.round(Number(value))}`
                  : `${Number(value).toFixed(1)}`
              }
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.025)' }}
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={label => `Partition ${String(label)}`}
              formatter={value => [`${Number(value).toFixed(2)} MB`, 'Parquet storage']}
            />
            <Bar
              dataKey="sizeMB"
              fill="var(--blue)"
              opacity={0.72}
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="pq-chart-foot">
        <span>
          {formatCount(metadata.totalPartitions)} partitions · actual HDFS directory sizes
        </span>
        <span>
          {formatBytes(metadata.totalSizeBytes)} across {formatCount(metadata.totalFiles)} files
        </span>
      </div>
    </section>
  );
}

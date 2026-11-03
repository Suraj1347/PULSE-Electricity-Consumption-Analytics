import type { ParquetMetadata } from '../../types/parquet';
import { formatBytes, formatCount, formatDateTime } from './format';

interface StorageSummaryProps {
  metadata: ParquetMetadata | null;
  loading: boolean;
}

interface SummaryCard {
  label: string;
  value: string;
  sub: string;
  tone: 'accent' | 'blue' | 'amber';
}

export default function StorageSummary({ metadata, loading }: StorageSummaryProps) {
  if (loading) {
    return (
      <div className="pq-summary" aria-label="Loading Parquet storage summary">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="pq-card pq-card--skeleton skeleton" key={index} />
        ))}
      </div>
    );
  }

  const dataset = metadata?.available ? metadata : null;
  const available = dataset !== null;
  const years = dataset?.years ?? [];
  const distinctMonths = new Set((dataset?.partitions ?? []).map(partition => partition.month));
  const yearRange =
    years.length > 0
      ? years.length === 1
        ? String(years[0].year)
        : `${years[0].year} — ${years[years.length - 1].year}`
      : 'No years available';
  const compression = dataset?.compression
    ? dataset.compression.toUpperCase()
    : 'Not recorded';

  const cards: SummaryCard[] = [
    {
      label: 'TOTAL PARQUET STORAGE',
      value: dataset ? formatBytes(dataset.totalSizeBytes) : '—',
      sub: dataset
        ? dataset.compression
          ? `${compression} compressed${dataset.compressionVerified ? ' · footer verified' : ' · writer config'}`
          : 'Compression not recorded for these files'
        : 'No dataset generated',
      tone: 'accent',
    },
    {
      label: 'YEAR × MONTH PARTITIONS',
      value: dataset ? formatCount(dataset.totalPartitions) : '—',
      sub: dataset ? 'actual HDFS partition directories' : 'Nothing to inspect yet',
      tone: 'blue',
    },
    {
      label: 'PARQUET FILES',
      value: dataset ? formatCount(dataset.totalFiles) : '—',
      sub: dataset ? 'part-*.snappy.parquet files' : 'No files present',
      tone: 'blue',
    },
    {
      label: 'AVAILABLE YEARS',
      value: dataset ? formatCount(years.length) : '—',
      sub: dataset ? yearRange : 'No years recorded',
      tone: 'accent',
    },
    {
      label: 'AVAILABLE MONTHS',
      value: dataset ? formatCount(distinctMonths.size) : '—',
      sub: dataset
        ? `distinct calendar months · ${formatCount(dataset.totalPartitions)} year-month combos`
        : 'No months recorded',
      tone: 'amber',
    },
    {
      label: 'LAST GENERATION',
      value: metadata?.generatedAt ? formatDateTime(metadata.generatedAt) : '—',
      sub: metadata?.generatedAt
        ? metadata.jobId
          ? `Spark job ${metadata.jobId}`
          : 'Recorded in Spark manifest'
        : available
          ? 'Files found, no manifest timestamp'
          : 'Not generated',
      tone: 'amber',
    },
  ];

  return (
    <div className="pq-summary" aria-label="Parquet storage summary">
      {cards.map(card => (
        <article className={`pq-card pq-card--${card.tone}`} key={card.label}>
          <span className="pq-card-label">{card.label}</span>
          <span className="pq-card-value">{card.value}</span>
          <span className="pq-card-sub">{card.sub}</span>
        </article>
      ))}
    </div>
  );
}

import type {
  ParquetMetadata,
  ParquetPartition,
  ParquetPreviewResponse,
} from '../../types/parquet';
import {
  formatBytes,
  formatCount,
  formatDateTime,
  monthName,
  previewValue,
  rowCountLabel,
} from './format';

interface PartitionDetailsProps {
  metadata: ParquetMetadata;
  partition: ParquetPartition | null;
  preview: ParquetPreviewResponse | null;
  previewLoading: boolean;
  previewError: string | null;
  onSelectDataset: () => void;
}

function DatasetOverview({ metadata }: { metadata: ParquetMetadata }) {
  const partitionColumns = metadata.partitionColumns.join(', ');

  return (
    <div className="pq-panel pq-details">
      <div className="pq-panel-header">
        <span className="pq-panel-label">DATASET DETAILS</span>
        <span className="pq-panel-tag">APACHE PARQUET</span>
      </div>

      <div className="pq-overview">
        <span className="pq-section-kicker">COLUMNAR STORAGE ON HDFS</span>
        <h3 className="pq-details-title">Partitioned Parquet dataset</h3>
        <p className="pq-details-copy">
          The physical files were written by Apache Spark. This view reads the live HDFS listing
          when available and falls back to the last Spark manifest when HDFS is offline. Select a
          year and a month to inspect its actual files, schema and Spark-sampled records.
        </p>

        <div className="pq-overview-path">
          <span className="pq-overview-path-label">DATASET PATH</span>
          <code className="pq-code">{metadata.datasetPath}</code>
        </div>

        <div className="pq-overview-metrics">
          <div className="pq-overview-metric">
            <span className="pq-metric-label">PARTITIONS</span>
            <span className="pq-metric-value">{formatCount(metadata.totalPartitions)}</span>
            <span className="pq-metric-sub">{partitionColumns}</span>
          </div>
          <div className="pq-overview-metric">
            <span className="pq-metric-label">PARQUET FILES</span>
            <span className="pq-metric-value">{formatCount(metadata.totalFiles)}</span>
            <span className="pq-metric-sub">actual HDFS objects</span>
          </div>
          <div className="pq-overview-metric">
            <span className="pq-metric-label">DATASET SIZE</span>
            <span className="pq-metric-value">{formatBytes(metadata.totalSizeBytes)}</span>
            <span className="pq-metric-sub">
              {metadata.compression ? `${metadata.compression.toUpperCase()} compressed` : 'compression not recorded'}
            </span>
          </div>
          <div className="pq-overview-metric">
            <span className="pq-metric-label">ROWS</span>
            <span className="pq-metric-value">
              {metadata.totalRows != null ? formatCount(metadata.totalRows) : 'Unavailable'}
            </span>
            <span className="pq-metric-sub">
              {rowCountLabel(metadata.rowCountType)} · recorded at generation
            </span>
          </div>
        </div>

        <div className="pq-overview-grid">
          <div>
            <span className="pq-metric-label">SCHEMA FIELDS</span>
            <span className="pq-overview-schema-count">
              {metadata.schema.length > 0 ? `${metadata.schema.length} columns captured` : 'Schema unavailable'}
            </span>
            {metadata.schema.length > 0 && (
              <span className="pq-overview-schema-more">
                {metadata.schema.slice(0, 5).map(field => field.name).join(' · ')}
                {metadata.schema.length > 5 ? ' · …' : ''}
              </span>
            )}
          </div>
          <div>
            <span className="pq-metric-label">INSPECTION SOURCE</span>
            <span className={`pq-source-pill pq-source-pill--${metadata.source}`}>
              {metadata.source === 'hdfs'
                ? 'LIVE HDFS LISTING'
                : metadata.source === 'manifest'
                  ? 'LAST SPARK MANIFEST'
                  : 'UNAVAILABLE'}
            </span>
            <span className="pq-overview-schema-more">
              Inspected {formatDateTime(metadata.inspectedAt)}
            </span>
          </div>
        </div>

        <div className="pq-overview-hint">
          <span className="pq-overview-hint-mark" aria-hidden="true">›</span>
          Select a year in the partition tree, then choose a month to inspect the real Parquet files.
        </div>
      </div>
    </div>
  );
}

export default function PartitionDetails({
  metadata,
  partition,
  preview,
  previewLoading,
  previewError,
  onSelectDataset,
}: PartitionDetailsProps) {
  if (!partition) {
    return <DatasetOverview metadata={metadata} />;
  }

  const previewColumns =
    preview && preview.columns.length > 0
      ? preview.columns
      : preview && preview.records.length > 0
        ? Object.keys(preview.records[0])
        : [];

  // Samples are only trustworthy when the Spark manifest still describes the
  // live HDFS listing (or when HDFS is offline and the manifest is the explicit
  // fallback source), and any loaded sample belongs to that same Spark job.
  const manifestTrusted =
    metadata.source === 'manifest' ||
    (metadata.source === 'hdfs' && metadata.manifestMatchesDataset);
  const samplesTrusted =
    manifestTrusted &&
    (!preview ||
      !preview.jobId ||
      !metadata.jobId ||
      preview.jobId === metadata.jobId);

  return (
    <div className="pq-panel pq-details">
      <div className="pq-details-top">
        <div className="pq-breadcrumb" aria-label="Partition breadcrumb">
          <button type="button" onClick={onSelectDataset}>
            Parquet Dataset
          </button>
          <span>/</span>
          <span>year={partition.year}</span>
          <span>/</span>
          <span>month={partition.month}</span>
        </div>
        <span className="pq-panel-tag">PARTITION DETAILS</span>
      </div>

      <div className="pq-details-heading">
        <div>
          <span className="pq-section-kicker">SELECTED PARTITION</span>
          <h3 className="pq-details-title">
            {monthName(partition.month)} {partition.year}
          </h3>
          <code className="pq-details-path">{partition.path}</code>
        </div>
        <button type="button" className="pq-btn pq-btn--small" onClick={onSelectDataset}>
          ← DATASET
        </button>
      </div>

      <div className="pq-detail-metrics">
        <div className="pq-detail-metric">
          <span className="pq-metric-label">FILES</span>
          <span className="pq-metric-value">{formatCount(partition.fileCount)}</span>
          <span className="pq-metric-sub">part-*.parquet</span>
        </div>
        <div className="pq-detail-metric">
          <span className="pq-metric-label">PARTITION SIZE</span>
          <span className="pq-metric-value">{formatBytes(partition.sizeBytes)}</span>
          <span className="pq-metric-sub">logical HDFS bytes</span>
        </div>
        <div className="pq-detail-metric">
          <span className="pq-metric-label">ROWS</span>
          <span className="pq-metric-value">
            {partition.rowCount != null ? formatCount(partition.rowCount) : 'Unavailable'}
          </span>
          <span className="pq-metric-sub">
            {partition.rowCount != null
              ? `${rowCountLabel(partition.rowCountType)} · recorded at generation`
              : 'regenerate to capture exact counts'}
          </span>
        </div>
        <div className="pq-detail-metric">
          <span className="pq-metric-label">LAST MODIFIED</span>
          <span className="pq-metric-value pq-metric-value--date">
            {formatDateTime(partition.lastModified)}
          </span>
          <span className="pq-metric-sub">HDFS file timestamp</span>
        </div>
      </div>

      <section className="pq-subsection">
        <div className="pq-subsection-header">
          <span>PARQUET FILES</span>
          <span>{formatCount(partition.fileCount)} objects</span>
        </div>
        {partition.files.length === 0 ? (
          <div className="pq-inline-empty">This partition contains no Parquet files.</div>
        ) : (
          <div className="pq-table-wrap">
            <table className="pq-table">
              <thead>
                <tr>
                  <th>FILE</th>
                  <th>SIZE</th>
                  <th>LAST MODIFIED</th>
                </tr>
              </thead>
              <tbody>
                {partition.files.map(file => (
                  <tr key={file.path}>
                    <td className="pq-file-name" title={file.path}>
                      {file.name}
                    </td>
                    <td>{formatBytes(file.sizeBytes)}</td>
                    <td>{formatDateTime(file.lastModified)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pq-subsection">
        <div className="pq-subsection-header">
          <span>PARTITION SCHEMA</span>
          <span>{metadata.schema.length} columns</span>
        </div>
        {metadata.schema.length === 0 ? (
          <div className="pq-inline-empty">
            The schema was not captured. Generate the dataset so Spark can read the real
            Parquet footer schema.
          </div>
        ) : (
          <div className="pq-table-wrap">
            <table className="pq-table pq-schema-table">
              <thead>
                <tr>
                  <th>COLUMN</th>
                  <th>TYPE</th>
                  <th>NULLABLE</th>
                  <th>ROLE</th>
                </tr>
              </thead>
              <tbody>
                {metadata.schema.map(field => (
                  <tr key={field.name}>
                    <td>{field.name}</td>
                    <td>{field.type}</td>
                    <td>{field.nullable ? 'YES' : 'NO'}</td>
                    <td>{field.isPartition ? 'PARTITION' : 'DATA'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pq-subsection pq-preview">
        <div className="pq-subsection-header">
          <span>BOUNDED RECORD SAMPLE</span>
          <span>
            {!samplesTrusted
              ? 'WITHHELD · STALE MANIFEST'
              : preview?.available
                ? `${preview.records.length} ROWS · SPARK-SAMPLED`
                : 'UP TO 5 ROWS'}
          </span>
        </div>

        {!samplesTrusted ? (
          <div className="pq-inline-empty">
            Bounded Spark samples are withheld because the last metadata manifest no longer
            matches the live HDFS file listing. Regenerate the dataset to record fresh samples
            from the current files.
          </div>
        ) : previewLoading ? (
          <div className="pq-inline-loading">Reading the bounded Spark sample…</div>
        ) : previewError ? (
          <div className="pq-inline-error">{previewError}</div>
        ) : preview?.available && preview.records.length > 0 ? (
          <>
            <div className="pq-table-wrap pq-preview-wrap">
              <table className="pq-table pq-preview-table">
                <thead>
                  <tr>
                    {previewColumns.map(column => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.records.map((record, rowIndex) => (
                    <tr key={rowIndex}>
                      {previewColumns.map(column => (
                        <td key={column} title={previewValue(record[column])}>
                          {previewValue(record[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pq-preview-note">
              Sampled with Apache Spark at {formatDateTime(preview.generatedAt)}
              {preview.jobId ? ` · job ${preview.jobId}` : ''} · bounded to{' '}
              {preview.limit ?? 5} records — the full dataset was never sent to the browser.
            </div>
          </>
        ) : (
          <div className="pq-inline-empty">
            {preview?.message ??
              'No bounded sample is available for this partition. Generate the dataset to record Spark samples.'}
          </div>
        )}
      </section>
    </div>
  );
}

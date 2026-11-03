import type { ParquetSchemaResponse } from '../../types/parquet';
import { formatCount, formatDateTime, rowCountLabel } from './format';

interface SchemaPanelProps {
  schema: ParquetSchemaResponse | null;
  loading: boolean;
  onClose: () => void;
}

function compressionDetail(schema: ParquetSchemaResponse): string {
  if (!schema.compression) return 'compression not recorded';
  if (schema.compressionVerified) {
    return schema.compressionSource === 'parquet-footer'
      ? 'verified from the Parquet footer'
      : 'verified from Spark metadata';
  }
  return 'reported from the Spark writer config';
}

export default function SchemaPanel({ schema, loading, onClose }: SchemaPanelProps) {
  const available = schema !== null && schema.available && schema.schema.length > 0;

  return (
    <section className="pq-panel pq-schema-panel" aria-label="Apache Parquet dataset schema">
      <div className="pq-schema-head">
        <div>
          <span className="pq-panel-label">APACHE PARQUET SCHEMA</span>
          <h3 className="pq-schema-title">Physical dataset definition</h3>
        </div>
        <button type="button" className="pq-btn pq-btn--small" onClick={onClose}>
          CLOSE SCHEMA
        </button>
      </div>

      {loading && !schema ? (
        <div className="pq-schema-loading">
          <div className="skeleton skeleton-text" />
          <div className="skeleton skeleton-text" />
          <div className="skeleton skeleton-text" />
          <div className="skeleton skeleton-text" />
        </div>
      ) : !schema ? (
        <div className="pq-inline-empty">
          The schema request did not return a response yet. Close this panel and try again.
        </div>
      ) : !available ? (
        <div className="pq-schema-unavailable">
          <span className="pq-schema-unavailable-mark" aria-hidden="true">
            !
          </span>
          <div>
            <strong>{schema.message ?? 'No Parquet schema is available.'}</strong>
            <span>
              The schema is captured only after a real Spark generation run reads the Parquet
              footer. No fields are inferred or invented by the dashboard.
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="pq-schema-meta">
            <div className="pq-schema-meta-item pq-schema-meta-item--wide">
              <span className="pq-metric-label">DATASET PATH</span>
              <code className="pq-code">{schema.datasetPath ?? '—'}</code>
            </div>
            <div className="pq-schema-meta-item">
              <span className="pq-metric-label">COMPRESSION</span>
              <span className="pq-schema-value">
                {schema.compression ? schema.compression.toUpperCase() : 'Not recorded'}
              </span>
              <span className="pq-schema-sub">{compressionDetail(schema)}</span>
            </div>
            <div className="pq-schema-meta-item">
              <span className="pq-metric-label">PARTITION COLUMNS</span>
              <span className="pq-schema-value">
                {schema.partitionColumns.length > 0
                  ? schema.partitionColumns.join(' / ')
                  : 'None'}
              </span>
              <span className="pq-schema-sub">hive-style directories</span>
            </div>
            <div className="pq-schema-meta-item">
              <span className="pq-metric-label">RECORDED ROWS</span>
              <span className="pq-schema-value">
                {schema.totalRows != null ? formatCount(schema.totalRows) : 'Unavailable'}
              </span>
              <span className="pq-schema-sub">
                {schema.totalRows != null
                  ? `${rowCountLabel(schema.rowCountType)} · captured at generation`
                  : 'regenerate to capture exact counts'}
              </span>
            </div>
            <div className="pq-schema-meta-item">
              <span className="pq-metric-label">CAPTURED</span>
              <span className="pq-schema-value">{formatDateTime(schema.generatedAt)}</span>
              <span className="pq-schema-sub">
                {schema.jobId ? `Spark job ${schema.jobId}` : 'Spark manifest timestamp'}
              </span>
            </div>
          </div>

          <div className="pq-schema-table-head">
            <span>SPARK / PARQUET DATA TYPES</span>
            <span className={`pq-manifest-pill ${schema.manifestMatchesDataset ? 'pq-manifest-pill--match' : ''}`}>
              {schema.manifestMatchesDataset
                ? 'MANIFEST MATCHES LIVE HDFS'
                : 'MANIFEST NOT MATCHED TO LIVE FILES'}
            </span>
          </div>

          <div className="pq-table-wrap">
            <table className="pq-table pq-schema-table pq-schema-table--full">
              <thead>
                <tr>
                  <th>COLUMN</th>
                  <th>SPARK TYPE</th>
                  <th>NULLABLE</th>
                  <th>ROLE</th>
                </tr>
              </thead>
              <tbody>
                {schema.schema.map(field => (
                  <tr key={field.name}>
                    <td className="pq-schema-field-name">{field.name}</td>
                    <td>{field.type}</td>
                    <td>{field.nullable ? 'YES' : 'NO'}</td>
                    <td>
                      <span
                        className={`pq-role-badge ${
                          field.isPartition ? 'pq-role-badge--partition' : ''
                        }`}
                      >
                        {field.isPartition ? 'PARTITION' : 'DATA'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="pq-schema-foot">
            Read from the physical Parquet dataset with <code>spark.read.parquet()</code>. This is
            the same schema the Spark writer produced — partition columns are shown exactly as
            stored in the Hive-style directory layout.
          </p>
        </>
      )}
    </section>
  );
}

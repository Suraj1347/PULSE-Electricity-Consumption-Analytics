import SectionReveal from '../components/SectionReveal/SectionReveal';
import StorageSummary from '../components/Parquet/StorageSummary';
import StorageCharts from '../components/Parquet/StorageCharts';
import PartitionTree from '../components/Parquet/PartitionTree';
import PartitionDetails from '../components/Parquet/PartitionDetails';
import SchemaPanel from '../components/Parquet/SchemaPanel';
import ExecutionLog from '../components/Parquet/ExecutionLog';
import { formatDateTime } from '../components/Parquet/format';
import { useParquetExplorer } from '../hooks/useParquetExplorer';
import type { ParquetJobView, ParquetMetadata } from '../types/parquet';
import './StorageIntelligence.css';

const DOCKER_START_COMMAND =
  'docker compose up -d namenode datanode1 datanode2 datanode3 spark-master spark-worker1 spark-worker2';

function sourceLabel(metadata: ParquetMetadata): string {
  if (metadata.source === 'hdfs') return 'LIVE HDFS LISTING';
  if (metadata.source === 'manifest') return 'LAST SPARK MANIFEST';
  return 'UNAVAILABLE';
}

function statusTone(
  metadata: ParquetMetadata | null,
  metadataError: string | null,
  job: ParquetJobView | null
): string {
  if (job?.status === 'running') return 'running';
  if (job?.status === 'failed') return metadata?.available ? 'degraded' : 'error';
  if (metadataError) return metadata ? 'degraded' : 'error';
  if (metadata?.source === 'manifest' || metadata?.degraded) return 'degraded';
  if (metadata?.available) return 'live';
  return 'idle';
}

function statusText(
  metadata: ParquetMetadata | null,
  metadataError: string | null,
  job: ParquetJobView | null
): string {
  if (job?.status === 'running') return 'SPARK JOB RUNNING';
  if (job?.status === 'failed') return 'LAST SPARK JOB FAILED';
  if (metadataError) {
    return metadata ? 'STORAGE API ERROR · LAST SNAPSHOT' : 'STORAGE API OFFLINE';
  }
  if (metadata?.source === 'manifest') return 'MANIFEST FALLBACK · HDFS OFFLINE';
  if (metadata?.degraded) return 'LIVE HDFS · METADATA DEGRADED';
  if (metadata?.available) return 'LIVE HDFS INSPECTION';
  return 'AWAITING FIRST GENERATION';
}

export default function StorageIntelligence() {
  const {
    metadata,
    metadataLoading,
    metadataError,
    refreshing,
    job,
    jobError,
    starting,
    schemaOpen,
    schema,
    schemaLoading,
    selectedKey,
    selectedPartition,
    preview,
    previewLoading,
    previewError,
    actionError,
    downloading,
    generate,
    refresh,
    refreshStatus,
    toggleSchema,
    selectPartition,
    downloadReport,
  } = useParquetExplorer();

  const running = job?.status === 'running';
  const failed = job?.status === 'failed';
  const available = metadata?.available === true;
  const hdfsPath = metadata?.hdfsPath ?? '/pulse/parquet';
  const tone = statusTone(metadata, metadataError, job);
  const hdfsUnavailable = metadata?.errorKind === 'hdfs_unavailable';

  return (
    <section
      className="pq"
      aria-busy={metadataLoading || refreshing || starting || running}
    >
      <div className="pq-atmo" />
      <div className="pq-inner">
        <SectionReveal>
          <div className="pq-header">
            <div>
              <span className="pulse-section-num">08</span>
              <h2 className="pulse-section-title">STORAGE INTELLIGENCE</h2>
            </div>
            <p className="pq-subtitle">
              A live Apache Parquet partition explorer. Files, sizes, row counts and schema are
              produced by PySpark and read from HDFS (or the last Spark manifest when HDFS is
              offline) — never simulated in the browser.
            </p>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.08}>
          <div className="pq-toolbar">
            <div className="pq-status-row" role="status" aria-live="polite">
              <span className={`pq-status-dot pq-status-dot--${tone}`} aria-hidden="true" />
              <span className="pq-status-text">{statusText(metadata, metadataError, job)}</span>
              <span className="pq-status-sep">/</span>
              <span className="pq-status-dim">Apache Spark</span>
              <span className="pq-status-arrow">→</span>
              <span className="pq-status-dim">HDFS {hdfsPath}</span>
            </div>

            <div className="pq-actions">
              <button
                type="button"
                className="pq-btn pq-btn--accent"
                onClick={() => {
                  void generate();
                }}
                disabled={starting || running}
              >
                {running
                  ? 'SPARK JOB RUNNING…'
                  : starting
                    ? 'STARTING SPARK…'
                    : 'GENERATE PARQUET DATASET'}
              </button>
              <button
                type="button"
                className="pq-btn"
                onClick={refresh}
                disabled={refreshing || metadataLoading}
              >
                {refreshing || metadataLoading ? 'REFRESHING…' : 'REFRESH PARTITIONS'}
              </button>
              <button
                type="button"
                className="pq-btn"
                onClick={() => {
                  void toggleSchema();
                }}
                aria-pressed={schemaOpen}
              >
                {schemaOpen ? 'HIDE PARQUET SCHEMA' : 'VIEW PARQUET SCHEMA'}
              </button>
              <button
                type="button"
                className="pq-btn"
                onClick={() => {
                  void downloadReport();
                }}
                disabled={!available || downloading}
                title={
                  available
                    ? 'Download the JSON evidence report assembled from live HDFS metadata'
                    : 'Generate a Parquet dataset before downloading evidence'
                }
              >
                {downloading ? 'PREPARING REPORT…' : 'DOWNLOAD EVIDENCE'}
              </button>
            </div>
          </div>
        </SectionReveal>

        {metadataError && (
          <div className="pq-notice pq-notice--error" role="alert">
            <span className="pq-notice-label">METADATA API</span>
            <p>{metadataError}</p>
            <button type="button" className="pq-notice-action" onClick={refresh}>
              RETRY
            </button>
          </div>
        )}

        {actionError && (
          <div className="pq-notice pq-notice--error" role="alert">
            <span className="pq-notice-label">ACTION FAILED</span>
            <p>{actionError}</p>
          </div>
        )}

        {jobError && !job && (
          <div className="pq-notice pq-notice--error" role="alert">
            <span className="pq-notice-label">STORAGE API</span>
            <p>{jobError}</p>
          </div>
        )}

        {failed && job && (
          <div className="pq-notice pq-notice--error" role="alert">
            <span className="pq-notice-label">GENERATION FAILED</span>
            <p>
              {job.error ??
                `Spark job ${job.id} failed. See the execution log for the captured Docker/Spark output.`}
            </p>
          </div>
        )}

        {metadata && metadata.available && metadata.message && (
          <div
            className={`pq-notice ${
              metadata.degraded ? 'pq-notice--warn' : 'pq-notice--info'
            }`}
          >
            <span className="pq-notice-label">
              {metadata.degraded ? 'DEGRADED INSPECTION' : 'DATASET NOTICE'}
            </span>
            <p>{metadata.message}</p>
          </div>
        )}

        {metadata && metadata.available && (
          <div className="pq-dataset-bar">
            <div className="pq-dataset-item pq-dataset-item--path">
              <span className="pq-metric-label">HDFS DATASET</span>
              <code className="pq-code">{metadata.hdfsPath}</code>
            </div>
            <div className="pq-dataset-item">
              <span className="pq-metric-label">INSPECTION SOURCE</span>
              <span className={`pq-source-pill pq-source-pill--${metadata.source}`}>
                {sourceLabel(metadata)}
              </span>
            </div>
            <div className="pq-dataset-item">
              <span className="pq-metric-label">INSPECTED AT</span>
              <span className="pq-dataset-value">{formatDateTime(metadata.inspectedAt)}</span>
            </div>
            <div className="pq-dataset-item">
              <span className="pq-metric-label">MANIFEST</span>
              <span
                className={`pq-manifest-state ${
                  metadata.manifestMatchesDataset ? 'pq-manifest-state--match' : ''
                }`}
              >
                {metadata.source === 'manifest'
                  ? 'HDFS OFFLINE · LAST MANIFEST'
                  : metadata.manifestMatchesDataset
                    ? 'MATCHES LIVE FILES'
                    : metadata.manifestGeneratedAt
                      ? 'DOES NOT MATCH LIVE FILES'
                      : 'NOT RECORDED'}
              </span>
            </div>
          </div>
        )}

        {schemaOpen && (
          <SchemaPanel
            schema={schema}
            loading={schemaLoading}
            onClose={() => {
              void toggleSchema();
            }}
          />
        )}

        {metadataLoading && !metadata ? (
          <div className="pq-loading" aria-label="Inspecting live HDFS Parquet metadata">
            <StorageSummary metadata={null} loading />
            <div className="pq-loading-charts">
              <div className="pq-panel pq-loading-block skeleton" />
              <div className="pq-panel pq-loading-block skeleton" />
            </div>
            <div className="pq-loading-grid">
              <div className="pq-panel pq-loading-panel skeleton" />
              <div className="pq-panel pq-loading-panel skeleton" />
            </div>
            <div className="pq-loading-note">
              Querying the NameNode with <code>hdfs dfs -ls -R {hdfsPath}</code> and matching
              the result against the last Spark manifest.
            </div>
          </div>
        ) : metadataError && !metadata ? (
          <div className="pq-state pq-state--error">
            <span className="pq-state-mark pq-state-mark--error" aria-hidden="true">
              !
            </span>
            <span className="pq-section-kicker">STORAGE INTELLIGENCE UNAVAILABLE</span>
            <h3 className="pq-state-title">The Parquet metadata API could not be reached</h3>
            <p className="pq-state-copy">{metadataError}</p>
            <p className="pq-state-copy">
              The explorer is served by the Vite development server. Start it with{' '}
              <code>npm run dev</code> and check that the HDFS/Spark Docker cluster is running.
            </p>
            <div className="pq-state-actions">
              <button type="button" className="pq-btn pq-btn--accent" onClick={refresh}>
                RETRY INSPECTION
              </button>
            </div>
          </div>
        ) : !metadata || !metadata.available ? (
          running || starting ? (
            <div className="pq-state pq-state--working">
              <span className="pq-status-dot pq-status-dot--running" aria-hidden="true" />
              <span className="pq-section-kicker">SPARK GENERATION IN PROGRESS</span>
              <h3 className="pq-state-title">Writing the partitioned Parquet dataset</h3>
              <p className="pq-state-copy">
                The real Spark job is running now. Follow its stages and Docker/Spark output in
                the execution log below. HDFS metadata will appear automatically when the job
                completes.
              </p>
              <code className="pq-command">{hdfsPath}/year=YYYY/month=MM</code>
            </div>
          ) : hdfsUnavailable ? (
            <div className="pq-state pq-state--error">
              <span className="pq-state-mark pq-state-mark--error" aria-hidden="true">
                !
              </span>
              <span className="pq-section-kicker">HDFS UNAVAILABLE · NO MANIFEST FALLBACK</span>
              <h3 className="pq-state-title">The NameNode could not be inspected</h3>
              <p className="pq-state-copy">
                {metadata?.message ??
                  'HDFS is unavailable and no Spark-generated Parquet manifest exists yet.'}
              </p>
              {metadata?.detail && <pre className="pq-state-detail">{metadata.detail}</pre>}
              <p className="pq-state-copy">
                Start the cluster, then retry. This page never substitutes simulated partition
                data when HDFS is offline.
              </p>
              <code className="pq-command">{DOCKER_START_COMMAND}</code>
              <div className="pq-state-actions">
                <button
                  type="button"
                  className="pq-btn pq-btn--accent"
                  onClick={refresh}
                  disabled={refreshing}
                >
                  {refreshing ? 'RETRYING…' : 'RETRY HDFS INSPECTION'}
                </button>
              </div>
            </div>
          ) : (
            <div className="pq-state pq-state--empty">
              <span className="pq-state-mark" aria-hidden="true">
                PQ
              </span>
              <span className="pq-section-kicker">
                {metadata?.errorKind === 'empty'
                  ? 'OUTPUT DIRECTORY IS EMPTY'
                  : 'DATASET NOT GENERATED'}
              </span>
              <h3 className="pq-state-title">
                {metadata?.errorKind === 'empty'
                  ? `No Parquet files exist in ${hdfsPath}`
                  : `No Parquet dataset at ${hdfsPath}`}
              </h3>
              <p className="pq-state-copy">
                {metadata?.message ??
                  'Generate the dataset to create real year/month partitions from the raw HDFS data.'}
              </p>
              {metadata?.detail && <pre className="pq-state-detail">{metadata.detail}</pre>}

              <div className="pq-empty-grid">
                <div className="pq-empty-step">
                  <span className="pq-empty-step-num">01</span>
                  <div>
                    <strong>Start HDFS + Spark</strong>
                    <code>{DOCKER_START_COMMAND}</code>
                  </div>
                </div>
                <div className="pq-empty-step">
                  <span className="pq-empty-step-num">02</span>
                  <div>
                    <strong>Ensure the raw dataset is in HDFS</strong>
                    <code>docker compose --profile tools run --rm hdfs-init</code>
                  </div>
                </div>
                <div className="pq-empty-step">
                  <span className="pq-empty-step-num">03</span>
                  <div>
                    <strong>Generate partitioned Parquet</strong>
                    <span>
                      Press <em>Generate Parquet Dataset</em> below. This launches the dedicated{' '}
                      <code>spark-parquet</code> Compose service with Spark's native writer,
                      Snappy compression and <code>partitionBy(year, month)</code>.
                    </span>
                  </div>
                </div>
              </div>

              <div className="pq-state-actions">
                <button
                  type="button"
                  className="pq-btn pq-btn--accent"
                  onClick={() => {
                    void generate();
                  }}
                  disabled={starting}
                >
                  {starting ? 'STARTING SPARK…' : 'GENERATE PARQUET DATASET'}
                </button>
                <button
                  type="button"
                  className="pq-btn"
                  onClick={refresh}
                  disabled={refreshing}
                >
                  {refreshing ? 'REFRESHING…' : 'REFRESH PARTITIONS'}
                </button>
              </div>

              {actionError && (
                <div className="pq-inline-error" role="alert">
                  {actionError}
                </div>
              )}

              <p className="pq-state-foot">
                The job writes only to <code>{hdfsPath}</code>. It never overwrites{' '}
                <code>/pulse/raw</code> or the existing <code>/pulse/output</code> analytics.
                {metadata?.manifestGeneratedAt
                  ? ` A previous manifest was recorded at ${formatDateTime(
                      metadata.manifestGeneratedAt
                    )}, but no live Parquet files are currently present.`
                  : ''}
              </p>
            </div>
          )
        ) : (
          <>
            <SectionReveal delay={0.12}>
              <StorageSummary metadata={metadata} loading={false} />
            </SectionReveal>

            <SectionReveal delay={0.16}>
              <StorageCharts metadata={metadata} />
            </SectionReveal>

            <SectionReveal delay={0.2}>
              <div className="pq-workbench">
                <PartitionTree
                  years={metadata.years}
                  selectedKey={selectedKey}
                  onSelect={selectPartition}
                />
                <PartitionDetails
                  metadata={metadata}
                  partition={selectedPartition}
                  preview={preview}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  onSelectDataset={() => selectPartition(null)}
                />
              </div>
            </SectionReveal>
          </>
        )}

        <SectionReveal delay={0.1}>
          <ExecutionLog
            job={job}
            jobError={jobError}
            starting={starting}
            metadataAvailable={available}
            downloading={downloading}
            onGenerate={() => {
              void generate();
            }}
            onRefreshStatus={() => {
              void refreshStatus();
            }}
            onDownloadReport={() => {
              void downloadReport();
            }}
          />
        </SectionReveal>

        <div className="pq-footer-note">
          <span>SPARK NATIVE WRITER · SNAPPY · partitionBy(year, month)</span>
          <span>HDFS EVIDENCE: {hdfsPath}/_pulse/</span>
          <span>RAW + ANALYTICS OUTPUTS REMAIN UNTOUCHED</span>
        </div>
      </div>
    </section>
  );
}

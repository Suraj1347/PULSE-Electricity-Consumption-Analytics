import { useEffect, useRef, useState } from 'react';
import type { ParquetJobStage, ParquetJobView } from '../../types/parquet';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  stageLabel,
} from './format';

interface ExecutionLogProps {
  job: ParquetJobView | null;
  jobError: string | null;
  starting: boolean;
  metadataAvailable: boolean;
  downloading: boolean;
  onGenerate: () => void;
  onRefreshStatus: () => void;
  onDownloadReport: () => void;
}

const STAGES: Array<{ id: ParquetJobStage; short: string }> = [
  { id: 'prepare', short: 'PREPARE' },
  { id: 'validate', short: 'VALIDATE' },
  { id: 'write', short: 'WRITE PARQUET' },
  { id: 'inspect', short: 'INSPECT FILES' },
  { id: 'preview', short: 'SAMPLE ROWS' },
  { id: 'manifest', short: 'MANIFEST' },
  { id: 'done', short: 'COMPLETE' },
];

const STAGE_IDS = STAGES.map(stage => stage.id);

type StageState = 'done' | 'active' | 'pending' | 'failed';

function lastLoggedStage(logTail: string, fallback: ParquetJobStage): ParquetJobStage {
  const matches = [...logTail.matchAll(/\[PULSE\] STAGE ([a-z]+)/gi)];
  if (matches.length === 0) return fallback;
  const candidate = matches[matches.length - 1][1].toLowerCase() as ParquetJobStage;
  return STAGE_IDS.includes(candidate) ? candidate : fallback;
}

function stageState(
  job: ParquetJobView,
  index: number,
  effectiveIndex: number
): StageState {
  if (job.status === 'completed') return 'done';

  if (job.status === 'failed') {
    if (index < effectiveIndex) return 'done';
    if (index === effectiveIndex) return 'failed';
    return 'pending';
  }

  if (index < effectiveIndex) return 'done';
  if (index === effectiveIndex) return 'active';
  return 'pending';
}

export default function ExecutionLog({
  job,
  jobError,
  starting,
  metadataAvailable,
  downloading,
  onGenerate,
  onRefreshStatus,
  onDownloadReport,
}: ExecutionLogProps) {
  const logRef = useRef<HTMLPreElement | null>(null);
  const followRef = useRef(true);
  const previousJobIdRef = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (job?.status !== 'running') return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (previousJobIdRef.current !== (job?.id ?? null)) {
      previousJobIdRef.current = job?.id ?? null;
      followRef.current = true;
    }
    if (!followRef.current) return;

    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [job?.id, job?.logTail]);

  const handleLogScroll = () => {
    const element = logRef.current;
    if (!element) return;
    followRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  };

  const loggedStage = job ? lastLoggedStage(job.logTail, job.stage) : null;
  const effectiveStage =
    job?.status === 'completed' ? 'done' : loggedStage ?? 'prepare';
  const effectiveIndex = STAGE_IDS.indexOf(effectiveStage);
  const stageForLabel =
    effectiveIndex >= 0 ? STAGE_IDS[effectiveIndex] : 'prepare';
  const running = job?.status === 'running';
  const duration = job ? formatDuration(job.startedAt, job.completedAt, now) : '—';
  const statusLabel =
    job?.status === 'running'
      ? 'RUNNING'
      : job?.status === 'completed'
        ? 'COMPLETED'
        : job?.status === 'failed'
          ? 'FAILED'
          : 'NO RUN';

  return (
    <section className="pq-panel pq-exec" aria-label="Spark Parquet execution log">
      <div className="pq-exec-head">
        <div>
          <span className="pq-panel-label">EXECUTION LOG</span>
          <h3 className="pq-exec-title">Spark job evidence</h3>
        </div>
        <span className={`pq-job-badge pq-job-badge--${job?.status ?? 'idle'}`}>
          <span className="pq-job-badge-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {!job ? (
        <div className="pq-exec-empty">
          <span className="pq-section-kicker">NO GENERATION RUN RECORDED</span>
          <p>
            Generate the Parquet dataset to stream the real Docker Compose / Spark output into
            this panel. Job stages, duration, exit code and logs are captured from the actual
            process — nothing here is simulated.
          </p>
          {jobError && (
            <div className="pq-exec-api-error" role="alert">
              <span>STATUS API</span>
              <p>{jobError}</p>
            </div>
          )}
          <div className="pq-exec-empty-actions">
            <button
              type="button"
              className="pq-btn pq-btn--accent"
              onClick={onGenerate}
              disabled={starting}
            >
              {starting ? 'STARTING SPARK…' : 'GENERATE PARQUET DATASET'}
            </button>
            <button type="button" className="pq-btn" onClick={onRefreshStatus}>
              REFRESH STATUS
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="pq-exec-stats">
            <div className="pq-exec-stat pq-exec-stat--wide">
              <span className="pq-metric-label">JOB ID</span>
              <code className="pq-exec-job-id">{job.id}</code>
            </div>
            <div className="pq-exec-stat">
              <span className="pq-metric-label">RUNNER</span>
              <span className="pq-exec-value">
                {job.runner === 'docker' ? 'Docker Compose' : 'Local PySpark'}
              </span>
              <span className="pq-exec-sub">
                {job.runner === 'docker' ? 'spark-parquet service' : 'python spark_parquet.py'}
              </span>
            </div>
            <div className="pq-exec-stat">
              <span className="pq-metric-label">STARTED</span>
              <span className="pq-exec-value pq-exec-value--date">
                {formatDateTime(job.startedAt)}
              </span>
            </div>
            <div className="pq-exec-stat">
              <span className="pq-metric-label">DURATION</span>
              <span className={`pq-exec-value ${running ? 'pq-exec-value--live' : ''}`}>
                {duration}
              </span>
              <span className="pq-exec-sub">
                {job.completedAt
                  ? `completed ${formatDateTime(job.completedAt)}`
                  : running
                    ? 'measured live while running'
                    : 'not completed'}
              </span>
            </div>
            <div className="pq-exec-stat">
              <span className="pq-metric-label">EXIT CODE</span>
              <span
                className={`pq-exec-value ${
                  job.status === 'failed' ? 'pq-exec-value--error' : ''
                }`}
              >
                {job.exitCode ?? '—'}
              </span>
              <span className="pq-exec-sub">{stageLabel(job.stage)}</span>
            </div>
            <div className="pq-exec-stat">
              <span className="pq-metric-label">LOG CAPTURED</span>
              <span className="pq-exec-value">{formatBytes(job.logBytes)}</span>
              <span className="pq-exec-sub">
                {job.logTruncated ? 'tail retained · earlier output trimmed' : 'full output retained'}
              </span>
            </div>
          </div>

          <div className="pq-exec-progress">
            <div className="pq-exec-progress-head">
              <span>
                {running
                  ? `CURRENT STAGE · ${stageLabel(stageForLabel)}`
                  : job.status === 'completed'
                    ? 'ALL STAGES COMPLETED'
                    : `RUN STOPPED · ${stageLabel(stageForLabel)}`}
              </span>
              <span>{job.status === 'failed' ? 'FAILED' : `${Math.max(effectiveIndex + 1, 0)} / ${STAGES.length}`}</span>
            </div>
            <ol className="pq-stages">
              {STAGES.map((stage, index) => {
                const state = stageState(job, index, Math.max(effectiveIndex, 0));
                return (
                  <li className={`pq-stage pq-stage--${state}`} key={stage.id}>
                    <span className="pq-stage-marker" aria-hidden="true">
                      {state === 'done' ? '✓' : state === 'failed' ? '×' : String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="pq-stage-label">{stage.short}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {job.error && (
            <div className="pq-exec-error" role="alert">
              <span className="pq-exec-error-label">SPARK JOB ERROR</span>
              <p>{job.error}</p>
            </div>
          )}

          {jobError && (
            <div className="pq-exec-api-error" role="alert">
              <span>STATUS API</span>
              <p>{jobError}</p>
            </div>
          )}

          <div className="pq-log-block">
            <div className="pq-log-head">
              <span>SPARK / DOCKER LOG TAIL</span>
              <span>
                {job.logTail.length > 0
                  ? `${job.logTail.split(/\r?\n/).length.toLocaleString('en-US')} lines buffered`
                  : 'waiting for output'}
              </span>
            </div>
            {job.logTail.length > 0 ? (
              <pre
                className="pq-log"
                ref={logRef}
                onScroll={handleLogScroll}
                tabIndex={0}
                aria-label="Spark job log output"
              >
                {job.logTail}
              </pre>
            ) : (
              <div className="pq-log-empty">
                {running
                  ? 'The Spark container is starting. Output will appear here as soon as Docker emits it.'
                  : 'No log output was captured for this run.'}
              </div>
            )}
            {job.logTruncated && (
              <div className="pq-log-note">
                The backend retains a bounded log tail to keep the dashboard responsive. The
                displayed lines are unchanged Spark / Docker output.
              </div>
            )}
          </div>

          <div className="pq-exec-actions">
            <button type="button" className="pq-btn pq-btn--small" onClick={onRefreshStatus}>
              REFRESH STATUS
            </button>
            <button
              type="button"
              className="pq-btn pq-btn--small"
              onClick={onDownloadReport}
              disabled={!metadataAvailable || downloading}
              title={
                metadataAvailable
                  ? 'Download the JSON evidence report assembled from live HDFS metadata'
                  : 'Generate a Parquet dataset before downloading evidence'
              }
            >
              {downloading ? 'PREPARING REPORT…' : 'DOWNLOAD EVIDENCE REPORT'}
            </button>
            <button
              type="button"
              className="pq-btn pq-btn--small pq-btn--accent"
              onClick={onGenerate}
              disabled={starting || running}
            >
              {running ? 'SPARK JOB RUNNING…' : starting ? 'STARTING…' : 'GENERATE AGAIN'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

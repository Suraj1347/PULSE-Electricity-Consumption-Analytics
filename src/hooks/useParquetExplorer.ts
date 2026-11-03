import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ParquetJobView,
  ParquetMetadata,
  ParquetPartition,
  ParquetPreviewResponse,
  ParquetSchemaResponse,
  ParquetStartResponse,
  ParquetStatusResponse,
} from '../types/parquet';

const API = '/api/parquet';

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function responseMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
  }
  return fallback;
}

function unavailableSchema(message: string): ParquetSchemaResponse {
  return {
    available: false,
    message,
    datasetPath: null,
    compression: null,
    compressionVerified: false,
    compressionSource: null,
    partitionColumns: [],
    schema: [],
    generatedAt: null,
    jobId: null,
    totalRows: null,
    rowCountType: null,
    manifestMatchesDataset: false,
  };
}

export function useParquetExplorer() {
  const [metadata, setMetadata] = useState<ParquetMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [job, setJob] = useState<ParquetJobView | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schema, setSchema] = useState<ParquetSchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParquetPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const previewRequestRef = useRef(0);
  const previousJobStatusRef = useRef<string | null>(null);

  const refreshMetadata = useCallback(
    async (mode: 'initial' | 'manual' | 'post-job' = 'manual') => {
      if (mode === 'initial') setMetadataLoading(true);
      else setRefreshing(true);

      try {
        const res = await fetch(`${API}/partitions?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const body = await parseResponse(res);

        if (res.status === 404) {
          throw new Error(
            'The Storage Intelligence API is not available. Run the dashboard with npm run dev to enable the Parquet backend.'
          );
        }
        if (!res.ok) {
          throw new Error(
            responseMessage(body, `Parquet metadata request failed (${res.status}).`)
          );
        }
        if (!body || typeof body !== 'object') {
          throw new Error(
            'The Storage Intelligence API returned an invalid response. Run the dashboard with npm run dev.'
          );
        }

        const next = body as ParquetMetadata;
        setMetadata(next);
        setMetadataError(null);
        setSelectedKey(current => {
          if (!current) return current;
          const exists = next.partitions.some(
            partition => `${partition.year}-${partition.month}` === current
          );
          return exists ? current : null;
        });
      } catch (error) {
        setMetadataError(
          error instanceof Error
            ? error.message
            : 'Could not reach the Storage Intelligence backend.'
        );
      } finally {
        setMetadataLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const refreshStatus = useCallback(async (showError = true) => {
    try {
      const res = await fetch(`${API}/status?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = await parseResponse(res);
      if (!res.ok) {
        throw new Error(responseMessage(body, `Job status request failed (${res.status}).`));
      }
      const status = body as ParquetStatusResponse | null;
      setJob(status?.job ?? null);
      if (showError) setJobError(null);
    } catch (error) {
      if (showError) {
        setJobError(
          error instanceof Error ? error.message : 'Could not read the Parquet job status.'
        );
      }
    }
  }, []);

  useEffect(() => {
    void refreshMetadata('initial');
    void refreshStatus(false);
  }, [refreshMetadata, refreshStatus]);

  // Poll only while a real Spark job is running. Each poll updates the
  // execution log, stage and status from the backend.
  useEffect(() => {
    if (job?.status !== 'running') return;

    let cancelled = false;
    let timer: number | null = null;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await fetch(`${API}/status?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const body = await parseResponse(res);
        if (!res.ok) {
          throw new Error(responseMessage(body, `Job status request failed (${res.status}).`));
        }

        const status = body as ParquetStatusResponse | null;
        if (cancelled) return;
        failures = 0;
        setJobError(null);
        if (status?.job) setJob(status.job);

        if (status?.job?.status === 'running') {
          timer = window.setTimeout(tick, 1500);
        }
      } catch (error) {
        if (cancelled) return;
        failures += 1;
        setJobError(
          error instanceof Error ? error.message : 'Lost contact with the Parquet job status API.'
        );
        if (failures < 8) {
          timer = window.setTimeout(tick, 3000);
        }
      }
    };

    timer = window.setTimeout(tick, 900);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [job?.id, job?.status]);

  // After a real running -> completed transition, refresh the HDFS listing
  // and clear selection/preview/schema so every panel reflects the new run.
  useEffect(() => {
    const previous = previousJobStatusRef.current;
    if (job?.status === 'completed' && previous === 'running') {
      // Invalidate any in-flight sample request from the previous dataset.
      previewRequestRef.current += 1;
      setSelectedKey(null);
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setSchema(null);
      setSchemaOpen(false);
      void refreshMetadata('post-job');
    }
    previousJobStatusRef.current = job?.status ?? null;
  }, [job?.status, refreshMetadata]);

  const generate = useCallback(async () => {
    if (starting || job?.status === 'running') return;

    setStarting(true);
    setJobError(null);
    setActionError(null);

    try {
      const res = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      const body = await parseResponse(res);
      const start = body as ParquetStartResponse | null;

      if (!res.ok || !start?.ok) {
        const detail = start?.detail ? ` ${start.detail}` : '';
        setActionError(
          responseMessage(body, `Parquet generation could not start (${res.status}).`) + detail
        );
        if (start?.job) setJob(start.job);
        return;
      }

      if (start.job) setJob(start.job);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Could not reach the Storage Intelligence backend. Is the dev server running?'
      );
    } finally {
      setStarting(false);
    }
  }, [job?.status, starting]);

  const refresh = useCallback(() => {
    setActionError(null);
    void refreshMetadata('manual');
  }, [refreshMetadata]);

  const toggleSchema = useCallback(async () => {
    if (schemaOpen) {
      setSchemaOpen(false);
      return;
    }

    setSchemaOpen(true);
    setSchemaLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`${API}/schema?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = await parseResponse(res);
      if (body && typeof body === 'object' && 'available' in body) {
        setSchema(body as ParquetSchemaResponse);
      } else {
        setSchema(
          unavailableSchema(
            responseMessage(
              body,
              `The Parquet schema could not be retrieved (HTTP ${res.status}).`
            )
          )
        );
      }
    } catch (error) {
      setSchema(
        unavailableSchema(
          error instanceof Error
            ? error.message
            : 'Could not reach the Parquet schema endpoint.'
        )
      );
    } finally {
      setSchemaLoading(false);
    }
  }, [schemaOpen]);

  const selectPartition = useCallback((partition: ParquetPartition | null) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;

    if (!partition) {
      setSelectedKey(null);
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const key = `${partition.year}-${partition.month}`;
    setSelectedKey(key);
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);

    void (async () => {
      try {
        const res = await fetch(
          `${API}/preview?year=${partition.year}&month=${partition.month}&limit=5&t=${Date.now()}`,
          { cache: 'no-store', headers: { Accept: 'application/json' } }
        );
        const body = await parseResponse(res);
        if (previewRequestRef.current !== requestId) return;

        if (body && typeof body === 'object' && 'available' in body) {
          setPreview(body as ParquetPreviewResponse);
        } else {
          setPreviewError(
            responseMessage(body, `Preview request failed (${res.status}).`)
          );
        }
      } catch (error) {
        if (previewRequestRef.current !== requestId) return;
        setPreviewError(
          error instanceof Error ? error.message : 'Could not load the bounded Spark preview.'
        );
      } finally {
        if (previewRequestRef.current === requestId) setPreviewLoading(false);
      }
    })();
  }, []);

  const downloadReport = useCallback(async () => {
    setDownloading(true);
    setActionError(null);

    try {
      const res = await fetch(`${API}/report`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await parseResponse(res);
        setActionError(
          responseMessage(body, `The evidence report could not be generated (${res.status}).`)
        );
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `pulse-parquet-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Could not download the Parquet evidence report.'
      );
    } finally {
      setDownloading(false);
    }
  }, []);

  const selectedPartition =
    selectedKey && metadata
      ? metadata.partitions.find(
          partition => `${partition.year}-${partition.month}` === selectedKey
        ) ?? null
      : null;

  return {
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
  };
}

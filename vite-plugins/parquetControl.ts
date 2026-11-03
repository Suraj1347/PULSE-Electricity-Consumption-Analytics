import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  buildPreviewResponse,
  buildSchemaResponse,
  inspectParquet,
  readManifest,
} from './parquetHdfs.ts';
import { ParquetJobManager } from './parquetJobs.ts';

const API_PREFIX = '/api/parquet';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.setHeader('Allow', allow);
  sendJson(res, 405, { error: `Method not allowed. Use ${allow}.` });
}

function parseYearMonth(
  rawYear: string | null | undefined,
  rawMonth: string | null | undefined
): { year: number; month: string } | null {
  if (!rawYear || !rawMonth) return null;
  if (!/^\d{4}$/.test(rawYear) || !/^\d{1,2}$/.test(rawMonth)) return null;

  const year = Number(rawYear);
  const monthNumber = Number(rawMonth);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;

  return { year, month: String(monthNumber).padStart(2, '0') };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  jobs: ParquetJobManager
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;

  // GET /api/parquet/status
  if (pathname === '/status') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');
    const job = await jobs.getJob();
    sendJson(res, 200, { running: job?.status === 'running', job });
    return;
  }

  // POST /api/parquet/generate
  if (pathname === '/generate') {
    if (method !== 'POST') return methodNotAllowed(res, 'POST');
    const result = await jobs.start();
    if (!result.ok) {
      sendJson(res, result.status, {
        ok: false,
        error: result.error,
        detail: result.detail,
        job: result.job,
      });
      return;
    }
    sendJson(res, 202, { ok: true, job: result.job });
    return;
  }

  // GET /api/parquet/partitions
  if (pathname === '/partitions') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');
    const metadata = await inspectParquet();
    sendJson(res, 200, metadata);
    return;
  }

  // GET /api/parquet/schema
  if (pathname === '/schema') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');
    const metadata = await inspectParquet();
    const schema = buildSchemaResponse(metadata);
    sendJson(res, schema.available ? 200 : 404, schema);
    return;
  }

  // GET /api/parquet/partitions/:year/:month
  const partitionMatch = pathname.match(/^\/partitions\/([^/]+)\/([^/]+)$/);
  if (partitionMatch) {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');

    const selection = parseYearMonth(partitionMatch[1], partitionMatch[2]);
    if (!selection) {
      sendJson(res, 400, {
        error: 'Invalid partition. Year must be four digits and month must be 1-12.',
      });
      return;
    }

    const metadata = await inspectParquet();
    if (!metadata.available) {
      sendJson(res, 404, {
        error: metadata.message ?? 'The Parquet dataset is not available.',
        errorKind: metadata.errorKind,
      });
      return;
    }

    const partition = metadata.partitions.find(
      item => item.year === selection.year && item.month === selection.month
    );
    if (!partition) {
      sendJson(res, 404, {
        error: `Partition year=${selection.year}/month=${selection.month} does not exist in the actual HDFS listing.`,
        availablePartitions: metadata.partitions.map(item => ({
          year: item.year,
          month: item.month,
        })),
      });
      return;
    }

    sendJson(res, 200, {
      available: true,
      datasetPath: metadata.datasetPath,
      partition,
      schema: metadata.schema,
      compression: metadata.compression,
      compressionVerified: metadata.compressionVerified,
      source: metadata.source,
      inspectedAt: metadata.inspectedAt,
    });
    return;
  }

  // GET /api/parquet/preview?year=2006&month=12&limit=5
  if (pathname === '/preview') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');

    const selection = parseYearMonth(
      url.searchParams.get('year'),
      url.searchParams.get('month')
    );
    if (!selection) {
      sendJson(res, 400, {
        error: 'Invalid preview request. Provide a valid year and month.',
      });
      return;
    }

    const requestedLimit = Number(url.searchParams.get('limit') ?? '5');
    if (!Number.isFinite(requestedLimit) || requestedLimit < 1 || requestedLimit > 20) {
      sendJson(res, 400, { error: 'Preview limit must be between 1 and 20.' });
      return;
    }

    const preview = await buildPreviewResponse(selection.year, selection.month);
    const boundedRecords = preview.records.slice(0, Math.min(requestedLimit, preview.limit ?? 5));
    sendJson(res, preview.available ? 200 : 404, {
      ...preview,
      records: boundedRecords,
    });
    return;
  }

  // GET /api/parquet/report
  if (pathname === '/report') {
    if (method !== 'GET') return methodNotAllowed(res, 'GET');

    const metadata = await inspectParquet();
    if (!metadata.available) {
      sendJson(res, 404, {
        error: metadata.message ?? 'No Parquet dataset is available for a metadata report.',
        errorKind: metadata.errorKind,
      });
      return;
    }

    const manifestResult = await readManifest();
    const job = await jobs.getJob();
    const report = {
      reportVersion: 1,
      reportGeneratedAt: new Date().toISOString(),
      evidence: {
        description:
          'This report was assembled from the live Parquet metadata inspector and the Spark-generated manifest. No values are simulated.',
        inspectionSource: metadata.source,
        hdfsPath: metadata.hdfsPath,
        datasetPath: metadata.datasetPath,
        partitionLayout: 'year=YYYY/month=MM',
        partitionColumns: metadata.partitionColumns,
        compression: metadata.compression,
        compressionVerified: metadata.compressionVerified,
        compressionSource: metadata.compressionSource,
        totalPartitions: metadata.totalPartitions,
        totalFiles: metadata.totalFiles,
        totalSizeBytes: metadata.totalSizeBytes,
        totalRows: metadata.totalRows,
        rowCountType: metadata.rowCountType,
        schema: metadata.schema,
        partitionDirectories: metadata.partitions.map(partition => partition.path),
        parquetFiles: metadata.partitions.flatMap(partition =>
          partition.files.map(file => ({
            path: file.path,
            name: file.name,
            sizeBytes: file.sizeBytes,
            lastModified: file.lastModified,
            partition: {
              year: partition.year,
              month: partition.month,
            },
          }))
        ),
      },
      metadata,
      manifest: manifestResult.manifest,
      manifestError: manifestResult.error,
      lastGenerationJob: job,
    };

    const filename = `pulse-parquet-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify(report, null, 2));
    return;
  }

  sendJson(res, 404, {
    error: `Unknown Storage Intelligence endpoint: ${pathname}`,
    availableEndpoints: [
      'POST /generate',
      'GET /status',
      'GET /partitions',
      'GET /partitions/:year/:month',
      'GET /schema',
      'GET /preview?year=YYYY&month=MM',
      'GET /report',
    ],
  });
}

async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  jobs: ParquetJobManager
): Promise<void> {
  try {
    await handleRequest(req, res, jobs);
  } catch (error) {
    console.error('[parquet] Unhandled Storage Intelligence API error:', error);
    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'The Storage Intelligence backend encountered an error.',
        detail: error instanceof Error ? error.message.slice(0, 400) : 'Unknown error',
      });
    }
  }
}

export function parquetControlPlugin(): Plugin {
  return {
    name: 'pulse-parquet-control',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const jobs = new ParquetJobManager();

      server.middlewares.use(API_PREFIX, (req, res) => {
        void dispatch(req, res, jobs);
      });

      server.httpServer?.once('close', () => {
        jobs.shutdown();
      });
    },
  };
}

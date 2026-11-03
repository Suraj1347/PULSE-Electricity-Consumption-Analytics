import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import {
  MANIFEST_FILE,
  NAMENODE_CONTAINER,
  PARQUET_HDFS_PATH,
  PREVIEWS_FILE,
  PROJECT_ROOT,
  findDockerExecutable,
} from './parquetConfig.ts';
import type {
  ParquetManifest,
  ParquetMetadata,
  ParquetPartition,
  ParquetPreviewFile,
  ParquetPreviewResponse,
  ParquetSchemaResponse,
  ParquetYearSummary,
} from './parquetTypes.ts';

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const HDFS_TIMEOUT_MS = 45_000;

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  errorMessage: string;
  source: 'docker' | 'host' | null;
}

interface HdfsFileRecord {
  path: string;
  name: string;
  sizeBytes: number;
  lastModified: string;
  year: number;
  month: string;
}

type HdfsListing =
  | {
      ok: true;
      files: HdfsFileRecord[];
      target: 'docker' | 'host';
    }
  | {
      ok: false;
      kind: 'missing' | 'empty' | 'unavailable';
      message: string;
      detail: string | null;
      target: 'docker' | 'host' | null;
    };

interface ManifestReadResult {
  manifest: ParquetManifest | null;
  error: string | null;
}

interface PreviewsReadResult {
  previews: ParquetPreviewFile | null;
  error: string | null;
}

function cleanOutput(value: string): string {
  return value.replace(ANSI_RE, '').trim();
}

function firstLine(value: string): string {
  const cleaned = cleanOutput(value);
  return cleaned.split(/\r?\n/).find(line => line.trim().length > 0) ?? '';
}

function execCapture(command: string, args: string[], timeout: number): Promise<CommandResult> {
  return new Promise(resolve => {
    execFile(
      command,
      args,
      {
        cwd: PROJECT_ROOT,
        timeout,
        maxBuffer: 12 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const out = cleanOutput(stdout ?? '');
        const err = cleanOutput(stderr ?? '');
        resolve({
          ok: !error,
          stdout: out,
          stderr: err,
          errorMessage: error ? cleanOutput(error.message) : '',
          source: null,
        });
      }
    );
  });
}

function looksLikeMissingPath(value: string): boolean {
  return /no such file or directory|file does not exist|path does not exist|cannot find the path/i.test(value);
}

function looksLikeUnavailable(value: string): boolean {
  return /cannot connect|connection refused|connection timed out|call to .* failed|is not running|error during connect|no such container|unable to find image|docker daemon|the system cannot find the file|not recognized as an internal or external command|econnrefused|enotfound|eacces|spawn .* (?:enoent|einval)/i.test(
    value
  );
}

async function runHdfsDfs(
  args: string[]
): Promise<{ result: CommandResult; target: 'docker' | 'host' | null }> {
  const mode = (process.env.PULSE_PARQUET_HDFS_RUNNER ?? 'auto').toLowerCase();
  let dockerResult: CommandResult | null = null;

  if (mode !== 'host') {
    const dockerCommand = findDockerExecutable();
    if (!dockerCommand) {
      dockerResult = {
        ok: false,
        stdout: '',
        stderr: '',
        errorMessage:
          'Docker CLI not found. Install or start Docker Desktop, or set PULSE_DOCKER_PATH to docker.exe.',
        source: 'docker',
      };
      if (mode === 'docker') return { result: dockerResult, target: 'docker' };
    } else {
      dockerResult = await execCapture(
        dockerCommand,
        ['exec', NAMENODE_CONTAINER, 'hdfs', 'dfs', ...args],
        HDFS_TIMEOUT_MS
      );
      dockerResult.source = 'docker';
      if (dockerResult.ok) return { result: dockerResult, target: 'docker' };
      if (mode === 'docker') return { result: dockerResult, target: 'docker' };

      const dockerText = `${dockerResult.stdout}\n${dockerResult.stderr}\n${dockerResult.errorMessage}`;
      // A reachable NameNode answering "no such file" is a real answer, not a
      // reason to silently switch to a different local HDFS installation.
      if (looksLikeMissingPath(dockerText) && !looksLikeUnavailable(dockerText)) {
        return { result: dockerResult, target: 'docker' };
      }
    }
  }

  // Node cannot execFile a Windows .cmd shim directly. Launch hdfs.cmd through
  // cmd.exe with a fixed argument array; no user input is interpolated here.
  const hostCommand =
    process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'hdfs';
  const hostArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'hdfs.cmd', 'dfs', ...args]
      : ['dfs', ...args];
  const hostResult = await execCapture(hostCommand, hostArgs, HDFS_TIMEOUT_MS);
  hostResult.source = 'host';
  if (hostResult.ok) return { result: hostResult, target: 'host' };

  const detailLines: string[] = [];
  if (dockerResult) {
    const dockerDetail = firstLine(`${dockerResult.stderr}\n${dockerResult.errorMessage}`);
    if (dockerDetail) detailLines.push(`Docker/NameNode: ${dockerDetail}`);
  }
  const hostDetail = firstLine(`${hostResult.stderr}\n${hostResult.errorMessage}`);
  if (hostDetail) detailLines.push(`Local hdfs CLI: ${hostDetail}`);

  return {
    target: null,
    result: {
      ...hostResult,
      stderr: detailLines.join('\n'),
      errorMessage: detailLines.join('\n'),
    },
  };
}

function combineHdfsDate(date: string, time: string): string {
  const normalizedTime = time.split(':').length === 2 ? `${time}:00` : time;
  return `${date}T${normalizedTime}`;
}

function parseHdfsListing(output: string): HdfsFileRecord[] {
  const records: HdfsFileRecord[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 8) continue;
    if (!parts[0].startsWith('-')) continue; // files only, directories start with d

    const fullPath = parts[parts.length - 1];
    if (!fullPath.endsWith('.parquet')) continue;

    const sizeBytes = Number(parts[parts.length - 4]);
    if (!Number.isFinite(sizeBytes)) continue;

    const partitionMatch = fullPath.match(/\/year=(\d{4})\/month=(\d{1,2})\//);
    if (!partitionMatch) continue;

    records.push({
      path: fullPath.startsWith('/') ? `hdfs://${fullPath}` : fullPath,
      name: fullPath.split('/').pop() ?? fullPath,
      sizeBytes,
      lastModified: combineHdfsDate(parts[parts.length - 3], parts[parts.length - 2]),
      year: Number(partitionMatch[1]),
      month: partitionMatch[2].padStart(2, '0'),
    });
  }

  return records;
}

export async function listParquetFiles(): Promise<HdfsListing> {
  const { result, target } = await runHdfsDfs(['-ls', '-R', PARQUET_HDFS_PATH]);
  const output = `${result.stdout}\n${result.stderr}\n${result.errorMessage}`;

  if (!result.ok) {
    if (looksLikeMissingPath(output) && !looksLikeUnavailable(result.errorMessage)) {
      return {
        ok: false,
        kind: 'missing',
        message: `No Parquet dataset exists at ${PARQUET_HDFS_PATH}.`,
        detail: null,
        target,
      };
    }

    return {
      ok: false,
      kind: 'unavailable',
      message:
        'HDFS could not be inspected. Start the Docker HDFS/Spark cluster and make sure the NameNode is reachable.',
      detail: firstLine(result.errorMessage || result.stderr) || null,
      target,
    };
  }

  const files = parseHdfsListing(result.stdout);
  if (files.length === 0) {
    return {
      ok: false,
      kind: 'empty',
      message: `${PARQUET_HDFS_PATH} exists but contains no .parquet files.`,
      detail: null,
      target,
    };
  }

  return { ok: true, files, target: target ?? 'docker' };
}

export async function readManifest(): Promise<ManifestReadResult> {
  try {
    const text = await readFile(MANIFEST_FILE, 'utf8');
    const parsed = JSON.parse(text) as Partial<ParquetManifest>;
    if (parsed.format !== 'parquet' || !Array.isArray(parsed.partitions) || !Array.isArray(parsed.schema)) {
      throw new Error('The file is not a PULSE Parquet manifest.');
    }
    return { manifest: parsed as ParquetManifest, error: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { manifest: null, error: null };
    }
    return {
      manifest: null,
      error: error instanceof Error ? error.message : 'Could not read the Parquet manifest.',
    };
  }
}

export async function readPreviews(): Promise<PreviewsReadResult> {
  try {
    const text = await readFile(PREVIEWS_FILE, 'utf8');
    const parsed = JSON.parse(text) as Partial<ParquetPreviewFile>;
    if (
      parsed.format !== 'parquet-previews' ||
      typeof parsed.partitions !== 'object' ||
      parsed.partitions === null
    ) {
      throw new Error('The file is not a PULSE Parquet preview sample.');
    }
    return { previews: parsed as ParquetPreviewFile, error: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { previews: null, error: null };
    }
    return {
      previews: null,
      error: error instanceof Error ? error.message : 'Could not read the Parquet preview sample.',
    };
  }
}

function hdfsDatasetUri(): string {
  return `hdfs://${PARQUET_HDFS_PATH}`;
}

function buildYearSummaries(partitions: ParquetPartition[]): ParquetYearSummary[] {
  const grouped = new Map<number, ParquetPartition[]>();
  for (const partition of partitions) {
    const bucket = grouped.get(partition.year) ?? [];
    bucket.push(partition);
    grouped.set(partition.year, bucket);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => {
      const sortedMonths = [...months].sort((a, b) => Number(a.month) - Number(b.month));
      const rows = sortedMonths.map(month => month.rowCount);
      return {
        year,
        partitionCount: sortedMonths.length,
        fileCount: sortedMonths.reduce((sum, month) => sum + month.fileCount, 0),
        sizeBytes: sortedMonths.reduce((sum, month) => sum + month.sizeBytes, 0),
        rowCount: rows.every(value => value != null)
          ? rows.reduce<number>((sum, value) => sum + (value ?? 0), 0)
          : null,
        months: sortedMonths,
      };
    });
}

function emptyMetadata(partial: Partial<ParquetMetadata> = {}): ParquetMetadata {
  return {
    available: false,
    source: 'none',
    degraded: false,
    errorKind: 'not_generated',
    message: null,
    detail: null,
    datasetPath: hdfsDatasetUri(),
    hdfsPath: PARQUET_HDFS_PATH,
    format: 'parquet',
    compression: null,
    compressionVerified: false,
    compressionSource: null,
    partitionColumns: ['year', 'month'],
    totalPartitions: 0,
    totalFiles: 0,
    totalSizeBytes: 0,
    totalRows: null,
    rowCountType: null,
    schema: [],
    partitions: [],
    years: [],
    generatedAt: null,
    lastModified: null,
    manifestGeneratedAt: null,
    manifestMatchesDataset: false,
    jobId: null,
    sparkVersion: null,
    rawRows: null,
    incompleteRows: null,
    inspectedAt: new Date().toISOString(),
    ...partial,
  };
}

function buildFromListing(
  listing: Extract<HdfsListing, { ok: true }>,
  manifest: ParquetManifest | null,
  manifestError: string | null
): ParquetMetadata {
  const totalFiles = listing.files.length;
  const totalSizeBytes = listing.files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const manifestMatchesDataset =
    !!manifest &&
    manifest.hdfsPath === PARQUET_HDFS_PATH &&
    manifest.totalFiles === totalFiles &&
    manifest.totalSizeBytes === totalSizeBytes;

  const manifestPartitions = new Map<string, ParquetPartition>();
  if (manifestMatchesDataset && manifest) {
    for (const partition of manifest.partitions) {
      manifestPartitions.set(`${partition.year}-${partition.month}`, partition);
    }
  }

  const groups = new Map<string, HdfsFileRecord[]>();
  for (const file of listing.files) {
    const key = `${file.year}-${file.month}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(file);
    groups.set(key, bucket);
  }

  const partitions: ParquetPartition[] = [...groups.entries()]
    .sort(([a], [b]) => {
      const [aYear, aMonth] = a.split('-').map(Number);
      const [bYear, bMonth] = b.split('-').map(Number);
      return aYear - bYear || aMonth - bMonth;
    })
    .map(([key, records]) => {
      const [year, month] = key.split('-');
      const sortedFiles = [...records].sort((a, b) => a.name.localeCompare(b.name));
      const manifestPartition = manifestPartitions.get(key);
      const rowCount = manifestPartition?.rowCount ?? null;
      const rowCountType = rowCount != null ? manifestPartition?.rowCountType ?? 'exact' : null;
      const modified = sortedFiles
        .map(file => file.lastModified)
        .filter(Boolean)
        .sort()
        .pop();

      return {
        year: Number(year),
        month,
        path: manifestPartition?.path ?? `${hdfsDatasetUri()}/year=${year}/month=${month}`,
        fileCount: sortedFiles.length,
        sizeBytes: sortedFiles.reduce((sum, file) => sum + file.sizeBytes, 0),
        rowCount,
        rowCountType,
        lastModified: modified ?? null,
        files: sortedFiles.map(file => ({
          name: file.name,
          path: file.path,
          sizeBytes: file.sizeBytes,
          lastModified: file.lastModified,
        })),
      };
    });

  const lastModified =
    listing.files
      .map(file => file.lastModified)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

  const hasManifest = !!manifest;
  const degraded = !manifestMatchesDataset;
  let message: string | null = null;

  if (manifestError) {
    message = `The Parquet files were inspected, but the metadata manifest could not be read: ${manifestError}`;
  } else if (!hasManifest) {
    message =
      'Parquet files were found in HDFS, but no Spark metadata manifest exists yet. Generate the dataset from this page to record schema, exact row counts and samples.';
  } else if (!manifestMatchesDataset) {
    message =
      'The HDFS listing no longer matches the last Spark manifest. Live file sizes are shown, but row counts and schema are marked unavailable until you regenerate.';
  }

  return emptyMetadata({
    available: true,
    source: 'hdfs',
    degraded,
    errorKind: 'none',
    message,
    datasetPath:
      manifest && manifest.hdfsPath === PARQUET_HDFS_PATH ? manifest.datasetPath : hdfsDatasetUri(),
    compression: manifestMatchesDataset ? manifest?.compression ?? null : null,
    compressionVerified: manifestMatchesDataset ? !!manifest?.compressionVerified : false,
    compressionSource: manifestMatchesDataset ? manifest?.compressionSource ?? null : null,
    totalPartitions: partitions.length,
    totalFiles,
    totalSizeBytes,
    totalRows: manifestMatchesDataset ? manifest?.totalRows ?? null : null,
    rowCountType: manifestMatchesDataset ? manifest?.rowCountType ?? null : null,
    schema: manifestMatchesDataset ? manifest?.schema ?? [] : [],
    partitions,
    years: buildYearSummaries(partitions),
    generatedAt: manifest?.generatedAt ?? null,
    lastModified,
    manifestGeneratedAt: manifest?.generatedAt ?? null,
    manifestMatchesDataset,
    jobId: manifestMatchesDataset ? manifest?.jobId ?? null : null,
    sparkVersion: manifestMatchesDataset ? manifest?.sparkVersion ?? null : null,
    rawRows: manifestMatchesDataset ? manifest?.rawRows ?? null : null,
    incompleteRows: manifestMatchesDataset ? manifest?.incompleteRows ?? null : null,
  });
}

function buildManifestFallback(
  manifest: ParquetManifest,
  detail: string | null
): ParquetMetadata {
  const partitions = manifest.partitions.map(partition => ({
    ...partition,
    month: partition.month.padStart(2, '0'),
  }));

  return emptyMetadata({
    available: true,
    source: 'manifest',
    degraded: true,
    errorKind: 'hdfs_unavailable',
    message:
      'HDFS is currently unreachable. This explorer is showing the last Spark-generated metadata manifest; file sizes and partitions were recorded during that real run.',
    detail,
    datasetPath: manifest.datasetPath,
    compression: manifest.compression,
    compressionVerified: manifest.compressionVerified,
    compressionSource: manifest.compressionSource,
    totalPartitions: manifest.totalPartitions,
    totalFiles: manifest.totalFiles,
    totalSizeBytes: manifest.totalSizeBytes,
    totalRows: manifest.totalRows,
    rowCountType: manifest.rowCountType,
    schema: manifest.schema,
    partitions,
    years: buildYearSummaries(partitions),
    generatedAt: manifest.generatedAt,
    lastModified: manifest.lastModified ?? null,
    manifestGeneratedAt: manifest.generatedAt,
    manifestMatchesDataset: false,
    jobId: manifest.jobId,
    sparkVersion: manifest.sparkVersion ?? null,
    rawRows: manifest.rawRows ?? null,
    incompleteRows: manifest.incompleteRows ?? null,
  });
}

export async function inspectParquet(): Promise<ParquetMetadata> {
  const manifestRead = await readManifest();
  const manifest = manifestRead.manifest;

  let listing: HdfsListing;
  try {
    listing = await listParquetFiles();
  } catch (error) {
    listing = {
      ok: false,
      kind: 'unavailable',
      message: 'HDFS inspection failed unexpectedly.',
      detail: error instanceof Error ? error.message : String(error),
      target: null,
    };
  }

  if (listing.ok) {
    return buildFromListing(listing, manifest, manifestRead.error);
  }

  if (listing.kind === 'empty') {
    return emptyMetadata({
      errorKind: 'empty',
      message: `${PARQUET_HDFS_PATH} exists but contains no Parquet files. Generate the dataset to create real partitions.`,
      detail: listing.detail,
      manifestGeneratedAt: manifest?.generatedAt ?? null,
    });
  }

  if (listing.kind === 'missing') {
    return emptyMetadata({
      errorKind: 'not_generated',
      message: `No Parquet dataset was found at ${PARQUET_HDFS_PATH}.`,
      detail: manifest
        ? `A manifest from ${manifest.generatedAt} exists, but HDFS was inspected and no Parquet files are currently present.`
        : null,
      manifestGeneratedAt: manifest?.generatedAt ?? null,
    });
  }

  if (manifest) {
    return buildManifestFallback(manifest, listing.detail);
  }

  return emptyMetadata({
    errorKind: 'hdfs_unavailable',
    message:
      'HDFS is unavailable and no metadata manifest has been generated yet. Start the HDFS/Spark cluster, then generate the Parquet dataset.',
    detail: listing.detail,
  });
}

export function buildSchemaResponse(metadata: ParquetMetadata): ParquetSchemaResponse {
  const available = metadata.schema.length > 0;
  return {
    available,
    message: available
      ? metadata.available
        ? null
        : metadata.message
      : metadata.message ??
        'No Parquet schema is recorded. Generate the dataset so Spark can capture the real schema.',
    datasetPath: metadata.datasetPath,
    compression: metadata.compression,
    compressionVerified: metadata.compressionVerified,
    compressionSource: metadata.compressionSource,
    partitionColumns: metadata.partitionColumns,
    schema: metadata.schema,
    generatedAt: metadata.generatedAt,
    jobId: metadata.jobId,
    totalRows: metadata.totalRows,
    rowCountType: metadata.rowCountType,
    manifestMatchesDataset: metadata.manifestMatchesDataset,
  };
}

export async function buildPreviewResponse(
  year: number,
  month: string
): Promise<ParquetPreviewResponse> {
  const previewRead = await readPreviews();
  const key = `${year}-${month.padStart(2, '0')}`;

  if (!previewRead.previews) {
    return {
      available: false,
      message:
        previewRead.error ??
        'No bounded preview sample was recorded. Generate the Parquet dataset to sample actual rows with Spark.',
      year,
      month: month.padStart(2, '0'),
      limit: null,
      columns: [],
      records: [],
      generatedAt: null,
      jobId: null,
      source: null,
    };
  }

  const previews = previewRead.previews;
  const manifestRead = await readManifest();
  const manifest = manifestRead.manifest;

  // Refuse to present a sample from a previous generation as if it belonged
  // to the current dataset. This keeps the evidence view authoritative even
  // when Parquet was regenerated by the CLI or a prior dev-server session.
  const mismatch =
    previews.hdfsPath !== PARQUET_HDFS_PATH
      ? `The recorded sample belongs to ${previews.hdfsPath}, but this API inspects ${PARQUET_HDFS_PATH}. Regenerate the dataset from Storage Intelligence.`
      : !manifest
        ? 'No Spark manifest is available to validate the recorded sample against the current dataset. Regenerate the dataset to capture fresh samples.'
        : manifest.jobId !== previews.jobId
          ? `The recorded sample belongs to Spark job ${previews.jobId}, while the current manifest belongs to job ${manifest.jobId}. Regenerate the dataset to capture fresh samples.`
          : null;

  if (mismatch) {
    return {
      available: false,
      message: mismatch,
      year,
      month: key.split('-')[1],
      limit: previews.limit,
      columns: [],
      records: [],
      generatedAt: previews.generatedAt,
      jobId: previews.jobId,
      source: 'spark-sampled',
    };
  }

  const partition = previews.partitions[key];

  if (!partition) {
    return {
      available: false,
      message: `No preview sample exists for partition year=${year}/month=${key.split('-')[1]}.`,
      year,
      month: key.split('-')[1],
      limit: previews.limit,
      columns: [],
      records: [],
      generatedAt: previews.generatedAt,
      jobId: previews.jobId,
      source: 'spark-sampled',
    };
  }

  return {
    available: partition.records.length > 0,
    message:
      partition.records.length > 0
        ? null
        : partition.error ?? 'Spark returned no sample records for this partition.',
    year,
    month: key.split('-')[1],
    limit: previews.limit,
    columns: partition.columns,
    records: partition.records,
    generatedAt: previews.generatedAt,
    jobId: previews.jobId,
    source: 'spark-sampled',
  };
}

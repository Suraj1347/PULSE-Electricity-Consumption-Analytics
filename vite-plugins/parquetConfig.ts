import * as fs from 'node:fs';
import * as path from 'node:path';

// Fixed server-side configuration for the Storage Intelligence control plane.
// Nothing here is accepted from the browser: the client can only trigger the
// predefined Spark service and read metadata from the fixed Parquet location.

export const PROJECT_ROOT = process.cwd();

// Docker Desktop is normally installed in one of these locations. Node does
// not always inherit a freshly updated Windows PATH (for example, an already
// running VS Code/Vite process), so resolve the real executable explicitly
// instead of relying on a bare `docker` lookup.
const DOCKER_RELATIVE_PATHS = [
  path.join('Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
  path.join('Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
];

export function findDockerExecutable(): string | null {
  const explicit = process.env.PULSE_DOCKER_PATH?.trim();
  if (explicit && fs.existsSync(explicit)) return explicit;

  const roots = [
    process.env.ProgramFiles,
    process.env.ProgramW6432,
    process.env.LOCALAPPDATA,
    process.env.ProgramData,
    'C:\\Program Files',
  ].filter((value): value is string => Boolean(value));

  for (const root of roots) {
    for (const relative of DOCKER_RELATIVE_PATHS) {
      const candidate = path.join(root, relative);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry.replace(/^"|"$/g, ''), 'docker.exe');
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function dockerExecutable(): string {
  return findDockerExecutable() ?? 'docker';
}

const RESERVED_HDFS_PREFIXES = ['/pulse/raw', '/pulse/output'];

function normalizeHdfsPath(raw: string): string {
  const withoutScheme = raw.replace(/^hdfs:\/\/[^/]*/i, '').trim();
  const normalized = `/${withoutScheme.replace(/^\/+|\/+$/g, '')}`;

  if (
    !/^\/[A-Za-z0-9_.=-]+(?:\/[A-Za-z0-9_.=-]+)*$/.test(normalized) ||
    normalized.split('/').includes('..') ||
    normalized === '/' ||
    normalized === '/pulse' ||
    RESERVED_HDFS_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix}/`))
  ) {
    console.warn(
      `[parquet] Ignoring unsafe PULSE_PARQUET_HDFS_PATH="${raw}". Using /pulse/parquet.`
    );
    return '/pulse/parquet';
  }

  return normalized;
}

function normalizeRawInput(raw: string): string {
  if (
    !raw ||
    !(raw.startsWith('hdfs://') || raw.startsWith('/pulse/')) ||
    /\s/.test(raw) ||
    raw.includes('..')
  ) {
    console.warn(
      `[parquet] Ignoring unsafe PULSE_RAW_INPUT="${raw}". Using the default HDFS dataset path.`
    );
    return 'hdfs:///pulse/raw/household_power_consumption.txt';
  }
  return raw;
}

export const PARQUET_HDFS_PATH = normalizeHdfsPath(
  process.env.PULSE_PARQUET_HDFS_PATH ?? '/pulse/parquet'
);

export const RAW_INPUT = normalizeRawInput(
  process.env.PULSE_RAW_INPUT ?? 'hdfs:///pulse/raw/household_power_consumption.txt'
);

export const PARQUET_APP_DIR = path.resolve(
  PROJECT_ROOT,
  process.env.PULSE_PARQUET_APP_DIR ?? path.join('public', 'data', 'parquet')
);

export const MANIFEST_FILE = path.join(PARQUET_APP_DIR, 'manifest.json');
export const PREVIEWS_FILE = path.join(PARQUET_APP_DIR, 'previews.json');
export const LAST_JOB_FILE = path.join(PARQUET_APP_DIR, 'last_job.json');

export const NAMENODE_CONTAINER = process.env.PULSE_NAMENODE_CONTAINER ?? 'pulse-namenode';

export const REQUIRED_DOCKER_SERVICES = [
  'pulse-namenode',
  'pulse-datanode1',
  'pulse-datanode2',
  'pulse-datanode3',
  'pulse-spark-master',
  'pulse-spark-worker1',
  'pulse-spark-worker2',
] as const;

export const DOCKER_START_HINT =
  'docker compose up -d namenode datanode1 datanode2 datanode3 spark-master spark-worker1 spark-worker2';

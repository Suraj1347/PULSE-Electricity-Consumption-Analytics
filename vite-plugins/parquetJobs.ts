import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import {
  DOCKER_START_HINT,
  LAST_JOB_FILE,
  PARQUET_HDFS_PATH,
  PROJECT_ROOT,
  RAW_INPUT,
  REQUIRED_DOCKER_SERVICES,
  findDockerExecutable,
} from './parquetConfig.ts';
import type {
  ParquetJobRunner,
  ParquetJobStage,
  ParquetJobState,
  ParquetJobView,
} from './parquetTypes.ts';

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const MAX_LOG_CHARS = 400_000;
const VIEW_LOG_CHARS = 80_000;
const PERSISTED_LOG_CHARS = 60_000;
const JOB_TIMEOUT_MS = 30 * 60 * 1000;
const VALID_STAGES: ParquetJobStage[] = [
  'prepare',
  'validate',
  'write',
  'inspect',
  'preview',
  'manifest',
  'done',
  'failed',
];

interface InternalJob {
  id: string;
  status: ParquetJobState;
  stage: ParquetJobStage;
  runner: ParquetJobRunner;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  logs: string;
  logBytes: number;
  logTruncated: boolean;
  error: string | null;
  child: ChildProcess | null;
  timer: NodeJS.Timeout | null;
  finished: boolean;
  timedOut: boolean;
}

export interface StartJobResult {
  ok: boolean;
  status: number;
  job?: ParquetJobView;
  error?: string;
  detail?: string;
}

interface DockerState {
  ok: boolean;
  missing: string[];
  error?: string;
  command?: string;
}

function clean(value: string): string {
  return value.replace(ANSI_RE, '');
}

function nowIso(): string {
  return new Date().toISOString();
}

function firstLine(value: string): string {
  return (
    clean(value)
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(Boolean) ?? ''
  );
}

function extractStage(logs: string): ParquetJobStage | null {
  const matches = [...logs.matchAll(/\[PULSE\] STAGE ([a-z]+)/gi)];
  if (matches.length === 0) return null;
  const stage = matches[matches.length - 1][1].toLowerCase() as ParquetJobStage;
  return VALID_STAGES.includes(stage) ? stage : null;
}

function extractError(logs: string): string {
  const lines = clean(logs)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const marker = line.indexOf('[PULSE] ERROR:');
    if (marker >= 0) return line.slice(marker + '[PULSE] ERROR:'.length).trim().slice(0, 600);
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (
      /(error|exception|failed|cannot|unavailable|refused)/i.test(line) &&
      !/^(?:\d{2}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/.test(line)
    ) {
      return line.slice(0, 600);
    }
  }

  return lines.length > 0 ? lines[lines.length - 1].slice(0, 600) : '';
}

function execFilePromise(
  command: string,
  args: string[],
  timeout: number
): Promise<{ ok: boolean; stdout: string; stderr: string; error: string }> {
  return new Promise(resolve => {
    execFile(
      command,
      args,
      { cwd: PROJECT_ROOT, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: clean(stdout ?? ''),
          stderr: clean(stderr ?? ''),
          error: error ? firstLine(error.message) : '',
        });
      }
    );
  });
}

function parseComposeRows(stdout: string): Array<{ Name?: string; State?: string }> {
  const text = stdout.trim();
  if (!text) return [];
  try {
    if (text.startsWith('[')) {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    // fall through to line-delimited JSON
  }

  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as { Name?: string; State?: string };
      } catch {
        return null;
      }
    })
    .filter((row): row is { Name?: string; State?: string } => !!row);
}

async function inspectDockerCluster(): Promise<DockerState> {
  const command = findDockerExecutable();
  if (!command) {
    return {
      ok: false,
      missing: [...REQUIRED_DOCKER_SERVICES],
      error:
        'The Docker CLI could not be found. Install or start Docker Desktop, or set PULSE_DOCKER_PATH to docker.exe.',
    };
  }

  const result = await execFilePromise(
    command,
    ['compose', 'ps', '--all', '--format', 'json'],
    20_000
  );

  if (!result.ok) {
    return {
      ok: false,
      missing: [...REQUIRED_DOCKER_SERVICES],
      error: result.error || firstLine(result.stderr) || 'Docker Compose is unavailable.',
      command,
    };
  }

  const rows = parseComposeRows(result.stdout);
  const states = new Map<string, string>();
  for (const row of rows) {
    if (row.Name) states.set(row.Name, (row.State ?? '').toLowerCase());
  }

  const missing = REQUIRED_DOCKER_SERVICES.filter(service => states.get(service) !== 'running');
  return { ok: true, missing, command };
}

export class ParquetJobManager {
  private active: InternalJob | null = null;
  private last: InternalJob | null = null;
  private starting = false;
  private persistedLoaded = false;
  private persistedPromise: Promise<void> | null = null;

  private toView(job: InternalJob): ParquetJobView {
    const logTail = job.logs.slice(-VIEW_LOG_CHARS);
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      runner: job.runner,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      exitCode: job.exitCode,
      logTail,
      logBytes: job.logBytes,
      logTruncated: job.logTruncated || job.logs.length > VIEW_LOG_CHARS,
      error: job.error,
    };
  }

  private fromView(view: ParquetJobView): InternalJob {
    return {
      id: view.id,
      status: view.status,
      stage: view.stage,
      runner: view.runner,
      startedAt: view.startedAt,
      completedAt: view.completedAt,
      exitCode: view.exitCode,
      logs: view.logTail,
      logBytes: view.logBytes,
      logTruncated: view.logTruncated,
      error: view.error,
      child: null,
      timer: null,
      finished: true,
      timedOut: false,
    };
  }

  private async loadPersisted(): Promise<void> {
    if (this.persistedLoaded || this.last) return;
    if (!this.persistedPromise) {
      this.persistedPromise = (async () => {
        try {
          const text = await readFile(LAST_JOB_FILE, 'utf8');
          const parsed = JSON.parse(text) as ParquetJobView;
          if (
            typeof parsed.id === 'string' &&
            (parsed.status === 'completed' || parsed.status === 'failed') &&
            VALID_STAGES.includes(parsed.stage) &&
            (parsed.runner === 'docker' || parsed.runner === 'local') &&
            typeof parsed.startedAt === 'string' &&
            typeof parsed.logTail === 'string' &&
            typeof parsed.logBytes === 'number' &&
            typeof parsed.logTruncated === 'boolean'
          ) {
            this.last = this.fromView(parsed);
          }
        } catch {
          // No previous job record, or it is unreadable. This is not an error.
        } finally {
          this.persistedLoaded = true;
        }
      })();
    }
    await this.persistedPromise;
  }

  private async persist(job: InternalJob): Promise<void> {
    const view = this.toView(job);
    try {
      await mkdir(path.dirname(LAST_JOB_FILE), { recursive: true });
      const trimmed: ParquetJobView = {
        ...view,
        logTail: view.logTail.slice(-PERSISTED_LOG_CHARS),
        logTruncated: view.logTruncated || view.logTail.length > PERSISTED_LOG_CHARS,
      };
      await writeFile(LAST_JOB_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch {
      // Job evidence persistence is best-effort; the live API still has the job.
    }
  }

  async getJob(): Promise<ParquetJobView | null> {
    if (this.active) return this.toView(this.active);
    if (this.last) return this.toView(this.last);
    await this.loadPersisted();
    return this.last ? this.toView(this.last) : null;
  }

  async start(): Promise<StartJobResult> {
    if (this.active && this.active.status === 'running') {
      return {
        ok: false,
        status: 409,
        job: this.toView(this.active),
        error: 'A Parquet generation job is already running.',
      };
    }

    if (this.starting) {
      return {
        ok: false,
        status: 409,
        error: 'A Parquet generation request is already starting.',
      };
    }

    this.starting = true;
    try {
      const mode = (process.env.PULSE_PARQUET_RUNNER ?? 'auto').toLowerCase();
      let runner: ParquetJobRunner;
      let dockerCommand: string | null = null;

      if (mode === 'local') {
        runner = 'local';
      } else {
        const docker = await inspectDockerCluster();
        if (!docker.ok) {
          return {
            ok: false,
            status: 503,
            error:
              'Docker Compose could not be queried. Start Docker Desktop and the PULSE HDFS/Spark cluster.',
            detail: docker.error,
          };
        }

        if (docker.missing.length > 0) {
          return {
            ok: false,
            status: 503,
            error: `The PULSE Docker cluster is not fully running. Missing or stopped: ${docker.missing.join(
              ', '
            )}.`,
            detail: `Start it with: ${DOCKER_START_HINT}`,
          };
        }

        dockerCommand = docker.command ?? null;
        if (!dockerCommand) {
          return {
            ok: false,
            status: 503,
            error:
              'The Docker CLI could not be resolved. Install or start Docker Desktop, or set PULSE_DOCKER_PATH to docker.exe.',
          };
        }

        runner = 'docker';
      }

      const id = `pq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const job: InternalJob = {
        id,
        status: 'running',
        stage: 'prepare',
        runner,
        startedAt: nowIso(),
        completedAt: null,
        exitCode: null,
        logs: '',
        logBytes: 0,
        logTruncated: false,
        error: null,
        child: null,
        timer: null,
        finished: false,
        timedOut: false,
      };

      const command =
        runner === 'docker'
          ? dockerCommand ?? 'docker'
          : process.env.PULSE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
      const args =
        runner === 'docker'
          ? [
              'compose',
              '--profile',
              'tools',
              'run',
              '--build',
              '--rm',
              '-T',
              '-e',
              `PULSE_PARQUET_JOB_ID=${id}`,
              '-e',
              `PULSE_PARQUET_HDFS_PATH=${PARQUET_HDFS_PATH}`,
              '-e',
              `PULSE_RAW_INPUT=${RAW_INPUT}`,
              'spark-parquet',
            ]
          : ['spark_parquet.py'];

      const child = spawn(command, args, {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          PULSE_PARQUET_JOB_ID: id,
          PULSE_PARQUET_HDFS_PATH: PARQUET_HDFS_PATH,
          PULSE_RAW_INPUT: RAW_INPUT,
          PYTHONUNBUFFERED: '1',
        },
        shell: false,
        windowsHide: true,
      });

      job.child = child;
      this.active = job;
      this.last = job;
      this.persistedLoaded = true;

      const append = (chunk: Buffer | string) => {
        const text = clean(chunk.toString());
        if (!text) return;
        job.logBytes += Buffer.byteLength(text, 'utf8');
        job.logs += text;
        if (job.logs.length > MAX_LOG_CHARS) {
          job.logs = job.logs.slice(-MAX_LOG_CHARS);
          job.logTruncated = true;
        }
        const detectedStage = extractStage(job.logs);
        if (detectedStage) job.stage = detectedStage;
      };

      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      job.timer = setTimeout(() => {
        if (job.finished) return;
        job.timedOut = true;
        job.error = `Generation timed out after ${JOB_TIMEOUT_MS / 60000} minutes.`;
        append(`\n[PULSE] ERROR: ${job.error}\n`);
        try {
          child.kill();
        } catch {
          // ignore kill failures; the close handler below still finalizes state
        }
      }, JOB_TIMEOUT_MS);

      child.on('error', error => {
        const code = (error as NodeJS.ErrnoException).code;
        const hint =
          code === 'ENOENT'
            ? `Docker executable not found at "${command}". Install Docker Desktop or set PULSE_DOCKER_PATH.`
            : code === 'EINVAL'
              ? `Windows could not start "${command}". Check that the executable path and working directory are valid.`
              : error.message;
        append(`\n[PULSE] ERROR: Could not start the ${runner} job: ${hint}\n`);
        this.finish(job, null, 'spawn-error');
      });

      child.on('close', (code, signal) => {
        this.finish(job, code, signal);
      });

      return { ok: true, status: 202, job: this.toView(job) };
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: 'The Parquet generation job could not be started.',
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.starting = false;
    }
  }

  private finish(job: InternalJob, code: number | null, signal: NodeJS.Signals | string | null): void {
    if (job.finished) return;
    job.finished = true;
    job.completedAt = nowIso();
    job.exitCode = code;

    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }

    if (job.timedOut) {
      job.status = 'failed';
      job.stage = 'failed';
      job.error = job.error ?? 'Generation timed out.';
    } else if (code === 0) {
      job.status = 'completed';
      job.stage = 'done';
      job.error = null;
    } else {
      job.status = 'failed';
      job.stage = 'failed';
      const signalText = signal ? ` (signal ${String(signal)})` : '';
      job.error =
        extractError(job.logs) ||
        `The Spark Parquet job exited with code ${code ?? 'unknown'}${signalText}.`;
    }

    this.active = null;
    this.last = job;
    void this.persist(job);
  }

  shutdown(): void {
    if (this.active?.child) {
      try {
        this.active.child.kill();
      } catch {
        // best effort on dev-server shutdown
      }
    }
  }
}

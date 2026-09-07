import { execFile, spawn } from 'node:child_process';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Dev-only control plane for the optional Kafka streaming profile. Lets the
// dashboard start/stop `docker compose --profile streaming` without a
// terminal. Only mounted by vite's dev server middleware (see
// configureServer below) — never present in a production build/preview.

const SERVICES = [
  { key: 'kafka', container: 'pulse-kafka' },
  { key: 'kafka-producer', container: 'pulse-kafka-producer' },
  { key: 'spark-streaming', container: 'pulse-spark-streaming' },
] as const;

function execFilePromise(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: process.cwd(), timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

async function getStatus() {
  let stdout = '';
  try {
    ({ stdout } = await execFilePromise('docker', ['compose', 'ps', '--all', '--format', 'json']));
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), services: [] };
  }

  const rows = stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter((r): r is { Name: string; State: string } => !!r);

  const services = SERVICES.map(s => {
    const row = rows.find(r => r.Name === s.container);
    return { key: s.key, container: s.container, state: row ? row.State : 'not_created' };
  });

  const anyRunning = services.some(s => s.state === 'running');
  const allRunning = services.every(s => s.state === 'running');
  return { services, anyRunning, allRunning };
}

function runDetached(args: string[]) {
  const child = spawn('docker', args, { cwd: process.cwd(), stdio: 'ignore', detached: true });
  child.unref();
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function handle(server: ViteDevServer) {
  server.middlewares.use('/api/streaming/status', async (_req: IncomingMessage, res: ServerResponse) => {
    sendJson(res, 200, await getStatus());
  });

  server.middlewares.use('/api/streaming/start', (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    runDetached(['compose', '--profile', 'streaming', 'up', '-d']);
    sendJson(res, 202, { ok: true, action: 'start' });
  });

  server.middlewares.use('/api/streaming/stop', (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    runDetached(['compose', '--profile', 'streaming', 'stop']);
    sendJson(res, 202, { ok: true, action: 'stop' });
  });
}

export function dockerControlPlugin(): Plugin {
  return {
    name: 'pulse-docker-control',
    apply: 'serve',
    configureServer(server) {
      handle(server);
    },
  };
}

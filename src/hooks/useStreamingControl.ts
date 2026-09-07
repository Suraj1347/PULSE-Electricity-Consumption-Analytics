import { useCallback, useEffect, useRef, useState } from 'react';

interface ServiceStatus {
  key: string;
  container: string;
  state: string;
}

interface StatusResponse {
  services: ServiceStatus[];
  anyRunning?: boolean;
  allRunning?: boolean;
  error?: string;
}

export type StreamingPhase = 'unknown' | 'stopped' | 'starting' | 'running' | 'stopping' | 'unavailable';

const POLL_MS = 3000;

export function useStreamingControl() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [pending, setPending] = useState<'start' | 'stop' | null>(null);
  const pendingSinceRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/streaming/status', { cache: 'no-store' });
      const body: StatusResponse = await res.json();
      setStatus(body);
      if (pending === 'start' && body.allRunning) setPending(null);
      if (pending === 'stop' && !body.anyRunning) setPending(null);
      // give up waiting on a pending action after 3 minutes so the UI never gets stuck
      if (pending && Date.now() - pendingSinceRef.current > 180000) setPending(null);
    } catch {
      setStatus({ services: [], error: 'unreachable' });
    }
  }, [pending]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const start = useCallback(async () => {
    pendingSinceRef.current = Date.now();
    setPending('start');
    try {
      await fetch('/api/streaming/start', { method: 'POST' });
    } catch {
      setPending(null);
    }
  }, []);

  const stop = useCallback(async () => {
    pendingSinceRef.current = Date.now();
    setPending('stop');
    try {
      await fetch('/api/streaming/stop', { method: 'POST' });
    } catch {
      setPending(null);
    }
  }, []);

  // 'starting'/'stopping' only reflect an action *we* just triggered — not
  // a bare poll finding a partial state (e.g. one container crashed on its
  // own). A partial state outside of our own pending action is just
  // "stopped": `docker compose up -d` is idempotent and will bring back
  // only what's missing, so Start stays the correct, enabled action.
  let phase: StreamingPhase = 'unknown';
  if (status?.error) phase = 'unavailable';
  else if (pending === 'start') phase = 'starting';
  else if (pending === 'stop') phase = 'stopping';
  else if (status?.allRunning) phase = 'running';
  else if (status) phase = 'stopped';

  return { phase, status, start, stop };
}

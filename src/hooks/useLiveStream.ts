import { useEffect, useRef, useState } from 'react';
import type { LiveStreamPayload } from '../types/analytics';

const POLL_INTERVAL_MS = 2000;
const STALE_AFTER_MS = 10000;

interface LiveStreamState {
  data: LiveStreamPayload | null;
  connected: boolean;
}

export function useLiveStream(): LiveStreamState {
  const [data, setData] = useState<LiveStreamPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/data/live_stream.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const payload: LiveStreamPayload = await res.json();
        if (cancelled) return;
        setData(payload);
        lastUpdateRef.current = Date.now();
        setConnected(true);
      } catch {
        if (cancelled) return;
        if (Date.now() - lastUpdateRef.current > STALE_AFTER_MS) {
          setConnected(false);
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { data, connected };
}

import { AnimatePresence, motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { useLiveStream } from '../hooks/useLiveStream';
import { useSmoothClock } from '../hooks/useSmoothClock';
import { useStreamingControl } from '../hooks/useStreamingControl';
import SectionReveal from '../components/SectionReveal/SectionReveal';
import './LiveStream.css';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Raw dataset format: "DD/MM/YYYY HH:MM:SS"
function parseSimTimestamp(ts: string): number {
  const [datePart, timePart] = ts.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hh, mm, ss] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hh, mm, ss).getTime() / 1000;
}

function formatSimTimestamp(epochSeconds: number) {
  const d = new Date(Math.round(epochSeconds) * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    date: `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  };
}

const CONTROL_LABEL: Record<string, string> = {
  stopped: 'START STREAMING',
  starting: 'STARTING…',
  running: 'STOP STREAMING',
  stopping: 'STOPPING…',
  unknown: '…',
};

export default function LiveStream() {
  const { data, connected } = useLiveStream();
  const { phase, start, stop } = useStreamingControl();

  const chartData = (data?.recent ?? []).map((r, i) => ({ i, power: r.global_active_power }));
  const targetEpoch = data ? parseSimTimestamp(data.latest.timestamp) : null;
  const smoothEpoch = useSmoothClock(targetEpoch);
  const clock = smoothEpoch != null ? formatSimTimestamp(smoothEpoch) : null;

  return (
    <section className="live">
      <div className="live-atmo" />
      <div className="live-inner">
        <SectionReveal>
          <div className="live-header">
            <div>
              <span className="pulse-section-num">07</span>
              <h2 className="pulse-section-title">LIVE STREAM</h2>
            </div>
            <p className="live-subtitle">
              household_power_consumption.txt replayed through Kafka and consumed live by Spark Structured Streaming — no static files, updating every few seconds.
            </p>
          </div>
        </SectionReveal>

        <SectionReveal delay={0.1}>
          <div className="live-control-row">
            <div className="live-status-row">
              <span className={`live-status-dot ${connected ? 'live-status-dot--on' : ''}`} />
              <span className="live-status-text">{connected ? 'LIVE' : 'WAITING FOR STREAM'}</span>
              <span className="live-status-sep">/</span>
              <span className="live-status-text live-status-text--dim">Kafka</span>
              <span className="live-status-arrow">&rarr;</span>
              <span className="live-status-text live-status-text--dim">Spark Structured Streaming</span>
              <span className="live-status-arrow">&rarr;</span>
              <span className="live-status-text live-status-text--dim">this page</span>
            </div>

            {phase !== 'unavailable' && (
              <button
                className={`live-control-btn ${phase === 'running' ? 'live-control-btn--stop' : ''}`}
                disabled={phase === 'starting' || phase === 'stopping' || phase === 'unknown'}
                onClick={phase === 'running' ? stop : start}
              >
                {CONTROL_LABEL[phase]}
              </button>
            )}
          </div>
        </SectionReveal>

        {clock && (
          <SectionReveal delay={0.12}>
            <div className="live-clock">
              <span className="live-clock-tag">SIMULATED CLOCK — REPLAYING 2006–2010 DATA</span>
              <div className="live-clock-row">
                <span className="live-clock-time">{clock.time}</span>
                <span className="live-clock-date">{clock.date}</span>
              </div>
            </div>
          </SectionReveal>
        )}

        {!connected && !data && (
          <div className="live-empty">
            {phase === 'unavailable'
              ? <>No live data yet. Start it from a terminal: <code>docker compose --profile streaming up -d</code></>
              : phase === 'starting'
                ? 'Starting Kafka + Spark Streaming — first start can take ~60–90s while the Spark job resolves its Kafka connector.'
                : 'No live data yet. Press Start Streaming above.'}
          </div>
        )}

        {data && (
          <>
            <SectionReveal delay={0.15}>
              <div className="live-grid">
                <div className="live-card live-card--primary">
                  <div className="live-card-header">
                    <span className="live-card-label">CURRENT DRAW</span>
                    <span className="live-card-badge">{connected ? 'STREAMING' : 'STALE'}</span>
                  </div>
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={data.latest.timestamp + data.batch_id}
                      className="live-card-value-row"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE }}
                    >
                      <span className="live-card-value">{data.latest.global_active_power.toFixed(3)}</span>
                      <span className="live-card-unit">kW</span>
                    </motion.div>
                  </AnimatePresence>
                  <span className="live-card-sub">instantaneous, this micro-batch</span>
                </div>

                <div className="live-card">
                  <div className="live-card-header">
                    <span className="live-card-label">WINDOW AVG</span>
                  </div>
                  <div className="live-card-value-row">
                    <span className="live-card-value">{data.avg_power_kw.toFixed(3)}</span>
                    <span className="live-card-unit">kW</span>
                  </div>
                  <span className="live-card-sub">last {data.buffer_size} readings</span>
                </div>

                <div className="live-card">
                  <div className="live-card-header">
                    <span className="live-card-label">WINDOW PEAK</span>
                  </div>
                  <div className="live-card-value-row">
                    <span className="live-card-value">{data.peak_power_kw.toFixed(3)}</span>
                    <span className="live-card-unit">kW</span>
                  </div>
                  <span className="live-card-sub">min {data.min_power_kw.toFixed(3)} kW</span>
                </div>

                <div className="live-card">
                  <div className="live-card-header">
                    <span className="live-card-label">MICRO-BATCH</span>
                  </div>
                  <div className="live-card-value-row">
                    <span className="live-card-value">#{data.batch_id}</span>
                  </div>
                  <span className="live-card-sub">+{data.new_in_batch} readings this batch</span>
                </div>
              </div>
            </SectionReveal>

            <SectionReveal delay={0.25}>
              <div className="live-chart-block">
                <div className="live-chart-header">
                  <span className="live-chart-label">GLOBAL ACTIVE POWER</span>
                  <span className="live-chart-tag">ROLLING BUFFER</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="liveGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis hide domain={['dataMin - 0.1', 'dataMax + 0.1']} />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: 11 }}
                      labelFormatter={() => ''}
                      formatter={(value) => [`${Number(value).toFixed(3)} kW`, 'power']}
                    />
                    <Area type="monotone" dataKey="power" stroke="var(--accent)" strokeWidth={1.5} fill="url(#liveGrad)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionReveal>
          </>
        )}
      </div>
    </section>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import './EmergenceIntro.css';

interface EmergenceIntroProps {
  onComplete: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  size: number;
  intensity: number;
  delay: number;
}

const FP: number[][] = [
  [0.5315,0.4503,0.4132,0.4235,0.4282,0.4167,0.8194,1.7175,1.4977,1.3737,1.1921,1.083,1.0644,0.8741,0.7577,0.7341,0.7068,0.7853,1.0928,1.5695,1.8911,1.9082,1.3905,0.8439],
  [0.608,0.4672,0.439,0.4259,0.4398,0.4271,0.8567,1.6865,1.6065,1.3425,1.2273,1.2488,1.2471,1.2007,1.0137,0.9288,0.8685,0.9146,1.1683,1.5857,1.8654,1.8457,1.4639,0.8005],
  [0.5637,0.4875,0.4744,0.3934,0.4047,0.4323,0.9052,1.782,1.6406,1.4211,1.2715,1.307,1.1706,1.1143,1.0712,0.9546,0.9195,0.9938,1.189,1.5851,1.7816,2.0047,1.3578,0.7593],
  [0.5718,0.467,0.438,0.399,0.4263,0.4462,0.8895,1.6844,1.5778,1.2945,1.1196,1.0072,0.911,0.8236,0.7057,0.6486,0.6347,0.699,1.0706,1.7399,1.9638,1.8669,1.3477,0.8191],
  [0.5674,0.4667,0.4117,0.4163,0.4295,0.4309,0.9052,1.7048,1.5771,1.4035,1.2754,1.1556,1.1495,1.0386,1.0007,0.9434,0.8855,1.0369,1.1929,1.5672,1.7019,1.6537,1.2972,0.8328],
  [0.6483,0.5306,0.4644,0.4595,0.4386,0.4808,0.5855,1.2645,1.4204,1.3851,1.4673,1.4697,1.3582,1.461,1.5182,1.3668,1.3764,1.5763,1.8477,2.0686,1.9363,1.772,1.6473,1.433],
  [1.1323,0.9116,0.7273,0.599,0.5411,0.5436,0.5722,0.6585,0.8976,1.098,1.2753,1.4565,1.5555,1.509,1.5254,1.37,1.2634,1.3936,1.7395,2.0275,2.1573,2.0926,1.3877,0.8346],
];

const MAX_KW = 2.1573;
const ROWS = 7;
const COLS = 24;
const SCATTER_N = 320;

function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.min(1, Math.max(0, t)); }
function easeOut(t: number) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
function easeInOut(t: number) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function clamp01(t: number) { return Math.min(1, Math.max(0, t)); }

function fpColor(intensity: number): [number, number, number] {
  if (intensity > 0.85) return [240, 180, 41];
  if (intensity > 0.5) return [0, 212, 170];
  return [0, 160, 135];
}

export default function EmergenceIntro({ onComplete }: EmergenceIntroProps) {
  const reducedMotion = useReducedMotion();
  const [done, setDone] = useState(reducedMotion);
  const [fading, setFading] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showSub, setShowSub] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const scatterRef = useRef<Particle[]>([]);
  const frameRef = useRef<number>(0);
  const t0Ref = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const initedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const init = useCallback((w: number, h: number) => {
    const pad = 0.12;
    const gw = w * (1 - pad * 2);
    const gh = h * 0.52;
    const gx = w * pad;
    const gy = h * 0.22;
    const cw = gw / COLS;
    const ch = gh / ROWS;

    const particles: Particle[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const val = FP[r][c];
        const a = Math.random() * Math.PI * 2;
        const d = 200 + Math.random() * 450;
        particles.push({
          x: w / 2 + Math.cos(a) * d,
          y: h / 2 + Math.sin(a) * d,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          targetX: gx + c * cw + cw / 2,
          targetY: gy + r * ch + ch / 2,
          size: 1.5 + (val / MAX_KW) * 3.5,
          intensity: val / MAX_KW,
          delay: (r * COLS + c) * 0.005,
        });
      }
    }
    particlesRef.current = particles;

    const scatter: Particle[] = [];
    for (let i = 0; i < SCATTER_N; i++) {
      scatter.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        targetX: 0, targetY: 0,
        size: 0.3 + Math.random() * 1,
        intensity: Math.random(),
        delay: Math.random() * 3,
      });
    }
    scatterRef.current = scatter;
    initedRef.current = true;
  }, []);

  const render = useCallback((ts: number) => {
    if (done) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const t = (ts - t0Ref.current) / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const particles = particlesRef.current;
    const scatter = scatterRef.current;
    const mx = (mouseRef.current.x - 0.5) * 12;
    const my = (mouseRef.current.y - 0.5) * 12;

    // ---- VOID (0-0.4s): single point ----
    if (t < 0.4) {
      const a = clamp01(t / 0.25);
      const sz = 1.5 + Math.sin(t * 6) * 0.5;
      ctx.beginPath();
      ctx.arc(w/2, h/2, sz, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0, 212, 170, ${a * 0.6})`;
      ctx.fill();
      const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, 40);
      g.addColorStop(0, `rgba(0, 212, 170, ${a * 0.1})`);
      g.addColorStop(1, 'rgba(0, 212, 170, 0)');
      ctx.beginPath();
      ctx.arc(w/2, h/2, 40, 0, Math.PI*2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // ---- EMERGE (0.3-2.8s): scattered particles ----
    if (t >= 0.3 && t < 3.0) {
      const eT = clamp01((t - 0.3) / 1.0);
      const sAlpha = easeOut(eT) * 0.32;
      scatter.forEach((p) => {
        p.x += p.vx + mx * 0.004;
        p.y += p.vy + my * 0.004;
        if (p.x < -15) p.x = w + 15;
        if (p.x > w + 15) p.x = -15;
        if (p.y < -15) p.y = h + 15;
        if (p.y > h + 15) p.y = -15;
        const fl = 0.6 + Math.sin(t * 1.5 + p.delay * 3.5) * 0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fillStyle = `rgba(0, 212, 170, ${sAlpha * fl})`;
        ctx.fill();
      });
    }

    // ---- FIELD (1.0-3.2s): core pulses ----
    if (t >= 1.0 && t < 3.2) {
      const cp = Math.sin(t * 3) * 0.3 + 0.7;
      ctx.beginPath();
      ctx.arc(w/2, h/2, 2.5 + cp * 2, 0, Math.PI*2);
      ctx.fillStyle = `rgba(0, 212, 170, ${cp * 0.7})`;
      ctx.fill();
      const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, 80);
      g.addColorStop(0, `rgba(0, 212, 170, ${cp * 0.08})`);
      g.addColorStop(1, 'rgba(0, 212, 170, 0)');
      ctx.beginPath();
      ctx.arc(w/2, h/2, 80, 0, Math.PI*2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // ---- SWEEP (2.8-4.6s): energy wave ----
    if (t >= 2.6 && t < 5.0) {
      const sweepT = clamp01((t - 2.6) / 1.8);
      const sx = lerp(-0.05, 1.05, easeInOut(sweepT)) * w;

      // Scatter before sweep
      if (t < 4.2) {
        scatter.forEach((p) => {
          const past = p.x < sx;
          const d = Math.abs(p.x - sx);
          const glow = d < 90 ? (1 - d / 90) * 0.45 : 0;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
          ctx.fillStyle = `rgba(0, 212, 170, ${past ? 0.08 : 0.25})`;
          ctx.fill();
          if (glow > 0) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size + 3, 0, Math.PI*2);
            ctx.fillStyle = `rgba(0, 212, 170, ${glow * 0.2})`;
            ctx.fill();
          }
        });
      }

      // Sweep line
      if (sweepT > 0.02 && sweepT < 0.98) {
        const lg = ctx.createLinearGradient(sx - 1, 0, sx + 1, 0);
        lg.addColorStop(0, 'rgba(0, 212, 170, 0)');
        lg.addColorStop(0.5, 'rgba(0, 212, 170, 0.85)');
        lg.addColorStop(1, 'rgba(0, 212, 170, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(sx - 1, 0, 3, h);
        const sg = ctx.createRadialGradient(sx, h/2, 0, sx, h/2, 140);
        sg.addColorStop(0, 'rgba(0, 212, 170, 0.05)');
        sg.addColorStop(1, 'rgba(0, 212, 170, 0)');
        ctx.beginPath();
        ctx.arc(sx, h/2, 140, 0, Math.PI*2);
        ctx.fillStyle = sg;
        ctx.fill();
      }

      // Particles emerge behind sweep
      if (sweepT > 0.08) {
        const eT = (sweepT - 0.08) / 0.92;
        particles.forEach((p) => {
          const pp = clamp01((eT - p.delay * 0.35) * 2.5);
          if (pp <= 0) return;
          const et = easeOut(pp);
          p.x = lerp(p.x, p.targetX, et * 0.05);
          p.y = lerp(p.y, p.targetY, et * 0.05);
          const [r, g, b] = fpColor(p.intensity);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * pp, 0, Math.PI*2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pp * 0.7})`;
          ctx.fill();
        });
      }
    }

    // ---- ORGANIZE (4.4-5.8s): settle into grid ----
    if (t >= 4.2 && t < 6.0) {
      const oT = clamp01((t - 4.2) / 1.3);

      particles.forEach((p) => {
        const st = easeOut(clamp01((oT - p.delay) * 1.8));
        p.x = lerp(p.x, p.targetX, st * 0.09);
        p.y = lerp(p.y, p.targetY, st * 0.09);
        const [r, g, b] = fpColor(p.intensity);
        const al = lerp(0.5, 0.85, st);
        const glow = st > 0.7 ? (st - 0.7) * 3.3 * 0.1 : 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + glow * 2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${al})`;
        ctx.fill();
        if (glow > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + 7, 0, Math.PI*2);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${glow * 0.12})`;
          ctx.fill();
        }
      });

      // Connecting lines between nearby settled particles
      if (oT > 0.5) {
        const lineAlpha = (oT - 0.5) * 0.6;
        ctx.strokeStyle = `rgba(0, 212, 170, ${lineAlpha * 0.06})`;
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.x === p.targetX && p.y === p.targetY) continue;
          // Check right neighbor
          if ((i + 1) % COLS !== 0 && i + 1 < particles.length) {
            const n = particles[i + 1];
            const dx = p.x - n.x;
            const dy = p.y - n.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 80) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(n.x, n.y);
              ctx.stroke();
            }
          }
          // Check neighbor below
          if (i + COLS < particles.length) {
            const n = particles[i + COLS];
            const dx = p.x - n.x;
            const dy = p.y - n.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 60) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(n.x, n.y);
              ctx.stroke();
            }
          }
        }
      }

      // Scatter fades
      const sf = Math.max(0, 1 - oT * 3);
      if (sf > 0) {
        scatter.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
          ctx.fillStyle = `rgba(0, 212, 170, ${0.12 * sf})`;
          ctx.fill();
        });
      }
    }

    // ---- TITLE + PULSE (5.6-7.0s) ----
    if (t >= 5.5) {
      const titleT = clamp01((t - 5.5) / 0.5);
      const pulseT = t >= 6.2 ? clamp01((t - 6.2) / 0.35) : 0;

      particles.forEach((p, i) => {
        const [r, g, b] = fpColor(p.intensity);
        const breathe = 0.85 + Math.sin(t * 1.2 + i * 0.035) * 0.15;

        let scale = 1;
        if (pulseT > 0) {
          const dx = p.x - w / 2;
          const dy = p.y - h / 2;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const maxD = Math.sqrt(w*w + h*h) * 0.5;
          const wd = dist / maxD * 0.3;
          const wt = clamp01((pulseT - wd) * 2.5);
          scale = 1 + wt * 0.2 * (1 - wt * 2);
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * scale, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.85 * breathe * titleT})`;
        ctx.fill();
      });

      // Grid frame lines
      if (titleT > 0.3) {
        const fAlpha = (titleT - 0.3) * 0.3;
        const pad = 0.12;
        const gw = w * (1 - pad * 2);
        const gh = h * 0.52;
        const gx = w * pad;
        const gy = h * 0.22;
        ctx.strokeStyle = `rgba(0, 212, 170, ${fAlpha * 0.08})`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(gx, gy, gw, gh);
      }

      // Atmospheric glow
      const aG = ctx.createRadialGradient(w*0.5, h*0.42, 0, w*0.5, h*0.42, w*0.3);
      aG.addColorStop(0, `rgba(0, 212, 170, ${0.02 * titleT})`);
      aG.addColorStop(1, 'rgba(0, 212, 170, 0)');
      ctx.beginPath();
      ctx.arc(w*0.5, h*0.42, w*0.3, 0, Math.PI*2);
      ctx.fillStyle = aG;
      ctx.fill();
    }

    ctx.restore();
    if (!done) frameRef.current = requestAnimationFrame(render);
  }, [done]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      if (!initedRef.current) init(rect.width, rect.height);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [init]);

  // Mouse
  useEffect(() => {
    const h = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    };
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, []);

  // Timeline
  useEffect(() => {
    if (reducedMotion) { onComplete(); return; }
    t0Ref.current = performance.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setShowTitle(true), 5500));
    timers.push(setTimeout(() => setShowSub(true), 6000));
    timers.push(setTimeout(() => setFading(true), 6600));
    timers.push(setTimeout(() => { setDone(true); onComplete(); }, 7200));
    timersRef.current = timers;
    return () => timers.forEach(clearTimers);
  }, [onComplete, reducedMotion, clearTimers]);

  // Render loop
  useEffect(() => {
    if (done) return;
    frameRef.current = requestAnimationFrame(render);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [render, done]);

  // Skip
  useEffect(() => {
    if (reducedMotion) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        if (!done) { clearTimers(); setDone(true); onComplete(); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [done, onComplete, reducedMotion, clearTimers]);

  if (done) return null;

  return (
    <div className={`emergence-intro ${fading ? 'emergence-intro--fading' : ''}`}>
      <canvas ref={canvasRef} className="emergence-canvas" />
      <div className={`emergence-title-layer ${showTitle ? 'active' : ''}`}>
        <h1 className="emergence-title">PULSE</h1>
      </div>
      <div className={`emergence-subtitle-layer ${showSub ? 'active' : ''}`}>
        <p className="emergence-subtitle">ENERGY INTELLIGENCE</p>
      </div>
      <div className="emergence-vignette" />
      <div className="emergence-skip visible">
        press any key to skip
      </div>
    </div>
  );
}

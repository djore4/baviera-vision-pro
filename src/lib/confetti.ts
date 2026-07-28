/* ── Confete ──────────────────────────────────────────────────────────────────
 * Pequeno "burst" de confete sem dependências: cria um <canvas> em ecrã inteiro,
 * anima algumas partículas com gravidade e remove-se sozinho no fim.
 * Cores da paleta BMW. Reutilizado pelo modo turbo (Konami) e pelos marcos.
 * ──────────────────────────────────────────────────────────────────────────── */

const COLORS = ['#1C69D4', '#1E40AF', '#16A34A', '#F59E0B', '#DC2626', '#FFFFFF'];

interface ConfettiOptions {
  count?: number;      // nº de partículas
  duration?: number;   // ms até desaparecer
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; color: string;
  rot: number; vrot: number;
}

export function fireConfetti(opts: ConfettiOptions = {}): void {
  if (typeof document === 'undefined') return;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  const count = opts.count ?? 120;
  const duration = opts.duration ?? 2600;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(dpr, dpr);

  // Origem: dois "canhões" nos cantos inferiores a disparar para cima/centro.
  const particles: Particle[] = Array.from({ length: count }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const originX = fromLeft ? w * 0.15 : w * 0.85;
    const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const speed = 9 + Math.random() * 9;
    return {
      x: originX,
      y: h + 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
    };
  });

  const gravity = 0.22;
  const drag = 0.992;
  const start = performance.now();

  const frame = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, w, h);
    const fade = Math.max(0, 1 - elapsed / duration);

    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < duration) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };

  requestAnimationFrame(frame);
}

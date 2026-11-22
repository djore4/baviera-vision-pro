import { useEffect, useRef } from 'react';
import { useSeason } from './SeasonProvider';

/* Neve leve em canvas. Só desenha com a época ativa, sem `prefers-reduced-motion`, e
 * pára quando o separador está escondido. Não captura cliques. Pensada para o login
 * (ecrã de baixa densidade) — não usar em ecrãs de dados. */

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function Snowfall({ count = 60 }: { count?: number }) {
  const { xmas } = useSeason();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext?.('2d');
    if (!xmas || !canvas || !ctx || prefersReducedMotion()) return;

    let w = 0, h = 0, raf = 0;
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const flakes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 1 + Math.random() * 2.2, v: 0.4 + Math.random() * 0.9, drift: Math.random() * Math.PI * 2,
    }));

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      // Branco só se vê no escuro; no tema claro usa um azul-gelo.
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.85)' : 'rgba(96,150,214,0.5)';
      for (const f of flakes) {
        f.y += f.v; f.drift += 0.01; f.x += Math.sin(f.drift) * 0.4;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [xmas, count]);

  if (!xmas) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 print:hidden" data-testid="snowfall" />;
}

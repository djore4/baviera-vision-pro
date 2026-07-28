import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fireConfetti } from '@/lib/confetti';
import { seasonalFlags } from '@/lib/seasonal';

/* ── Easter eggs globais ───────────────────────────────────────────────────────
 * Componente montado uma vez (não renderiza nada em repouso). Responsável por:
 *  · Código Konami (↑↑↓↓←→←→ B A) → "modo turbo": confete + toast + speed-lines.
 *  · Toast subtil no Dia das Mentiras (1 de abril).
 * Escondido: só dispara com ação deliberada. Nada disto é visível a clientes.
 * ──────────────────────────────────────────────────────────────────────────── */

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

export function EasterEggs() {
  const [turbo, setTurbo] = useState(false);
  const progress = useRef(0);

  // Konami — segue a sequência tecla a tecla; reinicia ao primeiro erro.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const expected = KONAMI[progress.current];
      if (key === expected) {
        progress.current += 1;
        if (progress.current === KONAMI.length) {
          progress.current = 0;
          triggerTurbo();
        }
      } else {
        // Recomeça (mas se a tecla for o 1.º passo, conta já).
        progress.current = key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const triggerTurbo = () => {
    fireConfetti();
    toast('🏎️ Modo turbo ativado!', { description: 'As margens agora andam a 300 km/h.' });
    setTurbo(true);
    window.setTimeout(() => setTurbo(false), 1500);
  };

  // Dia das Mentiras — um toast, uma vez por sessão.
  useEffect(() => {
    if (!seasonalFlags().aprilFools) return;
    if (sessionStorage.getItem('egg_april') === '1') return;
    sessionStorage.setItem('egg_april', '1');
    const t = window.setTimeout(() => {
      toast('🚗💨 Hoje o dashboard está em modo test-drive.', { description: '1 de abril!' });
    }, 1200);
    return () => window.clearTimeout(t);
  }, []);

  if (!turbo) return null;

  // Overlay de "speed-lines" durante o modo turbo (breve, por cima de tudo).
  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden">
      <div className="absolute inset-0 animate-turbo-swipe bg-[repeating-linear-gradient(90deg,transparent_0,transparent_28px,rgba(28,105,212,0.14)_28px,rgba(28,105,212,0.14)_30px)]" />
    </div>
  );
}

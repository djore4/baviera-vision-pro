import { useEffect } from 'react';
import { toast } from 'sonner';
import { fireConfetti } from '@/lib/confetti';
import { useSeason } from './SeasonProvider';

/* Saudação de Natal: um toast com confete, uma vez por dia e por dispositivo,
 * depois de a pessoa entrar. Não renderiza nada. */

const KEY = 'season.greeted';
const hojeChave = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function XmasGreeting() {
  const { xmas } = useSeason();

  useEffect(() => {
    if (!xmas) return;
    try {
      if (localStorage.getItem(KEY) === hojeChave()) return;
      localStorage.setItem(KEY, hojeChave());
    } catch { return; }   // sem localStorage não arriscamos repetir a saudação
    const t = window.setTimeout(() => {
      fireConfetti({ count: 80 });
      toast('🎄 Boas festas!', { description: 'Bom fecho de ano — e boas vendas.' });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [xmas]);

  return null;
}

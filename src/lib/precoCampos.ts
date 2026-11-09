import { parseNum } from '@/lib/viaturaFormat';
import type { PricingInputs } from '@/lib/demoPricing';

/* Conversão entre o valor guardado de um campo de preço e o texto que se escreve na janela
 * de preço. Percentagens escrevem-se em % (0,085 ↔ "8,5"), euros em formato PT. */

export type Kind = 'pct' | 'eur';

/** Valor guardado → texto do campo ("0" fica vazio; percentagens em %, ex. 0,085 → "8,5"). */
export const toFieldText = (v: number, kind: Kind): string => {
  if (!v) return '';
  const n = kind === 'pct' ? Math.round(v * 100 * 100) / 100 : Math.round(v * 100) / 100;
  return String(n).replace('.', ',');
};

/** Texto do campo → valor guardado; null se inválido ("" = 0). */
export const fromFieldText = (txt: string, kind: Kind): number | null => {
  const t = parseNum(txt, kind);
  if (t === '') return 0;
  const n = Number(t);
  if (!isFinite(n)) return null;
  return kind === 'pct' ? n / 100 : n;
};

/* Valores de `inputs` que a janela de preço edita; a base de dados (demos_gravar_precos) recusa outros. */
export const PRICE_FIELDS: (keyof PricingInputs)[] = [
  'pvb', 'opc', 'bsi', 'eco', 'leg', 'isv', 'mgb', 'esf', 'pac', 'dem', 'sup', 'depreciacoes', 'pvp_desc',
];

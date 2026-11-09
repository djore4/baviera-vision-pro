import { parseNum } from '@/lib/viaturaFormat';

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

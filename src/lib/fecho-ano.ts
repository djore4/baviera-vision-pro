/* ── Fecho de ano ─────────────────────────────────────────────────────────────
 * Contador de dias úteis até 31 de dezembro e ritmo necessário para fechar o
 * objetivo anual. Lógica pura (sem React), testável.
 *
 * Feriados: só os nacionais de data fixa. Os móveis (Páscoa, Corpo de Deus)
 * caem entre março e junho, fora da janela em que o contador aparece.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Feriados nacionais fixos, como [mês 1–12, dia]. */
const FERIADOS_FIXOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [4, 25], [5, 1], [6, 10], [8, 15], [10, 5], [11, 1], [12, 1], [12, 8], [12, 25],
];

const isFeriado = (d: Date) => FERIADOS_FIXOS.some(([m, dia]) => d.getMonth() + 1 === m && d.getDate() === dia);
const isFimDeSemana = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
export const isDiaUtil = (d: Date) => !isFimDeSemana(d) && !isFeriado(d);

/** Dias úteis (seg–sex, sem feriados) de `de` a `ate`, ambos inclusive. */
export function diasUteisEntre(de: Date, ate: Date): number {
  const fim = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  let n = 0;
  for (let d = new Date(de.getFullYear(), de.getMonth(), de.getDate()); d <= fim; d.setDate(d.getDate() + 1)) {
    if (isDiaUtil(d)) n += 1;
  }
  return n;
}

/** Dias úteis que faltam até 31/12 do ano de `hoje`, contando o próprio dia se for útil. */
export function diasUteisAteFimDeAno(hoje: Date = new Date()): number {
  return diasUteisEntre(hoje, new Date(hoje.getFullYear(), 11, 31));
}

export interface FaltaObjetivo {
  objetivo: number;
  real: number;
  /** Retails que ainda faltam (0 se o objetivo já foi atingido). */
  falta: number;
  /** Retails por dia útil necessários para fechar; null sem objetivo ou sem dias úteis. */
  porDiaUtil: number | null;
  atingido: boolean;
}

export function faltaObjetivo(objetivo: number, real: number, diasUteis: number): FaltaObjetivo | null {
  if (!(objetivo > 0)) return null;
  const falta = Math.max(0, objetivo - real);
  return {
    objetivo, real, falta,
    atingido: falta === 0,
    porDiaUtil: falta === 0 || diasUteis <= 0 ? null : Math.round((falta / diasUteis) * 10) / 10,
  };
}

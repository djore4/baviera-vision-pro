/* Escalões de 30 dias desde a data de matrícula — mesma lógica da gestão VD da Caetano Sales Force
 * (calcularPeriodos30): o apoio/desconto máximo sobe a cada 30 dias. Dias contados em UTC para
 * evitar desvios de fuso e de hora de verão. */

export interface Escalao30 {
  /** Dias desde a matrícula (negativo se a data é futura). */
  dias: number;
  /** Períodos de 30 dias completos. */
  periodos: number;
  /** Dias até ao próximo escalão. */
  faltam: number;
  /** Data do próximo escalão. */
  proxima: Date;
  futura: boolean;
}

export function calcularEscalao30(dataMatricula: string | null | undefined, hoje: Date = new Date()): Escalao30 | null {
  if (!dataMatricula) return null;
  const [a, m, d] = String(dataMatricula).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const mat = Date.UTC(a, m - 1, d);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = Math.floor((h - mat) / 86400000);
  if (dias < 0) return { dias, periodos: 0, faltam: -dias, proxima: new Date(mat), futura: true };
  const periodos = Math.floor(dias / 30);
  return { dias, periodos, faltam: 30 - (dias % 30), proxima: new Date(mat + (periodos + 1) * 30 * 86400000), futura: false };
}

/**
 * Tabela de Margens Fixas por Modelo (BMW) — Modelo × Versão.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  DADOS TRANSCRITOS DA IMAGEM DA TABELA. VALIDAR CONTRA A FONTE OFICIAL.
 *     Para corrigir um valor, edita apenas o BONUS_TABLE abaixo (percentagem
 *     inteira, ex.: 7 = 7%). Uma célula ausente = sem valor definido.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * O modal "Margens Fixas por Modelo" renderiza esta mesma estrutura, por isso
 * qualquer divergência face à folha original é imediatamente visível na app.
 */

/** Colunas (versões) por ordem, agrupadas como na folha original. */
export type BonusCol = { key: string; group: number };

export const BONUS_COLS: BonusCol[] = [
  // grupo 0
  { key: '16', group: 0 }, { key: '20e', group: 0 },
  // grupo 1
  { key: '18d', group: 1 }, { key: '18', group: 1 }, { key: '20d', group: 1 },
  { key: '20', group: 1 }, { key: '23d', group: 1 }, { key: '25e', group: 1 }, { key: '30e', group: 1 },
  // grupo 2
  { key: '30d', group: 2 }, { key: '30', group: 2 }, { key: '35e', group: 2 },
  { key: '40e', group: 2 }, { key: '45e', group: 2 },
  // grupo 3
  { key: '35i', group: 3 }, { key: '40', group: 3 }, { key: '40d', group: 3 },
  { key: '50e', group: 3 }, { key: '60e', group: 3 },
  // grupo 4
  { key: '50', group: 4 }, { key: '60', group: 4 }, { key: 'M', group: 4 },
];

/** Modelos (linhas) por ordem de apresentação. */
export const BONUS_MODELS: string[] = [
  'S1', 'S2', 'S3', 'S4', 'i4', 'S5', 'S6', 'Z4',
  'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7',
  'S7', 'S8', 'iX', 'XM',
];

/**
 * Matriz Modelo → { Versão: percentagem }. Percentagem em inteiro (7 = 7%).
 * Células omitidas = sem valor na folha.
 */
export const BONUS_TABLE: Record<string, Record<string, number>> = {
  S1: { '16': 6, '18d': 7, '18': 7, '20d': 7, '20': 7, '35i': 9 },
  S2: { '16': 6, '18d': 7, '18': 7, '20d': 7, '20': 7, '23d': 7, '25e': 7, '30e': 7, '30': 8, '40': 9, 'M': 10 },
  S3: { '20e': 6, '18d': 7, '20d': 7, '20': 7, '30e': 7, '30d': 8, '30': 8, '40': 9, '40d': 9, 'M': 10 },
  S4: { '20d': 7, '20': 7, '30d': 8, '30': 8, '40': 9, '40d': 9, 'M': 10 },
  i4: { '35e': 7, '40e': 7, '50e': 7 },
  S5: { '20': 7, '30e': 7, '30d': 8, '40': 9, 'M': 10 },
  S6: { '20': 7, '30d': 8, '30': 8, '40': 9 },
  Z4: { '20': 7, '30d': 8, '40': 9 },
  X1: { '20e': 6, '18d': 7, '18': 7, '20': 7, '23d': 7, '25e': 7, '30e': 7, '35i': 9 },
  X2: { '20e': 6, '18d': 7, '18': 7, '20d': 7, '25e': 7, '30e': 7, '35i': 9 },
  X3: { '18d': 7, '20d': 7, '30e': 7, '30d': 8, '40e': 7, '40': 9, '40d': 9, 'M': 10 },
  X4: { '20d': 7, '30d': 8, '40': 9, 'M': 10 },
  X5: { '30d': 8, '35i': 9, '40': 9, '50': 10, 'M': 10 },
  X6: { '30d': 8, '35i': 9, '40': 9, '60e': 10, '50': 10, 'M': 10 },
  X7: { '35i': 9, '40': 9, '60': 10 },
  S7: { '40': 10, '40d': 10, '50e': 10, '60e': 10, '50': 10, '60': 10, 'M': 10 },
  S8: { '35i': 10, '40': 10, '50': 10, 'M': 10 },
  iX: { '35e': 8, '40e': 8, '50e': 8, '60e': 8 },
  XM: { 'M': 10 },
};

/** Devolve a percentagem (fração, ex.: 0.07) ou null se não houver valor. */
export function lookupBonus(model: string, version: string): number | null {
  if (!model || !version) return null;
  const row = BONUS_TABLE[model];
  const v = row?.[version];
  return typeof v === 'number' ? v / 100 : null;
}

/** Versões disponíveis (com valor) para um dado modelo, pela ordem de BONUS_COLS. */
export function versionsForModel(model: string): string[] {
  const row = BONUS_TABLE[model];
  if (!row) return [];
  return BONUS_COLS.map(c => c.key).filter(k => k in row);
}

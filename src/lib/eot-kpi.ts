import { daysToEnd, isFechada, type EotContract } from '@/lib/eot';

/* Contadores no topo do End-of-Term. Cada um é, ao mesmo tempo, o número que se
 * mostra e o filtro que se aplica à lista ao clicar — definidos num só sítio
 * (kpiMatch) para o número do cartão e as linhas da lista nunca discordarem. */
export type KpiKey = 'ativos' | 'ate30' | 'ate60' | 'fechados';

export const KPI_LABELS: Record<KpiKey, string> = {
  ativos: 'Contratos ativos',
  ate30: 'A terminar ≤ 30 dias',
  ate60: 'A terminar ≤ 60 dias',
  fechados: 'Renovados / Retomados',
};

const endsWithin = (c: EotContract, days: number): boolean => {
  const d = daysToEnd(c.data_fim);
  return d != null && d >= 0 && d <= days;
};

/** O contrato pertence ao contador? */
export function kpiMatch(c: Pick<EotContract, 'fase' | 'data_fim'>, key: KpiKey): boolean {
  switch (key) {
    case 'ativos':   return !isFechada(c.fase);
    case 'ate30':    return !isFechada(c.fase) && endsWithin(c as EotContract, 30);
    case 'ate60':    return !isFechada(c.fase) && endsWithin(c as EotContract, 60);
    case 'fechados': return c.fase === 'renovado' || c.fase === 'retomado';
  }
}

/** Valor de cada contador, sobre os contratos que cumprem os filtros. */
export function kpiCounts(contracts: Pick<EotContract, 'fase' | 'data_fim'>[]): Record<KpiKey, number> {
  const out: Record<KpiKey, number> = { ativos: 0, ate30: 0, ate60: 0, fechados: 0 };
  for (const c of contracts) {
    (Object.keys(out) as KpiKey[]).forEach(k => { if (kpiMatch(c, k)) out[k]++; });
  }
  return out;
}

/** Lista a mostrar: com um contador ativo, os contratos desse contador (incluindo
 *  os "fechados" para o contador Renovados/Retomados, apesar de "Esconder
 *  fechados"); sem contador, o comportamento de sempre. */
export function applyKpi<T extends Pick<EotContract, 'fase' | 'data_fim'>>(
  scoped: T[], kpi: KpiKey | null, hideClosed: boolean,
): T[] {
  if (kpi) return scoped.filter(c => kpiMatch(c, kpi));
  return hideClosed ? scoped.filter(c => !isFechada(c.fase)) : scoped;
}

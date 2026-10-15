import { daysToEnd, isFechada, type EotContract } from '@/lib/eot';

/* Contadores no topo do End-of-Term. Cada um é, ao mesmo tempo, o número que se
 * mostra e o filtro que se aplica à lista ao clicar — definidos num só sítio
 * (kpiMatch) para o número do cartão e as linhas da lista nunca discordarem. */
export type KpiKey = 'ativos' | 'ate30' | 'acompanhamento' | 'fechados';

export const KPI_LABELS: Record<KpiKey, string> = {
  ativos: 'Contratos ativos',
  ate30: 'A terminar ≤ 30 dias',
  acompanhamento: 'Em acompanhamento',
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
    case 'acompanhamento': return c.fase !== 'pendente';
    case 'fechados': return c.fase === 'renovado' || c.fase === 'retomado';
  }
}

/** Valor de cada contador, sobre os contratos que cumprem os filtros; `total` é o
 *  denominador de "Em acompanhamento" (todos os contratos, qualquer fase). */
export function kpiCounts(contracts: Pick<EotContract, 'fase' | 'data_fim'>[]): Record<KpiKey, number> & { total: number } {
  const out = { ativos: 0, ate30: 0, acompanhamento: 0, fechados: 0, total: contracts.length };
  for (const c of contracts) {
    (['ativos', 'ate30', 'acompanhamento', 'fechados'] as KpiKey[]).forEach(k => { if (kpiMatch(c, k)) out[k]++; });
  }
  return out;
}

/** % de contratos em acompanhamento, arredondada (é o que se mostra e o que dá a cor);
 *  sem contratos não há percentagem. */
export function pctAcompanhamento(n: number, total: number): number | null {
  return total > 0 ? Math.round((n / total) * 100) : null;
}

/** ≥ 90% verde · 75–89% amarelo · < 75% vermelho. */
export function toneAcompanhamento(pct: number | null): 'default' | 'good' | 'amber' | 'bad' {
  if (pct == null) return 'default';
  return pct >= 90 ? 'good' : pct >= 75 ? 'amber' : 'bad';
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

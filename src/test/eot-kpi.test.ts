import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyKpi, kpiCounts, kpiMatch, pctAcompanhamento, toneAcompanhamento, KPI_LABELS, type KpiKey } from '@/lib/eot-kpi';
import type { Fase } from '@/lib/eot';

/* Hoje = 2026-10-04 (meio-dia UTC); as datas de fim são relativas a esse dia. */
const NOW = new Date(Date.UTC(2026, 9, 4, 12, 0, 0));
const inDays = (n: number) => new Date(Date.UTC(2026, 9, 4 + n)).toISOString().slice(0, 10);
const c = (fase: Fase, dias: number | null) => ({ fase, data_fim: dias == null ? null : inDays(dias) });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

const KEYS: KpiKey[] = ['ativos', 'ate30', 'acompanhamento', 'fechados'];

describe('kpiMatch — o que cada contador conta', () => {
  it('ativos: tudo menos as fases fechadas', () => {
    for (const f of ['pendente', 'contactado', 'proposta_enviada', 'negociacao'] as Fase[]) expect(kpiMatch(c(f, 100), 'ativos')).toBe(true);
    for (const f of ['renovado', 'retomado', 'perdido', 'sem_interesse'] as Fase[]) expect(kpiMatch(c(f, 100), 'ativos')).toBe(false);
  });

  it('ate30: ativos que terminam entre hoje e 30 dias, inclusive', () => {
    expect(kpiMatch(c('pendente', 0), 'ate30')).toBe(true);    // termina hoje
    expect(kpiMatch(c('pendente', 30), 'ate30')).toBe(true);   // fronteira
    expect(kpiMatch(c('pendente', 31), 'ate30')).toBe(false);
    expect(kpiMatch(c('pendente', -1), 'ate30')).toBe(false);  // já terminou
    expect(kpiMatch(c('pendente', null), 'ate30')).toBe(false); // sem data de fim
  });

  it('acompanhamento: qualquer contrato que já não está pendente, seja qual for a data de fim', () => {
    expect(kpiMatch(c('pendente', 10), 'acompanhamento')).toBe(false);
    for (const f of ['contactado', 'proposta_enviada', 'negociacao', 'renovado', 'retomado', 'perdido', 'sem_interesse'] as Fase[]) {
      expect(kpiMatch(c(f, null), 'acompanhamento')).toBe(true);
    }
  });

  it('o de prazo não conta fases fechadas', () => {
    for (const f of ['renovado', 'retomado', 'perdido', 'sem_interesse'] as Fase[]) {
      expect(kpiMatch(c(f, 10), 'ate30')).toBe(false);
    }
  });

  it('fechados: só renovados e retomados (perdido e sem interesse não são "renovados/retomados")', () => {
    expect(kpiMatch(c('renovado', null), 'fechados')).toBe(true);
    expect(kpiMatch(c('retomado', 200), 'fechados')).toBe(true);
    expect(kpiMatch(c('perdido', 10), 'fechados')).toBe(false);
    expect(kpiMatch(c('sem_interesse', 10), 'fechados')).toBe(false);
    expect(kpiMatch(c('pendente', 10), 'fechados')).toBe(false);
  });
});

describe('o número do cartão é o número de linhas da lista', () => {
  const lista = [
    c('pendente', 0), c('pendente', 12), c('contactado', 30), c('contactado', 31), c('negociacao', 45),
    c('proposta_enviada', 60), c('pendente', 61), c('pendente', 400), c('pendente', -3), c('pendente', null),
    c('renovado', 10), c('retomado', null), c('renovado', -20), c('perdido', 5), c('sem_interesse', 40),
  ];

  it.each(KEYS)('%s: kpiCounts == applyKpi(...).length, com "esconder fechados" ligado ou desligado', key => {
    const n = kpiCounts(lista)[key];
    expect(applyKpi(lista, key, true)).toHaveLength(n);
    expect(applyKpi(lista, key, false)).toHaveLength(n);
  });

  it('valores esperados para esta lista', () => {
    expect(kpiCounts(lista)).toEqual({ ativos: 10, ate30: 3, acompanhamento: 9, fechados: 3, total: 15 });
  });

  it('com um contador ativo, a lista são exatamente os contratos desse contador', () => {
    for (const key of KEYS) {
      for (const x of applyKpi(lista, key, true)) expect(kpiMatch(x, key)).toBe(true);
    }
  });
});

describe('applyKpi — combinação com "Esconder fechados"', () => {
  const lista = [c('pendente', 10), c('renovado', 10), c('perdido', 10), c('retomado', 10)];

  it('sem contador: esconde os fechados se pedido, senão mostra tudo (comportamento de sempre)', () => {
    expect(applyKpi(lista, null, true).map(x => x.fase)).toEqual(['pendente']);
    expect(applyKpi(lista, null, false)).toHaveLength(4);
  });

  it('Renovados/Retomados mostra-os mesmo com "Esconder fechados" ligado', () => {
    expect(applyKpi(lista, 'fechados', true).map(x => x.fase)).toEqual(['renovado', 'retomado']);
  });

  it('um contador de ativos não traz fechados, mesmo com "Esconder fechados" desligado', () => {
    expect(applyKpi(lista, 'ativos', false).map(x => x.fase)).toEqual(['pendente']);
  });

  it('não altera a lista de entrada', () => {
    const copia = [...lista];
    applyKpi(lista, 'ate30', true);
    expect(lista).toEqual(copia);
  });
});

describe('% em acompanhamento — valor e cor', () => {
  it('arredonda e não há % sem contratos', () => {
    expect(pctAcompanhamento(5, 6)).toBe(83);
    expect(pctAcompanhamento(0, 0)).toBeNull();
  });
  it('≥ 90 verde · 75–89 amarelo · < 75 vermelho (fronteiras incluídas)', () => {
    expect(toneAcompanhamento(100)).toBe('good');
    expect(toneAcompanhamento(90)).toBe('good');
    expect(toneAcompanhamento(89)).toBe('amber');
    expect(toneAcompanhamento(75)).toBe('amber');
    expect(toneAcompanhamento(74)).toBe('bad');
    expect(toneAcompanhamento(0)).toBe('bad');
    expect(toneAcompanhamento(null)).toBe('default');
  });
});

describe('etiquetas', () => {
  it('há uma etiqueta para cada contador', () => {
    for (const k of KEYS) expect(KPI_LABELS[k]).toBeTruthy();
  });
});

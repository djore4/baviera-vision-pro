import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ControlRecord } from '@/types/data';

const useData = vi.fn();
vi.mock('@/contexts/DataContext', () => ({ useData: () => useData() }));
vi.mock('@/components/PeriodFilter', () => ({ PeriodFilter: () => <div>filtro</div> }));
vi.mock('@/lib/quality', async (orig) => ({
  ...(await orig<typeof import('@/lib/quality')>()),
  getLatestScores: vi.fn().mockResolvedValue(null),
}));
vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const names = ['ResponsiveContainer', 'RadarChart', 'Radar', 'PolarGrid', 'PolarAngleAxis', 'PolarRadiusAxis', 'ComposedChart',
    'BarChart', 'Bar', 'Line', 'ScatterChart', 'Scatter', 'ZAxis', 'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'Legend', 'ReferenceLine'];
  return Object.fromEntries(names.map(n => [n, Stub]));
});

import {
  computeComparativo, standing, scoreAgainst, baselineValue, delta, headToHead, insights, KPI_BY_KEY,
} from '@/lib/comparativo';
import ComparativoPage from '@/pages/ComparativoPage';

const d = (y: number, m: number, day = 10) => new Date(y, m - 1, day);
const rec = (over: Partial<ControlRecord>): ControlRecord => ({
  status: 'Retail', neg: null, mes1: '', resp: 'AA', cliente: '', type: 'VN', biz: '', enc: '', chas: '', mat: '',
  model: 'iX1', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, cme: null, ret: 0, fin: '', week198: '',
  dmat: null, date298: null, app: null, dfat: null, obs: '', ...over,
});

const FILTER = { years: [2026], quarters: [], months: [] };
const control: ControlRecord[] = [
  // AA: 3 negócios (2 BEV, 1 FS), 2 retails (1 retoma), lead times 21 e 90 dias
  rec({ resp: 'AA', neg: d(2026, 1), date298: d(2026, 1, 31), bev: 1, fin: 'FS', ret: 1 }),
  rec({ resp: 'AA', neg: d(2026, 2), date298: d(2026, 5, 11), bev: 1, qor: 1 }),
  rec({ resp: 'AA', status: 'Carteira', neg: d(2026, 3), model: 'X3' }),
  // BB: 1 negócio, 1 retail
  rec({ resp: 'BB', neg: d(2026, 1), date298: d(2026, 3, 1), qor: 1, fin: 'FS' }),
  rec({ resp: 'BB', status: 'Quente' }),
  // CC sem atividade em 2026 (negócio em 2025) e um VP que não conta
  rec({ resp: 'CC', neg: d(2025, 5), date298: d(2025, 6) }),
  rec({ resp: 'AA', type: 'VP', neg: d(2026, 1), date298: d(2026, 1) }),
];
const objetivos = [
  { mes: '2026/01', resp: 'AA', objetivo: 2 }, { mes: '2026/02', resp: 'AA', objetivo: 2 },
  { mes: '2026/01', resp: 'BB', objetivo: 2 }, { mes: '2025/01', resp: 'AA', objetivo: 50 },
];

describe('computeComparativo', () => {
  const { sellers, team } = computeComparativo({ control, objetivos, filter: FILTER, now: d(2026, 4, 1) });
  const aa = sellers.find(s => s.resp === 'AA')!;
  const bb = sellers.find(s => s.resp === 'BB')!;

  it('só entram vendedores com atividade no período; VP não conta', () => {
    expect(sellers.map(s => s.resp)).toEqual(['AA', 'BB']);
    expect(aa.values.neg).toBe(3);
    expect(aa.values.ret).toBe(2);
  });

  it('taxas sobre a amostra certa (negócios ou retails)', () => {
    expect(aa.values.bevPct).toBeCloseTo(66.7, 1);
    expect(aa.values.fsPct).toBeCloseTo(33.3, 1);
    expect(aa.values.retomaPct).toBe(50);
    expect(aa.values.r).toBe(1.5);
    expect(aa.n.bevPct).toBe(3);
  });

  it('lead time e retails rápidos', () => {
    expect(aa.values.leadMed).toBe(55.5);    // mediana de 21 e 90 dias
    expect(aa.values.rapidos).toBe(50);
  });

  it('atingimento usa só os objetivos dos meses do período', () => {
    expect(aa.values.ating).toBe(75);          // 3 / (2+2), ignora 2025
    expect(bb.values.ating).toBe(50);
  });

  it('carteira, idade e funil são o estado atual', () => {
    expect(aa.values.open).toBe(1);
    expect(aa.values.age).toBe(Math.round((d(2026, 4, 1).getTime() - d(2026, 3).getTime()) / 86400000));
    expect(bb.values.quente).toBe(1);
    expect(bb.values.funil).toBe(1);
  });

  it('equipa: taxas agregadas (ponderadas), contagens por média', () => {
    expect(team.pooled.neg).toBe(2);           // média de 3 e 1
    expect(team.pooled.bevPct).toBe(50);       // 2 BEV em 4 negócios
    expect(team.pooled.r).toBeCloseTo(4 / 3, 5);
    expect(team.best.neg).toBe(3);
    expect(team.best.leadMed).toBe(Math.min(aa.values.leadMed!, bb.values.leadMed!));
    expect(baselineValue(team, 'neg', 'melhor')).toBe(3);
  });

  it('qualidade vem das notas lançadas', () => {
    const q = computeComparativo({ control, objetivos, filter: FILTER, quality: { AA: 42 } });
    expect(q.sellers.find(s => s.resp === 'AA')!.values.qualidade).toBe(42);
    expect(q.sellers.find(s => s.resp === 'BB')!.values.qualidade).toBeNull();
  });
});

describe('posição relativa', () => {
  it('rank e nota respeitam o sentido (lead time: menos é melhor)', () => {
    const lead = KPI_BY_KEY.leadMed;
    expect(standing(lead, 30, [30, 60, 90])).toMatchObject({ rank: 1, score: 100, percentile: 100 });
    expect(standing(lead, 90, [30, 60, 90])).toMatchObject({ rank: 3, score: 0, percentile: 0 });
    const neg = KPI_BY_KEY.neg;
    expect(standing(neg, 5, [1, 5, 9])).toMatchObject({ rank: 2, score: 50 });
  });

  it('KPIs neutros não têm rank nem nota; valores em falta não rebentam', () => {
    expect(standing(KPI_BY_KEY.r, 1.2, [0.8, 1.2])).toMatchObject({ rank: null, score: null });
    expect(standing(KPI_BY_KEY.neg, null, [1, 2])).toMatchObject({ rank: null, of: 2 });
    expect(scoreAgainst(KPI_BY_KEY.neg, 3, [3, 3])).toBe(50);
    expect(scoreAgainst(KPI_BY_KEY.neg, 99, [0, 10])).toBe(100);     // cortado ao máximo
  });

  it('delta e confronto direto', () => {
    expect(delta(KPI_BY_KEY.leadMed, 40, 50)).toEqual({ diff: -10, good: true });
    expect(delta(KPI_BY_KEY.neg, 4, 6)).toEqual({ diff: -2, good: false });
    expect(delta(KPI_BY_KEY.r, 1.2, 1)?.good).toBeNull();
    expect(delta(KPI_BY_KEY.neg, null, 1)).toBeNull();
    const { sellers } = computeComparativo({ control, objetivos, filter: FILTER });
    const h = headToHead(sellers[0], sellers[1]);
    expect(h.winsA + h.winsB + h.ties).toBeLessThanOrEqual(h.lines.length);
    expect(h.lines.find(l => l.def.key === 'neg')?.winner).toBe('a');
  });

  it('insights devolve forças e fraquezas só com 3+ pares', () => {
    const { sellers } = computeComparativo({ control, objetivos, filter: FILTER });
    expect(insights(sellers, 'AA')).toEqual({ strengths: [], weaknesses: [] });   // só 2 vendedores
  });
});

describe('ComparativoPage', () => {
  beforeEach(() => { localStorage.clear(); });
  const data = { control, objetivosResp: objetivos, objetivosTotal: [], lastUpdated: '' };

  it('mostra o vendedor em foco, muda de vista e de foco', () => {
    useData.mockReturnValue({ data, filter: FILTER });
    render(<ComparativoPage />);
    expect(screen.getByText('Perfil comparado')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Ranking' }));
    expect(screen.getByText('Mapa de calor')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Frente a frente' }));
    expect(screen.getByText(/Escolhe um colega/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'BB' })[0]);
    expect(screen.getByText(/frente a frente com BB/)).toBeTruthy();   // BB passou a foco
  });

  it('percorre todas as vistas sem rebentar, com e sem adversário', () => {
    useData.mockReturnValue({ data, filter: FILTER });
    render(<ComparativoPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'BB' }).find(b => b.getAttribute('aria-pressed') === 'false')!);
    for (const v of ['Evolução', 'Dispersão', 'Mix', 'Frente a frente', 'Visão geral']) {
      fireEvent.click(screen.getByRole('tab', { name: v }));
    }
  });

  it('sem atividade no período mostra o estado vazio', () => {
    useData.mockReturnValue({ data, filter: { years: [2030], quarters: [], months: [] } });
    render(<ComparativoPage />);
    expect(screen.getByText(/Sem negócios nem retails/)).toBeTruthy();
  });

  it('sem dados carregados não rebenta', () => {
    useData.mockReturnValue({ data: null, filter: FILTER });
    render(<ComparativoPage />);
    expect(screen.getByText('Sem dados carregados.')).toBeTruthy();
  });
});

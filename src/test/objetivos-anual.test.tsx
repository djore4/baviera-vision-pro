import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ControlRecord } from '@/types/data';

const useData = vi.fn();
vi.mock('@/contexts/DataContext', () => ({ useData: () => useData() }));
vi.mock('recharts', async () => {
  const React = await import('react');
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Stub, ComposedChart: Stub, Bar: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub, Tooltip: Stub, Legend: Stub };
});

import { buildAnual, retailsPorMes } from '@/lib/objetivos-anual';
import ObjetivosVnAnual from '@/components/objetivos/ObjetivosVnAnual';

const rec = (over: Partial<ControlRecord>): ControlRecord => ({
  status: 'Retail', neg: null, mes1: '2026/10', resp: 'BR', cliente: '', type: 'VN', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, cme: null, ret: 0, fin: '', week198: '',
  dmat: null, date298: null, app: null, dfat: null, obs: '', ...over,
});

const control = [
  rec({}), rec({ type: 'VD' }), rec({ type: 'RMK' }),
  rec({ type: 'VP' }),                       // VP não conta para retails
  rec({ status: 'Matricula' }),               // ainda não é retail
  rec({ mes1: '2026/9' }),                    // mês sem zero à esquerda
];
const totais = [{ mes: '2026/10', orcado: 27, range2: 25, range3: 28, real: 0 }, { mes: '2026/09', orcado: 20, range2: 0, range3: 0, real: 0 }];
const resp = [
  { mes: '2026/10', resp: 'BR', objetivo: 20 }, { mes: '2026/10', resp: 'NC', objetivo: 20 }, { mes: '2025/10', resp: 'BR', objetivo: 99 },
];
const HOJE = new Date(2026, 9, 31); // outubro de 2026

describe('retailsPorMes', () => {
  it('conta VN, VD e RMK em Retail por mês de entrega; ignora VP e outros estados', () => {
    expect(retailsPorMes(control)).toEqual({ '2026/10': 3, '2026/09': 1 });
  });
});

describe('buildAnual', () => {
  const a = buildAnual(2026, totais, resp, control, HOJE);
  const out = a.linhas[9];

  it('12 meses com objetivos GSC, BMW e soma dos vendedores do ano pedido', () => {
    expect(a.linhas).toHaveLength(12);
    expect(out).toMatchObject({ key: '2026/10', gsc: 27, bmw: 25, vendedores: 40, retails: 3, futuro: false });
  });

  it('percentagens de cumprimento face a GSC e a BMW', () => {
    expect(out.pctGsc).toBe(11);   // 3/27
    expect(out.pctBmw).toBe(12);   // 3/25
  });

  it('sem objetivo não há percentagem; meses futuros não têm real nem %', () => {
    expect(a.linhas[8]).toMatchObject({ retails: 1, bmw: 0, pctBmw: null, pctGsc: 5 });
    expect(a.linhas[10]).toMatchObject({ futuro: true, retails: 0, pctGsc: null, pctBmw: null });
  });

  it('ignora objetivos de outros anos e soma o total do ano', () => {
    expect(a.total).toMatchObject({ gsc: 47, bmw: 25, vendedores: 40, retails: 4 });
    expect(a.total.pctBmw).toBe(16);
  });
});

describe('ObjetivosVnAnual', () => {
  it('mostra a tabela anual com total evidenciado e abre o mês ao clicar', () => {
    useData.mockReturnValue({ data: { control, objetivosTotal: totais, objetivosResp: resp } });
    const onSelect = vi.fn();
    render(<ObjetivosVnAnual ano={2026} mes={10} onSelectMes={onSelect} />);
    ['Σ Vendedores', 'GSC', 'BMW', 'Retails', '% GSC', '% BMW'].forEach(h => expect(screen.getAllByText(h).length).toBeGreaterThan(0));
    const total = screen.getByText('Total 2026').closest('tr')!;
    expect(total).toHaveClass('bg-primary/10');
    expect(within(total).getByText('40')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Set'));
    expect(onSelect).toHaveBeenCalledWith(9);
    expect(screen.getByText('Out').closest('tr')).toHaveAttribute('aria-current', 'true');
  });

  it('sem dados carregados não rebenta', () => {
    useData.mockReturnValue({ data: null });
    render(<ObjetivosVnAnual ano={2026} mes={1} onSelectMes={vi.fn()} />);
    expect(screen.getByText('Total 2026')).toBeInTheDocument();
  });
});

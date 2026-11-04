import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MarketingPage from '@/pages/MarketingPage';
import { TABS, PERMISSION_TABS, ADMIN_ONLY_TAB_KEYS, ARCHIVED_TAB_KEYS } from '@/lib/permissions';
import {
  agruparPorMes, estadoDe, formatarIntervalo, posicaoHoje, proximoEvento, textoRelativo, MARKETING_EVENTOS,
  type MarketingEvento,
} from '@/lib/marketing';

const ev = (id: string, inicio: string, fim?: string, categoria: MarketingEvento['categoria'] = 'evento'): MarketingEvento =>
  ({ id, titulo: id, categoria, inicio, fim });

describe('tab Marketing', () => {
  it('está na secção Transversal, visível só ao admin e fora da matriz de funções', () => {
    expect(TABS.find(t => t.key === 'marketing')).toMatchObject({ area: 'apv', path: '/marketing', adminOnly: true });
    expect(ADMIN_ONLY_TAB_KEYS).toContain('marketing');
    expect(PERMISSION_TABS.some(t => t.key === 'marketing')).toBe(false);
    expect(ARCHIVED_TAB_KEYS).not.toContain('marketing');
  });
});

describe('lógica da linha do tempo', () => {
  it('estado face a hoje', () => {
    expect(estadoDe(ev('a', '2027-01-01'), '2027-01-02')).toBe('passado');
    expect(estadoDe(ev('a', '2027-01-01', '2027-01-05'), '2027-01-03')).toBe('a-decorrer');
    expect(estadoDe(ev('a', '2027-01-03'), '2027-01-03')).toBe('a-decorrer');
    expect(estadoDe(ev('a', '2027-01-10'), '2027-01-03')).toBe('futuro');
  });

  it('agrupa por mês, ordenado', () => {
    const g = agruparPorMes([ev('b', '2027-02-01'), ev('a', '2026-12-30'), ev('c', '2027-02-20')]);
    expect(g.map(x => x.key)).toEqual(['2026-12', '2027-02']);
    expect(g[0].label).toBe('Dezembro 2026');
    expect(g[1].eventos.map(e => e.id)).toEqual(['b', 'c']);
  });

  it('formata intervalos', () => {
    expect(formatarIntervalo({ inicio: '2026-12-05' })).toBe('5 dez');
    expect(formatarIntervalo({ inicio: '2026-12-05', fim: '2026-12-06' })).toBe('5–6 dez');
    expect(formatarIntervalo({ inicio: '2026-11-28', fim: '2026-12-02' })).toBe('28 nov – 2 dez');
  });

  it('texto relativo', () => {
    expect(textoRelativo(ev('a', '2027-01-04'), '2027-01-03')).toBe('Amanhã');
    expect(textoRelativo(ev('a', '2027-01-23'), '2027-01-03')).toBe('Em 20 dias');
    expect(textoRelativo(ev('a', '2027-01-01', '2027-01-09'), '2027-01-03')).toBe('A decorrer');
    expect(textoRelativo(ev('a', '2027-01-01'), '2027-01-04')).toBe('Há 3 dias');
  });

  it('próximo evento ignora os passados e inclui o a decorrer', () => {
    const evs = [ev('a', '2027-01-01'), ev('b', '2027-01-02', '2027-01-20'), ev('c', '2027-02-01')];
    expect(proximoEvento(evs, '2027-01-05')?.id).toBe('b');
    expect(proximoEvento(evs, '2027-03-01')).toBeNull();
  });

  it('posição de hoje interpola entre eventos', () => {
    const evs = [ev('a', '2027-01-01'), ev('b', '2027-01-11'), ev('c', '2027-01-21')];
    expect(posicaoHoje(evs, '2026-12-01')).toBe(0);
    expect(posicaoHoje(evs, '2027-01-06')).toBeCloseTo(0.5);
    expect(posicaoHoje(evs, '2027-01-11')).toBeCloseTo(1);
    expect(posicaoHoje(evs, '2027-06-01')).toBe(2);
    expect(posicaoHoje([], '2027-01-01')).toBe(0);
  });
});

describe('MarketingPage', () => {
  it('mostra todos os eventos e filtra por categoria', () => {
    render(<MarketingPage />);
    expect(screen.getAllByTestId('evento')).toHaveLength(MARKETING_EVENTOS.length);

    const filtros = screen.getByRole('group', { name: /filtrar por categoria/i });
    fireEvent.click(within(filtros).getByRole('button', { name: /lançamento/i }));
    const n = MARKETING_EVENTOS.filter(e => e.categoria === 'lancamento').length;
    expect(screen.getAllByTestId('evento')).toHaveLength(n);

    fireEvent.click(within(filtros).getByRole('button', { name: /todos/i }));
    expect(screen.getAllByTestId('evento')).toHaveLength(MARKETING_EVENTOS.length);
  });

  it('tem o marcador "Hoje" e o traço preenchido', () => {
    render(<MarketingPage />);
    expect(screen.getByTestId('marcador-hoje')).toBeInTheDocument();
    expect(screen.getByTestId('traco-preenchido')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ControlRecord } from '@/types/data';
import { diasUteisEntre, diasUteisAteFimDeAno, faltaObjetivo } from '@/lib/fecho-ano';

let CAN_VIEW = true;
let DATA: unknown = {};
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ data: DATA }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canView: () => CAN_VIEW }) }));

import { FechoAnoCard } from '@/components/FechoAnoCard';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('dias úteis', () => {
  it('exclui fins de semana e feriados (1, 8 e 25 de dezembro)', () => {
    // Dezembro de 2026: 1 = terça (feriado), 8 = terça (feriado), 25 = sexta (feriado).
    expect(diasUteisEntre(d(2026, 12, 1), d(2026, 12, 31))).toBe(23 - 3);
  });

  it('conta o próprio dia se for útil e dá 0 num fim de semana a fechar', () => {
    expect(diasUteisEntre(d(2026, 12, 30), d(2026, 12, 31))).toBe(2);   // quarta e quinta
    expect(diasUteisEntre(d(2026, 12, 26), d(2026, 12, 27))).toBe(0);   // sáb e dom
  });

  it('diasUteisAteFimDeAno usa o ano de hoje', () => {
    expect(diasUteisAteFimDeAno(d(2026, 11, 22))).toBe(diasUteisEntre(d(2026, 11, 22), d(2026, 12, 31)));
  });
});

describe('faltaObjetivo', () => {
  it('calcula o que falta e o ritmo por dia útil', () => {
    expect(faltaObjetivo(100, 60, 20)).toEqual({ objetivo: 100, real: 60, falta: 40, porDiaUtil: 2, atingido: false });
  });
  it('objetivo atingido ou ultrapassado não pede ritmo', () => {
    expect(faltaObjetivo(100, 120, 20)).toMatchObject({ falta: 0, porDiaUtil: null, atingido: true });
  });
  it('sem objetivo ou sem dias úteis', () => {
    expect(faltaObjetivo(0, 5, 10)).toBeNull();
    expect(faltaObjetivo(100, 10, 0)).toMatchObject({ falta: 90, porDiaUtil: null });
  });
});

const rec = (): ControlRecord => ({
  status: 'Retail', neg: null, mes1: '2026/11', resp: 'BR', cliente: '', type: 'VN', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, ret: 0, fin: '', week198: '',
  dmat: null, date298: null, dfat: null, obs: '',
});

describe('FechoAnoCard', () => {
  const hoje = d(2026, 11, 22);
  DATA = {
    control: [rec(), rec(), rec(), rec()],
    objetivosTotal: [{ mes: '2026/11', orcado: 24, range2: 20, range3: 22, real: 0 }],
    objetivosResp: [],
  };

  it('mostra os dias úteis e o que falta para GSC e BMW', () => {
    CAN_VIEW = true;
    render(<FechoAnoCard hoje={hoje} />);
    expect(screen.getByTestId('fecho-dias')).toHaveTextContent(String(diasUteisAteFimDeAno(hoje)));
    expect(screen.getByTestId('fecho-GSC')).toHaveTextContent('4 / 24');
    expect(screen.getByTestId('fecho-GSC')).toHaveTextContent('Faltam 20 retails');
    expect(screen.getByTestId('fecho-BMW')).toHaveTextContent('Faltam 16 retails');
  });

  it('sem acesso a Objetivos só mostra o contador de dias', () => {
    CAN_VIEW = false;
    render(<FechoAnoCard hoje={hoje} />);
    expect(screen.getByTestId('fecho-dias')).toBeInTheDocument();
    expect(screen.queryByTestId('fecho-GSC')).toBeNull();
  });

  it('não aparece fora da janela nem noutro ano', () => {
    CAN_VIEW = true;
    const { container, rerender } = render(<FechoAnoCard hoje={d(2026, 10, 31)} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FechoAnoCard hoje={hoje} ano={2025} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect } from 'vitest';
import { computeScore, fleetScoreValue, SCORE_WEIGHTS, isOverdue, isDueToday, type Task } from '@/lib/prospec';

/* O score composto é calculado na BD (coluna GENERATED) e espelhado em computeScore
 * para exibição em tempo real no formulário. A dimensão da frota é um patamar
 * (0 = sem frota · 1 = 3–14 · 2 = 15+) convertido para a escala 1–5 (0/3/5). */
describe('fleetScoreValue', () => {
  it('mapeia os patamares para a escala 1–5', () => {
    expect(fleetScoreValue(0)).toBe(0);
    expect(fleetScoreValue(1)).toBe(3);
    expect(fleetScoreValue(2)).toBe(5);
    expect(fleetScoreValue(null)).toBe(0);
  });
});

describe('computeScore', () => {
  it('usa os pesos 0.5 / 0.3 / 0.2', () => {
    expect(SCORE_WEIGHTS).toEqual({ potencial: 0.5, dimensao_frota: 0.3, relacao: 0.2 });
  });

  it('máximo (potencial 5 · frota 15+ · relação 5) = 5', () => {
    expect(computeScore(5, 2, 5)).toBe(5);
  });

  it('média ponderada arredondada a 2 casas', () => {
    // 4*0.5 + fleet(1)=3 *0.3 + 5*0.2 = 2 + 0.9 + 1 = 3.9
    expect(computeScore(4, 1, 5)).toBe(3.9);
  });

  it('sem frota não contribui para o score', () => {
    // 4*0.5 + 0 + 5*0.2 = 3
    expect(computeScore(4, 0, 5)).toBe(3);
  });

  it('trata nulos como 0', () => {
    expect(computeScore(null, null, null)).toBe(0);
    expect(computeScore(4, null, null)).toBe(2);
  });
});

describe('isOverdue', () => {
  const base: Task = {
    id: '1', type: 'todo', account_id: null, owner_email: null, owner_nome: null,
    descricao: 'x', due_at: null, done: false, done_at: null, created_by: null,
    created_at: '', updated_at: '',
  };

  it('não atrasada sem prazo', () => {
    expect(isOverdue({ ...base, due_at: null })).toBe(false);
  });

  it('atrasada quando o prazo já passou e não está concluída', () => {
    expect(isOverdue({ ...base, due_at: new Date(Date.now() - 1000).toISOString() })).toBe(true);
  });

  it('nunca atrasada se concluída', () => {
    expect(isOverdue({ ...base, done: true, due_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });

  it('não atrasada com prazo futuro', () => {
    expect(isOverdue({ ...base, due_at: new Date(Date.now() + 60000).toISOString() })).toBe(false);
  });
});

describe('isDueToday', () => {
  const base: Task = {
    id: '1', type: 'todo', account_id: null, owner_email: null, owner_nome: null,
    descricao: 'x', due_at: null, done: false, done_at: null, created_by: null,
    created_at: '', updated_at: '',
  };
  const atHour = (h: number) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };

  it('falso sem prazo', () => {
    expect(isDueToday({ ...base, due_at: null })).toBe(false);
  });

  it('verdadeiro com prazo hoje, mesmo que a hora já tenha passado', () => {
    expect(isDueToday({ ...base, due_at: atHour(0) })).toBe(true);
    expect(isDueToday({ ...base, due_at: atHour(23) })).toBe(true);
  });

  it('falso se concluída', () => {
    expect(isDueToday({ ...base, done: true, due_at: atHour(12) })).toBe(false);
  });

  it('falso para outro dia', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(isDueToday({ ...base, due_at: tomorrow })).toBe(false);
    expect(isDueToday({ ...base, due_at: yesterday })).toBe(false);
  });
});

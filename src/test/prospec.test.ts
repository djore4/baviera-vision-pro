import { describe, it, expect } from 'vitest';
import { computeScore, SCORE_WEIGHTS, isOverdue, type Task } from '@/lib/prospec';

/* O score composto é calculado na BD (coluna GENERATED) e espelhado em computeScore
 * para exibição em tempo real no formulário. Estes testes garantem que os pesos
 * (0.5 · 0.3 · 0.2) e o arredondamento se mantêm alinhados com a migração. */
describe('computeScore', () => {
  it('usa os pesos 0.5 / 0.3 / 0.2', () => {
    expect(SCORE_WEIGHTS).toEqual({ potencial: 0.5, dimensao_frota: 0.3, relacao: 0.2 });
  });

  it('máximo (5/5/5) = 5', () => {
    expect(computeScore(5, 5, 5)).toBe(5);
  });

  it('média ponderada arredondada a 2 casas', () => {
    // 4*0.5 + 2*0.3 + 5*0.2 = 2 + 0.6 + 1 = 3.6
    expect(computeScore(4, 2, 5)).toBe(3.6);
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

import { describe, it, expect } from 'vitest';
import { toLocalIsoDay } from '@/lib/utils';

// Regressão: as datas do Excel recuavam um dia ao gravar (toISOString em UTC).
// O fuso é fixado via TZ no script de teste; o teste adapta-se ao fuso em que corre.
describe('toLocalIsoDay', () => {
  it('mantém o dia civil local (meia-noite local)', () => {
    expect(toLocalIsoDay(new Date(2026, 9, 5))).toBe('2026-10-05'); // 5 out
    expect(toLocalIsoDay(new Date(2026, 9, 1))).toBe('2026-10-01'); // dia 1 não cai no mês anterior
  });

  it('absorve pequenos desvios de segundos do XLSX', () => {
    expect(toLocalIsoDay(new Date(2026, 8, 30, 23, 59, 58))).toBe('2026-10-01');
    expect(toLocalIsoDay(new Date(2026, 9, 1, 0, 0, 3))).toBe('2026-10-01');
  });
});

import { describe, it, expect } from 'vitest';
import { seasonalFlags, forcedSeason } from '@/lib/seasonal';

const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h);

describe('seasonalFlags', () => {
  it('xmas: de 1 de dezembro a 6 de janeiro', () => {
    expect(seasonalFlags(d(2026, 11, 30)).xmas).toBe(false);
    expect(seasonalFlags(d(2026, 12, 1)).xmas).toBe(true);
    expect(seasonalFlags(d(2026, 12, 31)).xmas).toBe(true);
    expect(seasonalFlags(d(2027, 1, 6)).xmas).toBe(true);
    expect(seasonalFlags(d(2027, 1, 7)).xmas).toBe(false);
  });

  it('fechoAno: de 15 de novembro a 31 de dezembro', () => {
    expect(seasonalFlags(d(2026, 11, 14)).fechoAno).toBe(false);
    expect(seasonalFlags(d(2026, 11, 15)).fechoAno).toBe(true);
    expect(seasonalFlags(d(2026, 12, 31)).fechoAno).toBe(true);
    expect(seasonalFlags(d(2027, 1, 2)).fechoAno).toBe(false);
  });

  it('?season=xmas força o Natal fora de época, sem afetar o fecho de ano', () => {
    const f = seasonalFlags(d(2026, 7, 10), forcedSeason('?season=xmas'));
    expect(f.xmas).toBe(true);
    expect(f.fechoAno).toBe(false);
    expect(seasonalFlags(d(2026, 7, 10), forcedSeason('?season=outra')).xmas).toBe(false);
    expect(forcedSeason('')).toBeNull();
  });

  it('mantém sexta à tarde e 1 de abril', () => {
    expect(seasonalFlags(d(2026, 11, 20, 16)).fridayPM).toBe(true);   // sexta
    expect(seasonalFlags(d(2026, 11, 20, 10)).fridayPM).toBe(false);
    expect(seasonalFlags(d(2026, 4, 1)).aprilFools).toBe(true);
  });
});

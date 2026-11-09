import { describe, expect, it } from 'vitest';
import { MODELOS_BMW, versoesSugeridas } from '@/lib/demo-vehicles';

describe('modelo M', () => {
  it('é uma linha de modelo própria', () => {
    expect(MODELOS_BMW).toContain('M');
  });
  it('sugere as versões M (sem distinguir maiúsculas)', () => {
    for (const m of ['M', 'm', ' M ']) {
      expect(versoesSugeridas(m)).toEqual(
        ['M2', 'M3', 'M4', 'M5', 'M8', 'X3M', 'X4M', 'X5M', 'X6M', 'XM'],
      );
    }
  });
  it('não sugere versões para outros modelos', () => {
    expect(versoesSugeridas('X5')).toEqual([]);
  });
});

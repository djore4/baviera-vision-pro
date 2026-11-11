import { describe, it, expect } from 'vitest';
import { comissaoFixa, chaveComissao } from '@/lib/demo-comissao';

describe('comissão fixa das demos', () => {
  it.each([
    ['Série 1', '120', 125], ['Série 2', '225e Active Tourer', 125], ['X1', 'iX1 20e', 125], ['X2', 'iX2 20e', 125],
    ['Série 3', '330e Tou', 175], ['Série 3', 'i3 50e', 175], ['Série 4', '420d Gran Coupé', 175],
    ['Série 5', '530e Touring', 225], ['Série 5', 'i5 40e', 225], ['X3', 'iX3 50 xDrive', 225], ['iX3', '40', 225], ['Z4', '', 225],
    ['X5', '50E', 350], ['X7', 'xDrive40d', 350], ['iX', 'xDrive45', 350], ['Série 7', '', 350],
    ['M', 'M2 Competition', 350], ['M', 'M3 CS Touring', 350], ['Série 2', 'M2 Coupé', 350],
    ['M', 'XM 50e', 500], ['M', 'M8', 500], ['M', 'X5 M Competition', 500], ['M', 'X6M', 500], ['M', 'X3M', 350], ['M', 'X4 M Competition', 350], ['X3', 'X3 M', 350], ['X4', 'X4M', 350],
  ])('%s %s → %s €', (modelo, versao, valor) => {
    expect(comissaoFixa(modelo, versao)).toBe(valor);
  });

  it('versões M Performance de uma série ficam na série (M240i, M135, M440d, M35i)', () => {
    expect(comissaoFixa('Série 2', 'M240i')).toBe(125);
    expect(comissaoFixa('Série 1', 'M135 xDrive')).toBe(125);
    expect(comissaoFixa('Série 4', 'M440d')).toBe(175);
    expect(comissaoFixa('X2', 'M35i xDrive')).toBe(125);
    expect(comissaoFixa('X5', 'M60i')).toBe(350);
    expect(comissaoFixa('X3', 'M40i')).toBe(225);
  });

  it('M1 vale 175 e modelos fora da tabela não têm comissão', () => {
    expect(chaveComissao('M', 'M1')).toBe('M1');
    expect(comissaoFixa('M', 'M1')).toBe(175);
    expect(comissaoFixa('R', '1300 GSA')).toBeNull();
    expect(comissaoFixa(null, null)).toBeNull();
  });
});

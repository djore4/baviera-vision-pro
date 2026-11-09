import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { descontoMaxPara, descMaxAplicavel, descMaxAcumulado, GRUPOS_DESC_MAX } from '@/lib/descontosMax';
import { calcularEscalao30 } from '@/lib/escaloes30';
import { PRICE_FIELDS } from '@/lib/precoCampos';
import { tipoFlags } from '@/lib/demoPricing';

const t = (...tip: string[]) => tipoFlags(tip);

describe('descontos máximos por modelo', () => {
  it('encontra a linha pelo modelo e pela tipologia (BEV, PHEV, ICE)', () => {
    expect(descontoMaxPara('iX1', t('BEV'))?.linha.modelos).toEqual(['iX1', 'iX2']);
    expect(descontoMaxPara('iX', t('BEV'))?.linha.modelos).toEqual(['i4', 'iX']); // iX não é iX1
    expect(descontoMaxPara('Série 3 Touring', t('PHEV'))?.grupo).toBe('PHEV');
    expect(descontoMaxPara('Série 3', t('ICE'))?.linha.com.max).toBe(0.12);
    expect(descontoMaxPara('Série 3', t('xEV'))?.linha.com.max).toBe(0.16);
    expect(descontoMaxPara('série 5', t('ICE'))?.grupo).toBe('ICE (Motor Combustão)');
  });

  it('os M entram em "M & MPA"; modelo desconhecido → null', () => {
    expect(descontoMaxPara('M3', t('ICE', 'M'))?.linha.modelos).toContain('M & MPA');
    expect(descontoMaxPara('Z8', t('ICE'))).toBeNull();
    expect(descontoMaxPara('', t('ICE'))).toBeNull();
    expect(descontoMaxPara(null, t('ICE'))).toBeNull();
  });

  it('com/sem 19% de opcionais conforme a penetração; só "com" vale para os dois casos', () => {
    const l = descontoMaxPara('iX1', t('BEV'))!.linha;
    expect(descMaxAplicavel(l, 0.10)).toMatchObject({ comIncorporacao: false, valor: { max: 0.10 } });
    expect(descMaxAplicavel(l, 0.19)).toMatchObject({ comIncorporacao: true, valor: { max: 0.13 } });
    const so = descontoMaxPara('i4', t('BEV'))!.linha;
    expect(descMaxAplicavel(so, 0).valor.max).toBe(0.15);
  });

  it('acumulação mensal: mensal × períodos, limitada ao máximo; sem mensal aplica-se logo', () => {
    expect(descMaxAcumulado({ max: 0.13, mensal: 0.0216 }, 2)).toBeCloseTo(0.0432);
    expect(descMaxAcumulado({ max: 0.13, mensal: 0.0216 }, 20)).toBe(0.13);
    expect(descMaxAcumulado({ max: 0.10, mensal: null }, 0)).toBe(0.10);
    expect(descMaxAcumulado({ max: 0.13, mensal: 0.0216 }, -3)).toBe(0);
  });

  it('o máximo é sempre ≥ o do cenário sem 19% e os dados são coerentes', () => {
    for (const g of GRUPOS_DESC_MAX) for (const l of g.linhas) {
      if (l.sem) expect(l.com.max).toBeGreaterThanOrEqual(l.sem.max);
      expect(l.com.max).toBeGreaterThan(0);
    }
  });
});

describe('escalões de 30 dias (como na Sales Force)', () => {
  const hoje = new Date(2026, 2, 5); // 5 mar 2026
  it('conta dias, períodos completos e dias até ao próximo escalão', () => {
    const e = calcularEscalao30('2026-01-01', hoje)!;
    expect(e).toMatchObject({ dias: 63, periodos: 2, faltam: 27, futura: false });
    expect(e.proxima.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(calcularEscalao30('2026-03-05', hoje)).toMatchObject({ dias: 0, periodos: 0, faltam: 30 });
    expect(calcularEscalao30('2026-02-03', hoje)).toMatchObject({ dias: 30, periodos: 1, faltam: 30 });
  });
  it('data futura e datas inválidas', () => {
    expect(calcularEscalao30('2026-03-10', hoje)).toMatchObject({ futura: true, periodos: 0, faltam: 5 });
    expect(calcularEscalao30(null, hoje)).toBeNull();
    expect(calcularEscalao30('x', hoje)).toBeNull();
  });
});

describe('janela de preço ↔ base de dados', () => {
  it('edita exatamente os 13 valores que demos_gravar_precos aceita', () => {
    const sql = readFileSync('supabase/migrations/20261109211555_demos_colunas_precos.sql', 'utf8');
    const m = /allowed constant text\[\] := array\[([^\]]+)\]/.exec(sql)![1];
    const db = [...m.matchAll(/'(\w+)'/g)].map(x => x[1]);
    expect([...PRICE_FIELDS].sort()).toEqual(db.sort());
  });
});

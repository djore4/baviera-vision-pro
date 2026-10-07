import { describe, it, expect } from 'vitest';
import {
  analisePvp, calcIsv, custosTotais, idadeEmMeses, pvpParaMargem, reducaoPorIdade,
  type IsvInput, type OperacaoInput,
} from '@/lib/importacao';
import type { IsvTables } from '@/lib/importacao-isv-tables';

// Tabelas SINTÉTICAS: testam a mecânica do cálculo, não os valores legais.
const T: IsvTables = {
  ano: 2026,
  verified: true,
  cilindrada: [
    { ate: 1000, taxa: 1, abater: 500 },
    { ate: Infinity, taxa: 5, abater: 4000 },
  ],
  co2: {
    'gasolina-WLTP': [{ ate: 100, taxa: 10, abater: 500 }, { ate: Infinity, taxa: 20, abater: 1500 }],
    'gasolina-NEDC': [],
    'diesel-WLTP': [{ ate: Infinity, taxa: 30, abater: 2000 }],
    'diesel-NEDC': [],
  },
  reducaoIdade: [
    { ateAnos: 1, pct: 0.1 },
    { ateAnos: 2, pct: 0.2 },
    { ateAnos: Infinity, pct: 0.5 },
  ],
  phevReducao: 0.75,
  agravamentoParticulas: 500,
};

const HOJE = new Date(2026, 9, 7); // 7 out 2026
const base: IsvInput = {
  combustivel: 'gasolina', homologacao: 'WLTP', cilindradaCc: 1500, co2GKm: 120,
  primeiraMatricula: '', dieselParticulasAcima: false, ambientalManual: null, totalManual: null,
};

describe('idade e redução', () => {
  it('conta meses completos desde a 1.ª matrícula', () => {
    expect(idadeEmMeses('2026-10', HOJE)).toBe(0);
    expect(idadeEmMeses('2025-10', HOJE)).toBe(12);
    expect(idadeEmMeses('2020-01', HOJE)).toBe(81);
    expect(idadeEmMeses('', HOJE)).toBeNull();
  });
  it('escalões "até N anos" são inclusivos', () => {
    expect(reducaoPorIdade(12, T)).toBe(0.1);
    expect(reducaoPorIdade(13, T)).toBe(0.2);
    expect(reducaoPorIdade(25, T)).toBe(0.5);
    expect(reducaoPorIdade(null, T)).toBe(0);
  });
});

describe('calcIsv', () => {
  it('soma cilindrada e ambiental pelos escalões (sem idade)', () => {
    // cil: 1500×5−4000 = 3500; co2: 120×20−1500 = 900
    const r = calcIsv(base, T, HOJE);
    expect(r.cilindrada).toBe(3500);
    expect(r.ambiental).toBe(900);
    expect(r.total).toBe(4400);
  });

  it('limite do escalão é inclusivo', () => {
    // 100 g/km cai no 1.º escalão: 100×10−500 = 500
    expect(calcIsv({ ...base, co2GKm: 100 }, T, HOJE).ambiental).toBe(500);
  });

  it('aplica a redução por idade às duas componentes', () => {
    const r = calcIsv({ ...base, primeiraMatricula: '2023-10' }, T, HOJE); // 36 meses → 50 %
    expect(r.reducaoIdadePct).toBe(0.5);
    expect(r.total).toBe(2200);
  });

  it('o imposto nunca é negativo', () => {
    // 500 cc: 500×1−500 = 0
    expect(calcIsv({ ...base, cilindradaCc: 500 }, T, HOJE).cilindrada).toBe(0);
    expect(calcIsv({ ...base, cilindradaCc: 400 }, T, HOJE).cilindrada).toBe(0);
  });

  it('elétrico não paga ISV', () => {
    expect(calcIsv({ ...base, combustivel: 'eletrico' }, T, HOJE).total).toBe(0);
  });

  it('PHEV: desconto de 75 % depois da redução por idade', () => {
    const r = calcIsv({ ...base, combustivel: 'phev', primeiraMatricula: '2023-10' }, T, HOJE);
    expect(r.total).toBe(550); // 2200 × 25 %
  });

  it('diesel com partículas acima do limite leva o agravamento', () => {
    const d: IsvInput = { ...base, combustivel: 'diesel', cilindradaCc: 1000, co2GKm: 100 };
    // cil 500; co2 100×30−2000 = 1000; +500
    expect(calcIsv({ ...d, dieselParticulasAcima: true }, T, HOJE).total).toBe(2000);
    expect(calcIsv(d, T, HOJE).total).toBe(1500);
  });

  it('tabela de CO2 vazia pede o valor manual em vez de assumir 0', () => {
    const r = calcIsv({ ...base, homologacao: 'NEDC' }, T, HOJE);
    expect(r.ambientalEmFalta).toBe(true);
    expect(r.ambiental).toBe(0);
    const m = calcIsv({ ...base, homologacao: 'NEDC', ambientalManual: 1000 }, T, HOJE);
    expect(m.ambientalEmFalta).toBe(false);
    expect(m.total).toBe(4500);
  });

  it('o total manual tem prioridade sobre tudo', () => {
    const r = calcIsv({ ...base, totalManual: 1234.5, combustivel: 'eletrico' }, T, HOJE);
    expect(r.total).toBe(1234.5);
    expect(r.manual).toBe(true);
  });
});

describe('operação: IVA e margem', () => {
  const op: OperacaoInput = {
    compra: 10000, transporte: 500, legalizacao: 300, preparacao: 200, outros: 0, isv: 1000,
    regime: 'margem', ivaPct: 23,
  };

  it('soma os custos', () => {
    expect(custosTotais(op).total).toBe(12000);
  });

  it('regime de margem: IVA só sobre (PVP − compra)', () => {
    const a = analisePvp(op, 14000);
    // IVA = 4000 × 23/123 = 747,97
    expect(a.iva).toBeCloseTo(747.97, 2);
    expect(a.receitaLiquida).toBeCloseTo(13252.03, 2);
    expect(a.margemEur).toBeCloseTo(1252.03, 2);
    expect(a.margemPctCusto).toBeCloseTo(0.10434, 4);
  });

  it('regime normal: IVA sobre o PVP todo', () => {
    const a = analisePvp({ ...op, regime: 'normal' }, 14760);
    expect(a.iva).toBeCloseTo(2760, 2);
    expect(a.margemEur).toBeCloseTo(0, 2);
  });

  it('sem margem sobre a compra, não há IVA', () => {
    expect(analisePvp(op, 9000).iva).toBe(0);
  });

  it('pvpParaMargem e analisePvp são inversos (margem e normal)', () => {
    for (const regime of ['margem', 'normal'] as const) {
      for (const m of [0, 0.05, 0.12, 0.3]) {
        const o = { ...op, regime };
        const a = analisePvp(o, pvpParaMargem(o, m));
        expect(a.margemPctCusto!).toBeCloseTo(m, 3);
      }
    }
  });

  it('margem alvo abaixo da compra: PVP = custo × (1+m), sem IVA', () => {
    const o = { ...op, compra: 20000, isv: 0, transporte: 0, legalizacao: 0, preparacao: 0 };
    expect(pvpParaMargem(o, -0.5)).toBe(10000);
  });

  it('custo zero não rebenta', () => {
    const z: OperacaoInput = { ...op, compra: 0, transporte: 0, legalizacao: 0, preparacao: 0, isv: 0 };
    expect(analisePvp(z, 1000).margemPctCusto).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { calcPricing, tipoFlags } from '@/lib/demoPricing';

// Valores de referência: linhas do Excel "PARQUE BMW" (folha PREÇOS).
describe('calcPricing (racional do Excel)', () => {
  it('iX 45e (VNG, BEV): PVP, DSC €, IVA, P Custo, Margem e PVP s/IVA', () => {
    const p = calcPricing({
      pvb: 70725.15, opc: 10577.23, bsi: 0, eco: 4.2, leg: 1550, isv: 0,
      mgb: 0.08, esf: 0.05, pac: 0, dem: 0.025 * 6, sup: 0,
      pvp_desc: 76874, depreciacoes: 9756.2856,
    }, tipoFlags(['xEV', 'BEV']));
    expect(p.pvp).toBeCloseTo(101913.59, 1);
    expect(p.desc_eur).toBeCloseTo(22764.67, 1);
    expect(p.iva).toBeCloseTo(13821.14, 1);
    expect(p.p_custo).toBeCloseTo(73913.05, 1);
    expect(p.margem).toBeCloseTo(12717.23, 1);
    expect(p.pvp_sem_iva).toBeCloseTo(76874 / 1.23, 2);
  });

  it('225e (Aveiro): BSI entra no PVP mas não no P Custo', () => {
    const p = calcPricing({
      pvb: 38230.86, opc: 930.9, bsi: -461.79, eco: 4.2, leg: 1550, isv: 545.07,
      mgb: 0.07, esf: 0.05, pac: 0.06, dem: 0.015 * 6, sup: 0,
      pvp_desc: 39990, depreciacoes: 2239,
    }, tipoFlags(['xEV']));
    expect(p.pvp).toBeCloseTo(50183.07, 1);
    expect(p.p_custo).toBeCloseTo(37745.45, 1);
    expect(p.margem).toBeCloseTo(4483.55, 1);
  });

  it('ICE: PVP s/IVA é o próprio PVP DESC (IVA não dedutível)', () => {
    const p = calcPricing({
      pvb: 1000, opc: 0, bsi: 0, eco: 0, leg: 0, isv: 0,
      mgb: 0, esf: 0, pac: 0, dem: 0, sup: 0, pvp_desc: 1230, depreciacoes: 0,
    }, tipoFlags(['ICE']));
    expect(p.pvp_sem_iva).toBe(1230);
    expect(p.iva_dedutivel).toBe(false);
  });
});

describe('tipoFlags', () => {
  it('BEV implica xEV e ignora maiúsculas', () => {
    expect(tipoFlags(['bev', 'QOR'])).toEqual({ ice: false, xev: true, bev: true, qor: true, m: false });
  });
});

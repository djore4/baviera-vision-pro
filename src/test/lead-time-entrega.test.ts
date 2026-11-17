import { describe, it, expect } from 'vitest';
import { calcLeadTimeEntrega, chassisKey, type EntradasParque } from '@/lib/lead-time-entrega';
import type { ControlRecord } from '@/types/data';

const d = (s: string) => new Date(s);
const rec = (o: Partial<ControlRecord>): ControlRecord => ({
  status: 'Retail', neg: null, mes1: '', resp: 'Ana', cliente: '', type: 'VN', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, ret: 0, fin: '', week198: 'P',
  dmat: null, date298: null, dfat: null, obs: '', ...o,
});

describe('calcLeadTimeEntrega', () => {
  const entradas: EntradasParque = new Map([
    ['AAA', d('2026-11-01')],
    ['BBB', d('2026-11-01')],
    ['CCC', d('2026-11-10')],
    ['OLD', null], // já estava em parque antes do registo
  ]);

  it('calcula dias parque→certificado por comercial, com chassis normalizado', () => {
    const r = calcLeadTimeEntrega([
      rec({ chas: ' aaa ', date298: d('2026-11-11') }),            // 10 d
      rec({ chas: 'BBB', date298: d('2026-11-21') }),              // 20 d
      rec({ chas: 'CCC', resp: 'Rui', date298: d('2026-11-13') }), // 3 d
    ], [], entradas);
    expect(r.equipa).toMatchObject({ n: 3, median: 10, mean: 11 });
    const ana = r.porResp.find(x => x.resp === 'Ana')!;
    expect(ana).toMatchObject({ n: 2, median: 15, mean: 15 });
    expect(r.porResp.find(x => x.resp === 'Rui')).toMatchObject({ n: 1, median: 3 });
  });

  it('exclui entregas sem data de entrada e as incoerentes, sem as misturar na média', () => {
    const r = calcLeadTimeEntrega([
      rec({ chas: 'OLD', date298: d('2026-11-11') }),     // data desconhecida
      rec({ chas: 'ZZZ', date298: d('2026-11-11') }),     // sem registo
      rec({ chas: 'CCC', date298: d('2026-11-05') }),     // entrega antes da entrada
      rec({ chas: 'AAA', date298: d('2026-11-06') }),     // 5 d
    ], [], entradas);
    expect(r.equipa).toMatchObject({ n: 1, mean: 5, semData: 2 });
    expect(r.incoerentes).toBe(1);
  });

  it('conta o que está em parque agora e a sua idade (só com data conhecida)', () => {
    const r = calcLeadTimeEntrega([], [
      rec({ status: 'Carteira', chas: 'CCC', week198: 'P' }),   // 7 d a 17-nov
      rec({ status: 'Carteira', chas: 'OLD', week198: 'P' }),   // sem data
      rec({ status: 'Retail', chas: 'AAA', week198: 'P' }),     // já entregue: não conta
      rec({ status: 'Carteira', chas: 'XXX', week198: '47' }),  // não está em parque
    ], entradas, d('2026-11-17'));
    expect(r.equipa).toMatchObject({ emParque: 2, idadeParque: 7 });
  });

  it('chassisKey normaliza', () => {
    expect(chassisKey('  wba1 ')).toBe('WBA1');
    expect(chassisKey(null)).toBe('');
  });
});

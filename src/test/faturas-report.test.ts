import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFaturasReport, resolveFaturas, planFaturas, chassisKey } from '@/lib/faturas-report';
import type { ControlRecord } from '@/types/data';

const serial = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;

function report(lines: (string | number)[][]): ArrayBuffer {
  const aoa = [
    ['', '', ''],
    ['Caetano Baviera Portugal, SA / Aveiro'],
    ['Português (Portugal)', '', '', '', 'VN - Vendas VN'],
    ['Seção', 'Processo', '', 'VIN', 'Dt. Fat. Venda', 'Dt. Matricula', 'Total Venda', 'Estado'],
    ...lines,
    [],
    ['7.00', '7.00'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
const line = (vin: string, fat: number[], mat: number[] | null, total: number, estado = 'Faturado') =>
  ['VN', 'P', '', vin, serial(fat[0], fat[1], fat[2]), mat ? serial(mat[0], mat[1], mat[2]) : '', total, estado];

const rec = (over: Partial<ControlRecord>): ControlRecord => ({
  id: 'x', status: 'Carteira', neg: null, mes1: '', resp: 'NC', cliente: 'C', type: 'VN', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, ret: 0, fin: '', week198: '',
  dmat: null, date298: null, dfat: null, obs: '', ...over,
});

describe('relatório de faturas', () => {
  it('chassis: 7 últimos caracteres do VIN', () => {
    expect(chassisKey('WBA51JB040FX46063')).toBe('FX46063');
    expect(chassisKey('fx46063')).toBe('FX46063');
    expect(chassisKey('123')).toBe('');
  });

  it('lê o relatório com linhas de título e ignora rodapé', () => {
    const rows = parseFaturasReport(report([line('WBA51JB040FX46063', [2026, 11, 5], [2026, 11, 4], 64015.63)]));
    expect(rows).toEqual([{ vin: 'WBA51JB040FX46063', dfat: '2026-11-05', dmat: '2026-11-04', total: 64015.63, estado: 'Faturado' }]);
  });

  it('falha com mensagem clara se não for o relatório certo', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b']]), 'S');
    expect(() => parseFaturasReport(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))).toThrow(/VIN/);
  });

  it('movimentos que neutralizam a fatura: viatura fica sem fatura; senão vale o resultado', () => {
    const rows = parseFaturasReport(report([
      line('WBA51JB040FX46063', [2026, 11, 5], null, 1000),
      line('WBA51JB040FX46063', [2026, 11, 8], null, -1000),   // anulada
      line('WBA71BX0X07W88199', [2026, 11, 5], null, 1000),
      line('WBA71BX0X07W88199', [2026, 11, 6], null, -1000),   // anulada…
      line('WBA71BX0X07W88199', [2026, 11, 9], [2026, 11, 7], 1200), // …e refaturada
      line('WBY61HD020FX52763', [2026, 11, 9], null, -500),    // só nota de crédito
    ]));
    const r = resolveFaturas(rows);
    expect(r.anuladas.sort()).toEqual(['WBA51JB040FX46063', 'WBY61HD020FX52763']);
    expect(r.movimentos).toEqual([{ vin: 'WBA71BX0X07W88199', dfat: '2026-11-09', dmat: '2026-11-07' }]);
  });

  it('plano: preenche, substitui (o relatório manda), ignora iguais, sem correspondência e ambíguos', () => {
    const rows = parseFaturasReport(report([
      line('WBY11HM0805841446', [2026, 11, 3], [2026, 11, 2], 1),   // preencher
      line('WBA51JB040FX46063', [2026, 11, 5], [2026, 11, 4], 1),   // substituir dfat
      line('WBA31HR050DA75393', [2026, 11, 6], [2026, 11, 5], 1),   // igual
      line('WBA71BX0X07W88199', [2026, 11, 9], null, 1),            // sem correspondência
      line('WBA51JB010FX46067', [2026, 11, 10], null, 1),           // ambíguo
    ]));
    const records = [
      rec({ id: 'a', chas: '5841446', dfat: null, dmat: null }),
      rec({ id: 'b', chas: 'FX46063', dfat: new Date('2026-11-01'), dmat: new Date('2026-11-04') }),
      rec({ id: 'c', chas: 'DA75393', dfat: new Date('2026-11-06'), dmat: new Date('2026-11-05') }),
      rec({ id: 'd1', chas: 'FX46067' }), rec({ id: 'd2', chas: 'FX46067' }),
      rec({ id: 'e', chas: '' }),
    ];
    const p = planFaturas(records, rows);
    expect(p.alteracoes.map(a => [a.id, a.dfat?.para, a.dfat?.de ?? null, a.dmat?.para])).toEqual([
      ['a', '2026-11-03', null, '2026-11-02'],
      ['b', '2026-11-05', '2026-11-01', undefined],
    ]);
    expect(p.iguais).toBe(1);
    expect(p.semCorrespondencia).toEqual(['WBA71BX0X07W88199']);
    expect(p.ambiguos).toEqual([{ vin: 'WBA51JB010FX46067', registos: 2 }]);
  });
});

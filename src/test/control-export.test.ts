import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildControlWorkbook } from '@/lib/control-export';
import type { ControlRecord } from '@/types/data';

const rec = (over: Partial<ControlRecord>): ControlRecord => ({
  status: 'Retail', neg: null, mes1: '2026/10', resp: 'JD', cliente: 'Cliente X', type: 'VN', biz: '', enc: '',
  chas: '', mat: '', model: 'Série 5', version: '', gar: '', qor: 0, xev: 0, bev: 1, mPerf: 0,
  csc: 0, cme: null, ret: 0, fin: 'PP', week198: '', dmat: null, date298: null, app: null,
  dfat: null, obs: '', ...over,
});

describe('exportação Excel VN', () => {
  const records = [
    rec({ type: 'RMK', status: 'Matricula' }),
    rec({ date298: new Date(2026, 9, 15), obs: 'ok' }),
  ];
  const buf = XLSX.write(buildControlWorkbook(records), { type: 'array', bookType: 'xlsx', cellDates: true });
  const ws = XLSX.read(buf, { type: 'array', cellDates: true }).Sheets['CONTROL'];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  it('tem uma linha por registo, sem filtros, com cabeçalho na linha 1', () => {
    expect(rows).toHaveLength(2);
    const header = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })[0];
    expect(header).toEqual(expect.arrayContaining(['STATUS', 'RESP', 'TYPE', 'MODEL', '298', 'OBS']));
  });

  it('inclui os RMK', () => {
    expect(rows.map(r => r.TYPE)).toEqual(['RMK', 'VN']);
  });

  it('guarda as datas como datas reais', () => {
    expect(rows[1]['298']).toBeInstanceOf(Date);
    expect((rows[1]['298'] as Date).getMonth()).toBe(9);
  });

  it('liga o filtro automático a toda a tabela', () => {
    expect(ws['!autofilter']?.ref).toMatch(/^A1:[A-Z]+3$/);
  });
});

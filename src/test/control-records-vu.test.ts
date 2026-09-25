import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseVuControl, isVuWipStatus, isVuFunilStatus } from '@/lib/control-records-vu';

function buildVuFile(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['STATUS', 'RESP', 'CLIENTE', 'MODEL', 'VERSION', 'OBS'], ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'CONTROL');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseVuControl', () => {
  it('importa os status da WIP e do funil, ignorando os restantes', () => {
    const recs = parseVuControl(buildVuFile([
      ['FATURA', 'AB', 'Cliente 1', 'X1', 'sDrive18d', ''],
      ['Carteira', 'AB', 'Cliente 2', 'X3', 'xDrive30d', ''],
      ['Frio', 'CD', 'Cliente 3', 'Série 3', '320d', 'ligar'],
      [' morno ', 'CD', 'Cliente 4', '', '', ''],
      ['QUENTE', 'EF', 'Cliente 5', 'i4', 'eDrive40', ''],
      ['PERDIDO', 'EF', 'Cliente 6', '', '', ''],
    ]));
    expect(recs.map(r => r.status)).toEqual(['FATURA', 'CARTEIRA', 'FRIO', 'MORNO', 'QUENTE']);
    expect(recs.filter(r => isVuWipStatus(r.status))).toHaveLength(2);
    expect(recs.filter(r => isVuFunilStatus(r.status)).map(r => r.cliente)).toEqual(['Cliente 3', 'Cliente 4', 'Cliente 5']);
  });
});

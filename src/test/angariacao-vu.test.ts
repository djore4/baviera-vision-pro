import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseVuAngariacao } from '@/lib/angariacao-vu';

function buildFile(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const HEADER = ['DT ANG', 'RESP', 'CLIENTE', 'ANGAR', 'MAT', 'MODEL', 'VERSION', 'ANO', 'KMS', 'V COMPRA'];

describe('parseVuAngariacao', () => {
  it('lê a sheet ANGARIAÇÃO e ignora restos soltos', () => {
    const recs = parseVuAngariacao(buildFile({
      CONTROL: [['STATUS']],
      'ANGARIAÇÃO': [
        HEADER,
        [new Date(2026, 9, 4), 'mp', 'Cliente A', 'Interna', 'aa55aa', 'Série 1', 116, 2022, 60000, 15000],
        [new Date(2026, 9, 1), 'AL', 'Cliente B', 'EXTERNA', 'AA66AA', 'Série 2', 220, 2023, '15.400', '20 000 €'],
        ['', '', 'A', '', '', '', '', '', '', ''],
      ],
    }))!;
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ resp: 'MP', angar: 'INTERNA', mat: 'AA55AA', version: '116', ano: 2022, kms: 60000, vCompra: 15000 });
    expect(recs[0].dtAng?.getDate()).toBe(4);
    expect(recs[1]).toMatchObject({ kms: 15400, vCompra: 20000 });
  });

  it('devolve null quando o ficheiro não tem a sheet', () => {
    expect(parseVuAngariacao(buildFile({ CONTROL: [['STATUS']] }))).toBeNull();
  });
});

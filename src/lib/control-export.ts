import * as XLSX from 'xlsx';
import type { ControlRecord } from '@/types/data';

/* Exportação dos registos VN (control_records) para Excel — só para consulta e
 * trabalho de dados na fase de transição. Não é feita para voltar a ser importada:
 * colunas na ordem do Excel de origem, cabeçalho na linha 1, datas como datas reais
 * e filtros ligados. */

type Col = { header: string; width: number; date?: boolean; value: (r: ControlRecord) => string | number | Date | null };

const COLS: Col[] = [
  { header: 'STATUS', width: 11, value: r => r.status },
  { header: 'NEG', width: 11, date: true, value: r => r.neg },
  { header: 'MÊS', width: 9, value: r => r.mes1 },
  { header: 'RESP', width: 7, value: r => r.resp },
  { header: 'CLIENTE', width: 28, value: r => r.cliente },
  { header: 'TYPE', width: 7, value: r => r.type },
  { header: 'BIZ', width: 12, value: r => r.biz },
  { header: 'ENC', width: 12, value: r => r.enc },
  { header: 'CHAS', width: 20, value: r => r.chas },
  { header: 'MAT', width: 11, value: r => r.mat },
  { header: 'MODEL', width: 16, value: r => r.model },
  { header: 'VERSION', width: 22, value: r => r.version },
  { header: 'GAR', width: 7, value: r => r.gar },
  { header: 'QoR', width: 6, value: r => r.qor },
  { header: 'xEV', width: 6, value: r => r.xev },
  { header: 'BEV', width: 6, value: r => r.bev },
  { header: 'M', width: 5, value: r => r.mPerf },
  { header: 'CSC', width: 6, value: r => r.csc },
  { header: 'CME', width: 6, value: r => r.cme },
  { header: 'RET', width: 6, value: r => r.ret },
  { header: 'FIN', width: 8, value: r => r.fin },
  { header: '198', width: 8, value: r => r.week198 },
  { header: 'DMAT', width: 11, date: true, value: r => r.dmat },
  { header: '298', width: 11, date: true, value: r => r.date298 },
  { header: 'APP', width: 11, date: true, value: r => r.app },
  { header: 'DFAT', width: 11, date: true, value: r => r.dfat },
  { header: 'OBS', width: 40, value: r => r.obs },
];

const DATE_FMT = 'dd/mm/yyyy';

export function buildControlWorkbook(records: ControlRecord[]): XLSX.WorkBook {
  const aoa: (string | number | Date | null)[][] = [
    COLS.map(c => c.header),
    ...records.map(r => COLS.map(c => c.value(r))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  COLS.forEach((c, ci) => {
    if (!c.date) return;
    for (let ri = 1; ri < aoa.length; ri++) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
      if (cell && cell.t === 'd') cell.z = DATE_FMT;
    }
  });
  ws['!cols'] = COLS.map(c => ({ wch: c.width }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: COLS.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CONTROL');
  return wb;
}

export function exportControlExcel(records: ControlRecord[], now = new Date()): number {
  const day = now.toISOString().slice(0, 10);
  XLSX.writeFile(buildControlWorkbook(records), `control_vn_${day}.xlsx`, { cellDates: true });
  return records.length;
}

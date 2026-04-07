import * as XLSX from 'xlsx';
import type { ControlRecord, ObjetivoTotal, ObjetivoResp, AppData } from '@/types/data';

function excelDateToJS(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function str(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function num(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function numOrNull(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export function parseExcel(buffer: ArrayBuffer): AppData {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });

  // Parse CONTROL sheet
  const controlSheet = wb.Sheets['CONTROL'];
  if (!controlSheet) throw new Error('Sheet "CONTROL" não encontrada');

  const controlRaw = XLSX.utils.sheet_to_json<unknown[]>(controlSheet, {
    header: 1,
    range: 2, // start from row 3 (0-indexed row 2 = headers row 3)
    defval: '',
  });

  // Row 0 is headers, data from row 1+
  const control: ControlRecord[] = [];
  for (let i = 1; i < controlRaw.length; i++) {
    const r = controlRaw[i] as unknown[];
    if (!r || !r[1]) continue; // skip empty rows (col B = index 1)

    control.push({
      status: str(r[1]),
      neg: excelDateToJS(r[2]),
      mes1: str(r[3]),
      resp: str(r[4]),
      cliente: str(r[5]),
      local: str(r[6]),
      type: str(r[7]),
      origin: str(r[8]),
      profile: str(r[9]),
      biz: str(r[10]),
      enc: str(r[11]),
      chas: str(r[12]),
      mat: str(r[13]),
      model: str(r[14]),
      version: str(r[15]),
      gar: str(r[16]),
      qor: num(r[17]),
      xev: num(r[18]),
      bev: num(r[19]),
      mPerf: num(r[20]),
      csc: num(r[21]),
      cme: numOrNull(r[22]),
      fin: str(r[23]),
      week198: str(r[24]),
      dmat: excelDateToJS(r[25]),
      date298: excelDateToJS(r[26]),
      app: excelDateToJS(r[27]),
      obs: str(r[28]),
    });
  }

  // Parse OBJETIVOS sheet
  const objSheet = wb.Sheets['OBJETIVOS'];
  const objetivosTotal: ObjetivoTotal[] = [];
  const objetivosResp: ObjetivoResp[] = [];

  if (objSheet) {
    const objRaw = XLSX.utils.sheet_to_json<unknown[]>(objSheet, {
      header: 1,
      defval: '',
    });

    for (let i = 1; i < objRaw.length; i++) {
      const r = objRaw[i] as unknown[];
      if (!r) continue;

      // Table 1: cols B(1), D(3), E(4), F(5)
      if (r[1] && r[3]) {
        objetivosTotal.push({
          mes: str(r[1]),
          range3: num(r[2]),
          orcado: num(r[3]),
          range2: num(r[4]),
          real: num(r[5]),
        });
      }

      // Table 2: cols L(11), M(12), N(13)
      if (r[11] && r[12]) {
        objetivosResp.push({
          mes: str(r[11]),
          resp: str(r[12]),
          objetivo: num(r[13]),
        });
      }
    }
  }

  return {
    control,
    objetivosTotal,
    objetivosResp,
    lastUpdated: new Date().toLocaleString('pt-PT'),
  };
}

export function getDeliveryMonth(record: ControlRecord): string {
  if (record.date298) {
    const d = record.date298;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}/${m}`;
  }
  return record.mes1;
}

export function isRetailDelivery(r: ControlRecord): boolean {
  return r.status === 'Retail' && (r.type === 'VN' || r.type === 'VD');
}

export function isPipeline(r: ControlRecord): boolean {
  return ['Quente', 'Morno', 'Frio', 'Adiado', 'Carteira', 'Matricula'].includes(r.status);
}

export function isPortfolio(r: ControlRecord): boolean {
  return ['Carteira', 'Matricula'].includes(r.status);
}

export function isMissingApping(r: ControlRecord): boolean {
  return isRetailDelivery(r) && !r.app;
}

export function isMissingBizagi(r: ControlRecord): boolean {
  return !r.biz && r.status !== 'Perdido';
}

export function isMissingCME(r: ControlRecord): boolean {
  return r.bev === 1 && r.cme === null && r.status !== 'Perdido' && r.status !== 'Retail';
}

export function getCurrentWeek(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil((diff / oneWeek) + start.getDay() / 7);
}

export function formatDate(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleDateString('pt-PT');
}

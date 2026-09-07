import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcel, getDeliveryMonth } from '@/lib/excel-parser';
import type { ControlRecord } from '@/types/data';

const baseRecord = (over: Partial<ControlRecord>): ControlRecord => ({
  status: '', neg: null, mes1: '', resp: '', cliente: '', type: '', biz: '', enc: '',
  chas: '', mat: '', model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0,
  csc: 0, cme: null, ret: 0, fin: '', week198: '', dmat: null, date298: null, app: null,
  dfat: null, obs: '', ...over,
});

describe('getDeliveryMonth — MÊS1 manda no posicionamento', () => {
  it('usa MÊS1 mesmo quando há data de retail (298) noutro mês', () => {
    // Matrícula pedida em agosto, entrega prevista em setembro (MÊS1).
    const r = baseRecord({ mes1: '2026/09', date298: new Date('2026-08-26T00:00:00Z') });
    expect(getDeliveryMonth(r)).toBe('2026/09');
  });

  it('normaliza MÊS1 sem zero à esquerda', () => {
    expect(getDeliveryMonth(baseRecord({ mes1: '2026/9' }))).toBe('2026/09');
  });

  it('recorre à data de retail quando MÊS1 não tem mês', () => {
    const r = baseRecord({ mes1: '', date298: new Date('2026-08-26T00:00:00Z') });
    expect(getDeliveryMonth(r)).toBe('2026/08');
  });
});

/**
 * Regressão: quando se insere a coluna "RET" a meio da sheet CONTROL (na
 * posição do antigo FIN), todas as colunas seguintes deslizam. O parser tem
 * de continuar a ler cada campo da coluna certa (fin não pode apanhar o 0/1
 * da retoma, date298 não pode apanhar a data de matrícula, etc.).
 */
function buildWorkbook(headerAt20: string): ArrayBuffer {
  // Índice-base (layout sem RET): 1=status … 25=obs. RET inserida no índice 20.
  // A coluna A (índice 0) tem conteúdo no ficheiro real, por isso preenchemo-la
  // aqui também — senão o XLSX corta-a e desloca todos os índices.
  const header: (string)[] = [];
  header[0] = '#';
  header[1] = 'STATUS'; header[2] = 'NEG'; header[3] = 'MES1'; header[4] = 'RESP';
  header[5] = 'CLIENTE'; header[6] = 'TYPE'; header[7] = 'BIZ'; header[8] = 'ENC';
  header[9] = 'CHAS'; header[10] = 'MAT'; header[11] = 'MODEL'; header[12] = 'VERSION';
  header[13] = 'GAR'; header[14] = 'QOR'; header[15] = 'XEV'; header[16] = 'BEV';
  header[17] = 'M'; header[18] = 'CSC'; header[19] = 'CME';
  header[20] = headerAt20;                     // RET (coluna inserida)
  header[21] = 'FIN'; header[22] = '198'; header[23] = 'DMAT'; header[24] = '298';
  header[25] = 'APP'; header[26] = 'OBS';

  const row: unknown[] = [];
  row[0] = 1;
  row[1] = 'Carteira'; row[4] = 'BR'; row[5] = 'Cliente X'; row[6] = 'VN';
  row[14] = 1; row[16] = 1;                     // qor / bev
  row[20] = 1;                                  // RET = com retoma
  row[21] = 'FS';                              // FIN (método de pagamento)
  row[22] = 'P';                               // 198
  row[24] = new Date('2026-08-26T00:00:00Z');  // 298 (data de retail)

  const aoa = [[], [], header, row];           // linhas 0/1 são títulos; header na 3ª (range:2)
  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CONTROL');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseExcel — coluna RET inserida a meio', () => {
  it('lê fin/ret/298 das colunas corretas apesar do deslize', () => {
    const { control } = parseExcel(buildWorkbook('RET'));
    expect(control).toHaveLength(1);
    const r = control[0];
    expect(r.ret).toBe(1);
    expect(r.fin).toBe('FS');            // e não "1" (valor da retoma)
    expect(r.week198).toBe('P');         // e não "FS"
    expect(r.date298?.getMonth()).toBe(7); // agosto (0-indexed), não a data de matrícula
    expect(r.qor).toBe(1);
    expect(r.bev).toBe(1);
  });

  it('sem coluna RET, mantém o layout-base (retrocompatível)', () => {
    // Cabeçalho sem RET: a coluna 20 passa a ser o FIN diretamente.
    const { control } = parseExcel(buildWorkbook('FIN_LEGADO'));
    // Sem header "RET", retIdx = -1 → col() é identidade → fin lê o índice 20,
    // que neste ficheiro sintético contém 1. Garante que não deslizamos sem RET.
    expect(control[0].ret).toBe(0);
    expect(control[0].fin).toBe('1');
  });
});

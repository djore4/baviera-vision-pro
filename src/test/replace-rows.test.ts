import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const del = vi.fn();     // from(t).delete().not(...)
const ins = vi.fn();     // from(t).insert(rows)
const ups = vi.fn();     // from(t).upsert(rows, opts)
const from = vi.fn((_table: string) => ({ delete: () => ({ not: del }), insert: ins, upsert: ups }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (t: string) => from(t) },
}));

import { replaceTableRows } from '@/lib/replace-rows';
import { replaceControlRecords, importControlExcel, controlRecordToRow } from '@/lib/control-records';
import { replaceAngariacoesVu } from '@/lib/angariacao-vu';
import type { AppData, ControlRecord } from '@/types/data';

const MISSING = { code: 'PGRST202', message: 'Could not find the function' };

beforeEach(() => {
  rpc.mockReset(); del.mockReset(); ins.mockReset(); ups.mockReset(); from.mockClear();
  del.mockResolvedValue({ error: null });
  ins.mockResolvedValue({ error: null });
  ups.mockResolvedValue({ error: null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('replaceTableRows', () => {
  it('faz uma única chamada RPC com a tabela e as linhas', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const n = await replaceTableRows('control_records', [{ status: 'a' }, { status: 'b' }]);
    expect(n).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('replace_rows', {
      p_table: 'control_records', p_rows: [{ status: 'a' }, { status: 'b' }], p_allow_empty: false,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('não parte em lotes: 1200 linhas continuam a ser uma só chamada (atómica)', async () => {
    rpc.mockResolvedValue({ data: 1200, error: null });
    await replaceTableRows('control_records', Array.from({ length: 1200 }, (_, i) => ({ status: String(i) })));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(ins).not.toHaveBeenCalled();
  });

  it('erro da BD → exceção a dizer que nada foi alterado, sem recorrer ao caminho antigo', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(replaceTableRows('angariacoes_vu', [{ resp: 'x' }], { label: 'angariações' }))
      .rejects.toThrow(/angariações \(nada foi alterado\): boom/);
    expect(del).not.toHaveBeenCalled();
  });

  describe('função em falta (migração por aplicar)', () => {
    it('cai no caminho antigo: apaga e insere em lotes de 500, com aviso', async () => {
      rpc.mockResolvedValue({ data: null, error: MISSING });
      const rows = Array.from({ length: 1200 }, (_, i) => ({ status: String(i) }));
      expect(await replaceTableRows('control_records', rows)).toBe(1200);
      expect(from).toHaveBeenCalledWith('control_records');
      expect(del).toHaveBeenCalledTimes(1);
      expect(ins).toHaveBeenCalledTimes(3);                    // 500 + 500 + 200
      expect(ins.mock.calls.map(c => c[0].length)).toEqual([500, 500, 200]);
      expect(console.warn).toHaveBeenCalled();
    });

    it('erro ao limpar ou a inserir continua a ser reportado', async () => {
      rpc.mockResolvedValue({ data: null, error: MISSING });
      del.mockResolvedValueOnce({ error: { message: 'sem permissão' } });
      await expect(replaceTableRows('control_records', [{ status: 'a' }], { label: 'registos' }))
        .rejects.toThrow(/limpar registos existentes: sem permissão/);
      expect(ins).not.toHaveBeenCalled();

      ins.mockResolvedValueOnce({ error: { message: 'constraint' } });
      await expect(replaceTableRows('control_records', [{ status: 'a' }], { label: 'registos' }))
        .rejects.toThrow(/importar registos \(lote 1\): constraint/);
    });
  });
});

describe('importadores', () => {
  const rec = { status: 'ok', neg: new Date('2026-09-30T00:00:00Z'), resp: 'R', cliente: 'C' } as unknown as ControlRecord;

  it('control: ficheiro vazio nem chega à BD', async () => {
    await expect(replaceControlRecords([])).rejects.toThrow(/importação cancelada/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('control: converte os registos e importa numa só chamada', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    expect(await replaceControlRecords([rec])).toBe(1);
    const [, args] = rpc.mock.calls[0];
    expect(args.p_table).toBe('control_records');
    expect(args.p_rows).toEqual([controlRecordToRow(rec)]);
    expect(args.p_rows[0]).not.toHaveProperty('id');
  });

  it('angariações: lista vazia esvazia a tabela (allowEmpty)', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    expect(await replaceAngariacoesVu([])).toBe(0);
    expect(rpc).toHaveBeenCalledWith('replace_rows', { p_table: 'angariacoes_vu', p_rows: [], p_allow_empty: true });
  });
});

describe('importControlExcel (registos + objetivos de ponta a ponta)', () => {
  const parsed = {
    control: [{ status: 'ok', neg: new Date('2026-09-30T00:00:00Z'), resp: 'R', cliente: 'C' } as unknown as ControlRecord],
    objetivosTotal: [{ mes: '2026/09', orcado: 100, range2: 200, range3: 220, real: 0 }],
    objetivosResp: [{ mes: '2026/09', resp: 'Rui', objetivo: 7 }, { mes: 'inválido', resp: 'X', objetivo: 1 }],
    lastUpdated: '',
  } as unknown as AppData;

  it('uma só chamada RPC com registos, orçamentos GSC/BMW e objetivos por vendedor', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    expect(await importControlExcel(parsed)).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('import_control_excel');
    expect(args.p_control).toEqual([controlRecordToRow(parsed.control[0])]);
    expect(args.p_orcamento).toEqual([
      { ano: 2026, mes: 9, tipo: 'GSC', orcamento: 100 },
      { ano: 2026, mes: 9, tipo: 'BMW', orcamento: 200 },
    ]);
    expect(args.p_resp).toEqual([{ ano: 2026, mes: 9, responsavel: 'Rui', objetivo: 7 }]);  // mês inválido descartado
    expect(from).not.toHaveBeenCalled();
  });

  it('sem registos de control nem chega à BD', async () => {
    await expect(importControlExcel({ ...parsed, control: [] })).rejects.toThrow(/importação cancelada/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('erro da BD → exceção a dizer que nada foi alterado (sem passos parciais)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'objetivo inválido' } });
    await expect(importControlExcel(parsed)).rejects.toThrow(/nada foi alterado\): objetivo inválido/);
    expect(del).not.toHaveBeenCalled();
    expect(ups).not.toHaveBeenCalled();
  });

  it('função em falta → caminho antigo: registos e depois objetivos, com aviso', async () => {
    rpc.mockResolvedValue({ data: null, error: MISSING });
    expect(await importControlExcel(parsed)).toBe(1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(ins).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('objetivos_orcamento');
    expect(from).toHaveBeenCalledWith('objetivos_resp');
    expect(ups).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalled();
  });
});

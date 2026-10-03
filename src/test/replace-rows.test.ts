import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { replaceTableRows } from '@/lib/replace-rows';
import { replaceControlRecords, controlRecordToRow } from '@/lib/control-records';
import { replaceAngariacoesVu } from '@/lib/angariacao-vu';
import type { ControlRecord } from '@/types/data';

beforeEach(() => rpc.mockReset());

describe('replaceTableRows', () => {
  it('faz uma única chamada RPC com a tabela e as linhas', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    const n = await replaceTableRows('control_records', [{ status: 'a' }, { status: 'b' }]);
    expect(n).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('replace_rows', {
      p_table: 'control_records', p_rows: [{ status: 'a' }, { status: 'b' }], p_allow_empty: false,
    });
  });

  it('não parte em lotes: 1200 linhas continuam a ser uma só chamada (atómica)', async () => {
    rpc.mockResolvedValue({ data: 1200, error: null });
    await replaceTableRows('control_records', Array.from({ length: 1200 }, (_, i) => ({ status: String(i) })));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('função em falta (migração por aplicar) → mensagem a dizer o que fazer', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(replaceTableRows('control_records', [{ status: 'a' }])).rejects.toThrow(/20261003110000/);
  });

  it('erro da BD → exceção a dizer que nada foi alterado', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(replaceTableRows('angariacoes_vu', [{ resp: 'x' }], { label: 'angariações' }))
      .rejects.toThrow(/angariações \(nada foi alterado\): boom/);
  });
});

describe('importadores', () => {
  it('control: ficheiro vazio nem chega à BD', async () => {
    await expect(replaceControlRecords([])).rejects.toThrow(/importação cancelada/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('control: converte os registos e importa numa só chamada', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    const rec = { status: 'ok', neg: new Date('2026-09-30T00:00:00Z'), resp: 'R', cliente: 'C' } as unknown as ControlRecord;
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

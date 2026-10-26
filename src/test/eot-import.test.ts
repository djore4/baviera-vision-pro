import { describe, it, expect, vi } from 'vitest';

const upsert = vi.fn();
let existing: Record<string, unknown>[] = [];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: existing, error: null }) }),
      upsert: (...a: unknown[]) => { upsert(...a); return Promise.resolve({ error: null }); },
    }),
  },
}));

import { mergeEotRow, importEotContracts, type EotImportRow } from '@/lib/eot';

const row = (over: Partial<EotImportRow> = {}): EotImportRow => ({
  contrato: 'C-1', concessionario: null, vendedor: null, tipo: null, cliente: 'Ana', contacto: null,
  telefone: null, telemovel: null, morada: null, codigo_postal: null, data_fim: '2026-12-01', prazo: null,
  prestacao: null, kms_contratados: null, matricula: null, marca: null, modelo: null, seguro: null,
  manutencao: null, manutencao_tipo: null, valor_residual: null, despesas_finais: null,
  valor_total: null, concessionario_resp: null, ...over,
});

describe('mergeEotRow', () => {
  it('o ficheiro manda quando traz valor', () => {
    const r = mergeEotRow(row({ telemovel: '911' }), { telemovel: '922' });
    expect(r.telemovel).toBe('911');
  });
  it('célula vazia no ficheiro não apaga o valor existente', () => {
    const r = mergeEotRow(row({ telemovel: null }), { telemovel: '922', contacto: 'Rui' });
    expect(r.telemovel).toBe('922');
    expect(r.contacto).toBe('Rui');
  });
  it('contrato novo fica como vem do ficheiro', () => {
    const inc = row();
    expect(mergeEotRow(inc, undefined)).toBe(inc);
  });
});

describe('importEotContracts', () => {
  it('nunca envia colunas de acompanhamento e mantém valores existentes', async () => {
    existing = [{ contrato: 'C-1', telemovel: '922' }];
    await importEotContracts([row(), row({ contrato: 'C-2' })]);
    const sent = upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(sent[0].telemovel).toBe('922');
    expect(sent[1].telemovel).toBeNull();
    for (const s of sent) {
      for (const k of ['fase', 'temperatura', 'resultado', 'obs', 'owner_email', 'owner_nome']) {
        expect(k in s).toBe(false);
      }
    }
  });
});

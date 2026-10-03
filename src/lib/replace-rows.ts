import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/** Tabelas de snapshot que a RPC `replace_rows` aceita. */
export type SnapshotTable = 'control_records' | 'control_records_vu' | 'angariacoes_vu';

/**
 * Substitui TODAS as linhas de `table` por `rows`, numa única transação na base
 * de dados (RPC `replace_rows`): ou entra tudo, ou fica tudo como estava.
 * As chaves de cada linha são nomes de colunas; o `id` é gerado pela BD.
 * Devolve o número de linhas importadas.
 */
export async function replaceTableRows(
  table: SnapshotTable,
  rows: Record<string, unknown>[],
  opts: { allowEmpty?: boolean; label?: string } = {},
): Promise<number> {
  const { data, error } = await supabase.rpc('replace_rows', {
    p_table: table,
    p_rows: rows as Json,
    p_allow_empty: opts.allowEmpty ?? false,
  });
  if (error) {
    // PGRST202: a função não existe (migração 20261003110000 por aplicar).
    if ((error as { code?: string }).code === 'PGRST202') {
      throw new Error('A função de importação (replace_rows) ainda não existe na base de dados — aplicar a migração 20261003110000_replace_rows_rpc.sql.');
    }
    const what = opts.label ?? table;
    throw new Error(`Erro ao importar ${what} (nada foi alterado): ${error.message}`);
  }
  return Number(data ?? 0);
}

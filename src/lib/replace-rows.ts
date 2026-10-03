import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/** Tabelas de snapshot que a RPC `replace_rows` aceita. */
export type SnapshotTable = 'control_records' | 'control_records_vu' | 'angariacoes_vu';

/** PGRST202: a função RPC não existe na base de dados (migração por aplicar). */
export const isMissingRpc = (error: { code?: string } | null | undefined) => error?.code === 'PGRST202';

/**
 * Caminho antigo (apagar tudo e inserir em lotes), SÓ para quando a migração
 * `replace_rows` ainda não foi aplicada: evita deixar a importação partida entre
 * o deploy do frontend e a migração. NÃO é atómico — uma falha a meio deixa a
 * tabela vazia ou parcial. Remover quando a migração estiver aplicada em todos os
 * ambientes.
 */
async function legacyReplace(
  table: SnapshotTable,
  rows: Record<string, unknown>[],
  label: string,
): Promise<number> {
  console.warn(`replace_rows em falta na base de dados: importação de ${label} SEM atomicidade. Aplicar a migração 20261003110000.`);
  const { error: delError } = await supabase.from(table).delete().not('id', 'is', null);
  if (delError) throw new Error(`Erro ao limpar ${label} existentes: ${delError.message}`);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH) as never);
    if (error) throw new Error(`Erro ao importar ${label} (lote ${i / BATCH + 1}): ${error.message}`);
  }
  return rows.length;
}

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
  const what = opts.label ?? table;
  const { data, error } = await supabase.rpc('replace_rows', {
    p_table: table,
    p_rows: rows as Json,
    p_allow_empty: opts.allowEmpty ?? false,
  });
  if (isMissingRpc(error)) return legacyReplace(table, rows, what);
  if (error) throw new Error(`Erro ao importar ${what} (nada foi alterado): ${error.message}`);
  return Number(data ?? 0);
}

import { supabase } from '@/integrations/supabase/client';
import { client } from '@/clients';
import {
  dedupePlates, parsePlatesHtml, pedidosConfirmados, planSync,
  type PedidoMsg, type PlannedChange, type SyncPlan, type SyncRecord,
} from '@/lib/email-sync';
import type { ControlRecord } from '@/types/data';
import { toLocalIsoDay } from '@/lib/utils';

interface Resposta {
  plates: { id: string; receivedAt: string; html: string }[];
  pedidos: PedidoMsg[];
  desde: string;
}

/** Erros que a interface explica em vez de mostrar em bruto. */
export class EmailSyncError extends Error {}

/** Registos de control no formato mínimo que o plano usa. */
export function paraSyncRecords(control: ControlRecord[]): SyncRecord[] {
  return control
    .filter((r): r is ControlRecord & { id: string } => !!r.id)
    .map(r => ({
      id: r.id, status: r.status, enc: r.enc, chas: r.chas, mat: r.mat, biz: r.biz, cliente: r.cliente,
      dmat: r.dmat ? toLocalIsoDay(r.dmat) : null,
    }));
}

/** Lê o email (edge function) e devolve o plano de alterações — ainda NADA foi gravado. */
export async function planearSincronizacao(control: ControlRecord[]): Promise<SyncPlan & { desde: string }> {
  const cfg = client.emailSync;
  if (!cfg) throw new EmailSyncError('A sincronização com o email não está configurada para este cliente.');

  const { data, error } = await supabase.functions.invoke('email-sync', {
    body: { plateSenders: cfg.plateSenders, sinceDays: cfg.sinceDays ?? 14 },
  });
  if (error) {
    let corpo: { error?: string; message?: string } | null = null;
    try { corpo = await (error as { context?: Response }).context?.json(); } catch { /* sem corpo */ }
    const status = (error as { context?: Response }).context?.status;
    if (status === 404) throw new EmailSyncError('A sincronização com o email ainda não está publicada (falta publicar a função email-sync).');
    if (corpo?.error === 'SEM_CONFIG') throw new EmailSyncError(corpo.message ?? 'Falta configurar o acesso ao email.');
    throw new EmailSyncError(corpo?.message ?? corpo?.error ?? 'Não foi possível ler o email.');
  }

  const res = data as Resposta;
  const plates = dedupePlates(res.plates.flatMap(m => parsePlatesHtml(m.html, m.receivedAt)));
  const pedidos = pedidosConfirmados(res.pedidos, cfg.confirmers);
  return { ...planSync(paraSyncRecords(control), plates, pedidos), desde: res.desde };
}

/**
 * Grava as alterações confirmadas, uma a uma. Cada gravação só pega se o registo
 * continua no estado em que o plano o viu (alguém pode tê-lo editado entretanto).
 */
export async function aplicarPlano(changes: PlannedChange[]): Promise<{ aplicadas: number; falhadas: { enc: string; motivo: string }[] }> {
  let aplicadas = 0;
  const falhadas: { enc: string; motivo: string }[] = [];
  for (const c of changes) {
    const { data, error } = await supabase
      .from('control_records')
      .update(c.patch)
      .eq('id', c.recordId)
      .eq('status', c.antes.status)
      .select('id');
    if (error) falhadas.push({ enc: c.enc, motivo: error.message });
    else if (!data || data.length === 0) falhadas.push({ enc: c.enc, motivo: 'O registo mudou entretanto — voltar a sincronizar.' });
    else aplicadas++;
  }
  return { aplicadas, falhadas };
}

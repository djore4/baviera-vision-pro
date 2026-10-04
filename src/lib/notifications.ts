/**
 * Sistema de notificações da plataforma (global).
 *  - audience 'all' → toda a gente; caso contrário uma tab key: só os perfis
 *    com acesso a essa área a veem (o gating é feito na app, via usePermissions);
 *    '@admin' → só os administradores.
 *  - recipient_email → dirigida a uma só pessoa (ex.: contrato atribuído).
 *  - link → caminho interno para onde a notificação leva ao clicar (hotlink).
 *  - o estado de "lido" é por utilizador (notification_reads), para o contador.
 * A base de dados impõe quem vê o quê (RLS); a interface repete a regra só para
 * filtrar o que já recebeu.
 */
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  audience: string;            // 'all', '@admin' ou uma tab key
  created_by: string | null;
  created_by_nome: string | null;
  created_at: string;
  /** Só esta pessoa a vê (null: vale o `audience`). Ausente em bases ainda não migradas. */
  recipient_email?: string | null;
  /** Caminho interno para abrir ao clicar. Ausente em bases ainda não migradas. */
  link?: string | null;
}

/** Audiência reservada aos administradores (avisos automáticos, ex.: um vendedor registou uma tarefa). */
export const ADMIN_AUDIENCE = '@admin';

/**
 * Só se seguem caminhos INTERNOS da aplicação ('/end-of-term?contrato=…'): nada de
 * endereços externos, '//host', 'javascript:' ou caminhos com espaços/quebras de linha.
 */
export function safeInternalLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const l = link.trim();
  return /^\/(?![/\\])\S*$/.test(l) ? l : null;
}

/** A notificação é para quem está autenticado? (repete a regra da RLS) */
export function isNotificationVisible(
  n: Pick<Notification, 'audience' | 'recipient_email'>,
  myEmail: string | null,
  canView: (tab: string) => boolean,
): boolean {
  if (n.recipient_email) return !!myEmail && n.recipient_email.toLowerCase() === myEmail.toLowerCase();
  if (n.audience === 'all') return true;
  return canView(n.audience);   // '@admin' e tabs: só quem tem acesso (o admin tem-no a tudo)
}

/** Para onde leva clicar: o link da notificação; senão a área a que se dirige; senão nada. */
export function notificationTarget(
  n: Pick<Notification, 'audience' | 'link'>,
  tabPath: (key: string) => string | null,
): string | null {
  const link = safeInternalLink(n.link);
  if (link) return link;
  if (n.audience === 'all' || n.audience === ADMIN_AUDIENCE) return null;
  return tabPath(n.audience);
}

export interface NewNotification {
  title: string;
  body?: string | null;
  audience?: string;
  created_by?: string | null;
  created_by_nome?: string | null;
}

/** Notificações dos últimos `sinceDays` dias (mais recentes primeiro). */
export async function listNotifications(sinceDays = 60): Promise<Notification[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Notification[];
}

/** Ids das notificações já lidas por este utilizador. */
export async function listReadIds(email: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('notification_reads')
    .select('notification_id')
    .eq('user_email', email);
  if (error) return new Set();
  return new Set((data ?? []).map((r: { notification_id: string }) => r.notification_id));
}

/** Marca notificações como lidas para este utilizador (idempotente). */
export async function markRead(ids: string[], email: string): Promise<void> {
  if (ids.length === 0 || !email) return;
  const rows = ids.map(id => ({ notification_id: id, user_email: email }));
  await supabase.from('notification_reads').upsert(rows, { onConflict: 'notification_id,user_email' });
}

/** Envia uma notificação (apenas admin, gating na UI). */
export async function createNotification(input: NewNotification): Promise<Notification> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      title: input.title,
      body: input.body ?? null,
      audience: input.audience ?? 'all',
      created_by: input.created_by ?? null,
      created_by_nome: input.created_by_nome ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Notification;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

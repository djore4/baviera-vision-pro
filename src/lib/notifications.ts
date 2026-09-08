/**
 * Sistema de notificações da plataforma (global).
 *  - audience 'all' → toda a gente; caso contrário uma tab key: só os perfis
 *    com acesso a essa área a veem (o gating é feito na app, via usePermissions).
 *  - o estado de "lido" é por utilizador (notification_reads), para o contador.
 */
import { supabase } from '@/integrations/supabase/client';

export interface Notification {
  id: string;
  title: string;
  body: string | null;
  audience: string;            // 'all' ou uma tab key
  created_by: string | null;
  created_by_nome: string | null;
  created_at: string;
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

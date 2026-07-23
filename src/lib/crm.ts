import { supabase } from '@/integrations/supabase/client';

/* ── Fidelização (CRM) — camada de acesso a dados ─────────────────────────────
 * CRUD para as tabelas crm_reminders (lembretes/agenda) e crm_notes (notas).
 * As tabelas não constam dos tipos gerados do Supabase, por isso os nomes são
 * passados como string (mesmo padrão de control-records.ts / objetivos.ts).
 * ──────────────────────────────────────────────────────────────────────────── */

export type ReminderKind = 'geral' | 'chamada' | 'followup' | 'renovacao' | 'servico';

export const REMINDER_KINDS: { value: ReminderKind; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'chamada', label: 'Chamada' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'renovacao', label: 'Renovação' },
  { value: 'servico', label: 'Serviço' },
];

export interface CrmReminder {
  id: string;
  resp: string | null;
  cliente: string | null;
  control_id: string | null;
  kind: ReminderKind;
  title: string;
  body: string | null;
  due_at: string | null; // ISO
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmNote {
  id: string;
  resp: string | null;
  cliente: string | null;
  control_id: string | null;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NewReminder =
  & { title: string }
  & Partial<Pick<CrmReminder, 'resp' | 'cliente' | 'control_id' | 'kind' | 'body' | 'due_at' | 'created_by'>>;

export type ReminderPatch =
  Partial<Pick<CrmReminder, 'title' | 'body' | 'due_at' | 'kind' | 'cliente' | 'resp' | 'control_id'>>;

export type NewNote =
  & { body: string }
  & Partial<Pick<CrmNote, 'resp' | 'cliente' | 'control_id' | 'created_by'>>;

/* ── Lembretes ──────────────────────────────────────────────────────────────── */

export async function listReminders(filter?: { resp?: string; done?: boolean }): Promise<CrmReminder[]> {
  let q = supabase.from('crm_reminders').select('*');
  if (filter?.resp) q = q.eq('resp', filter.resp);
  if (filter?.done !== undefined) q = q.eq('done', filter.done);
  const { data, error } = await q
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CrmReminder[];
}

export async function createReminder(input: NewReminder): Promise<CrmReminder> {
  const { data, error } = await supabase
    .from('crm_reminders')
    .insert({
      resp: input.resp ?? null,
      cliente: input.cliente ?? null,
      control_id: input.control_id ?? null,
      kind: input.kind ?? 'geral',
      title: input.title,
      body: input.body ?? null,
      due_at: input.due_at ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CrmReminder;
}

export async function setReminderDone(id: string, done: boolean): Promise<CrmReminder> {
  const { data, error } = await supabase
    .from('crm_reminders')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CrmReminder;
}

export async function updateReminder(id: string, patch: ReminderPatch): Promise<CrmReminder> {
  const { data, error } = await supabase
    .from('crm_reminders')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CrmReminder;
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from('crm_reminders').delete().eq('id', id);
  if (error) throw error;
}

/* ── Notas ──────────────────────────────────────────────────────────────────── */

export async function listNotes(filter?: { resp?: string; cliente?: string }): Promise<CrmNote[]> {
  let q = supabase.from('crm_notes').select('*');
  if (filter?.resp) q = q.eq('resp', filter.resp);
  if (filter?.cliente) q = q.eq('cliente', filter.cliente);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CrmNote[];
}

export async function createNote(input: NewNote): Promise<CrmNote> {
  const { data, error } = await supabase
    .from('crm_notes')
    .insert({
      resp: input.resp ?? null,
      cliente: input.cliente ?? null,
      control_id: input.control_id ?? null,
      body: input.body,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CrmNote;
}

export async function updateNote(id: string, body: string): Promise<CrmNote> {
  const { data, error } = await supabase
    .from('crm_notes')
    .update({ body })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CrmNote;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('crm_notes').delete().eq('id', id);
  if (error) throw error;
}

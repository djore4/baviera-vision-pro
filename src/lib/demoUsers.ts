import { supabase } from '@/integrations/supabase/client';

/* ── Utilizadores dos demonstradores ───────────────────────────────────────────
 * Dois conceitos:
 *   - Pessoas (roster): lançadas no tab Utilizadores (demo_pessoas).
 *   - Afetações: que pessoa está em que viatura, feita no tab Demos, na própria
 *     tabela (demo_afetacoes: chassis ↔ pessoa_id).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DemoPerson { id: string; nome: string; }
export interface DemoAfetacao { chassis: string; pessoa_id: string; }

/* ── Roster de pessoas ── */
export async function listDemoPeople(): Promise<DemoPerson[]> {
  const { data, error } = await supabase
    .from('demo_pessoas')
    .select('id, nome')
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DemoPerson[];
}

export async function addDemoPerson(nome: string): Promise<DemoPerson> {
  const { data, error } = await supabase
    .from('demo_pessoas')
    .insert({ nome: nome.trim() })
    .select('id, nome')
    .single();
  if (error) throw error;
  return data as DemoPerson;
}

export async function removeDemoPerson(id: string): Promise<void> {
  // As afetações da pessoa caem por cascade (FK ON DELETE CASCADE).
  const { error } = await supabase.from('demo_pessoas').delete().eq('id', id);
  if (error) throw error;
}

/* ── Afetações viatura ↔ pessoa ── */
export async function listAfetacoes(): Promise<DemoAfetacao[]> {
  const { data, error } = await supabase.from('demo_afetacoes').select('chassis, pessoa_id');
  if (error) throw error;
  return (data ?? []) as DemoAfetacao[];
}

/** Afeta (on=true) ou remove (on=false) uma pessoa de uma viatura. */
export async function setAfetacao(chassis: string, pessoa_id: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase
      .from('demo_afetacoes')
      .upsert({ chassis, pessoa_id }, { onConflict: 'chassis,pessoa_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('demo_afetacoes')
      .delete()
      .eq('chassis', chassis)
      .eq('pessoa_id', pessoa_id);
    if (error) throw error;
  }
}

/** Mapa chassis → ids das pessoas afetadas. */
export function afetacoesByChassis(list: DemoAfetacao[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const a of list) {
    if (!map[a.chassis]) map[a.chassis] = [];
    map[a.chassis].push(a.pessoa_id);
  }
  return map;
}

/** Iniciais de um nome: 1.ª letra do primeiro e do último nome (ex.: "João Duarte" → "JD"). */
export function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

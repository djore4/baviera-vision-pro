import { supabase } from '@/integrations/supabase/client';

/* ── Utilizadores dos demonstradores ───────────────────────────────────────────
 * Pessoas que estão a utilizar cada viatura demonstradora (por chassis). Tabela
 * própria desta plataforma (demo_utilizadores); vários utilizadores por viatura.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DemoUser { id: string; chassis: string; nome: string; }

export async function listDemoUsers(): Promise<DemoUser[]> {
  const { data, error } = await supabase
    .from('demo_utilizadores')
    .select('id, chassis, nome')
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DemoUser[];
}

export async function addDemoUser(chassis: string, nome: string): Promise<DemoUser> {
  const { data, error } = await supabase
    .from('demo_utilizadores')
    .insert({ chassis, nome: nome.trim() })
    .select('id, chassis, nome')
    .single();
  if (error) throw error;
  return data as DemoUser;
}

export async function removeDemoUser(id: string): Promise<void> {
  const { error } = await supabase.from('demo_utilizadores').delete().eq('id', id);
  if (error) throw error;
}

/** Iniciais de um nome: 1.ª letra do primeiro e do último nome (ex.: "João Duarte" → "JD"). */
export function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Agrupa uma lista de utilizadores por chassis. */
export function groupByChassis(users: DemoUser[]): Record<string, DemoUser[]> {
  const map: Record<string, DemoUser[]> = {};
  for (const u of users) {
    if (!map[u.chassis]) map[u.chassis] = [];
    map[u.chassis].push(u);
  }
  return map;
}

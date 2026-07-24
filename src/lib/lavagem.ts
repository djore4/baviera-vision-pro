import { supabase } from '@/integrations/supabase/client';

/* ── Lavagem — camada de acesso a dados ───────────────────────────────────────
 * Controlo do fluxo de lavagens automóvel. Cada ciclo (car_wash_cycles) regista
 * matrícula/chassis + tipo de lavagem, é aberto a partir do scan de um QR code
 * e encerrado com o botão "Terminar".
 * A tabela não consta dos tipos gerados do Supabase, por isso o nome é passado
 * como string (mesmo padrão de crm.ts / control-records.ts).
 * ──────────────────────────────────────────────────────────────────────────── */

export type WashTypeId =
  | 'simples' | 'oferta' | 'completa' | 'parque'
  | 'servico' | 'novo' | 'bps' | 'retoma';

export interface WashType {
  id: WashTypeId;
  label: string;
  duration: number;      // minutos
  /* Cor associada — classes Tailwind para os vários contextos de UI. */
  dot: string;           // ponto/indicador
  block: string;         // bloco na vista semanal
  badge: string;         // etiqueta
}

/* Tipos de lavagem e respetivas durações (tabela de referência). */
export const WASH_TYPES: WashType[] = [
  { id: 'simples',  label: 'Simples',  duration: 15,
    dot: 'bg-sky-500',     block: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-500/40',           badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { id: 'oferta',   label: 'Oferta',   duration: 20,
    dot: 'bg-emerald-500', block: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-500/40', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  { id: 'completa', label: 'Completa', duration: 30,
    dot: 'bg-violet-500',  block: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-500/40',    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  { id: 'parque',   label: 'Parque',   duration: 7,
    dot: 'bg-slate-400',   block: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-200 dark:border-slate-500/40',       badge: 'bg-slate-200 text-slate-700 dark:bg-slate-600/40 dark:text-slate-200' },
  { id: 'servico',  label: 'Serviço',  duration: 15,
    dot: 'bg-amber-500',   block: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40',       badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  { id: 'novo',     label: 'Novo',     duration: 45,
    dot: 'bg-blue-600',    block: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/20 dark:text-blue-200 dark:border-blue-500/40',           badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' },
  { id: 'bps',      label: 'BPS',      duration: 60,
    dot: 'bg-rose-500',    block: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40',           badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' },
  { id: 'retoma',   label: 'Retoma',   duration: 15,
    dot: 'bg-orange-500',  block: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-500/40',   badge: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300' },
];

export const WASH_TYPE_MAP: Record<WashTypeId, WashType> =
  WASH_TYPES.reduce((acc, w) => { acc[w.id] = w; return acc; }, {} as Record<WashTypeId, WashType>);

export interface CarWashCycle {
  id: string;
  plate: string;
  wash_type: WashTypeId;
  duration_min: number;
  started_at: string;        // ISO
  ended_at: string | null;   // ISO, null = em curso
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NewCycle = {
  plate: string;
  wash_type: WashTypeId;
  created_by?: string | null;
};

/* Lista os ciclos com início a partir de `since` (ISO), mais recentes primeiro. */
export async function listCycles(since?: string): Promise<CarWashCycle[]> {
  let q = supabase.from('car_wash_cycles').select('*');
  if (since) q = q.gte('started_at', since);
  const { data, error } = await q.order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CarWashCycle[];
}

/* Abre um novo ciclo de lavagem. A duração é fixada a partir do tipo. */
export async function createCycle(input: NewCycle): Promise<CarWashCycle> {
  const type = WASH_TYPE_MAP[input.wash_type];
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .insert({
      plate: input.plate.trim().toUpperCase(),
      wash_type: input.wash_type,
      duration_min: type.duration,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CarWashCycle;
}

/* Encerra o ciclo (botão "Terminar"). */
export async function endCycle(id: string): Promise<CarWashCycle> {
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CarWashCycle;
}

export async function deleteCycle(id: string): Promise<void> {
  const { error } = await supabase.from('car_wash_cycles').delete().eq('id', id);
  if (error) throw error;
}

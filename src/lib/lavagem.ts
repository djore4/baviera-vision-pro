import * as XLSX from 'xlsx';
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
  | 'servico' | 'novo' | 'bps' | 'retoma'
  | 'mota_vn' | 'mota_vu';

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
  { id: 'mota_vn',  label: 'Mota VN',  duration: 15,
    dot: 'bg-teal-500',    block: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-500/20 dark:text-teal-200 dark:border-teal-500/40',           badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300' },
  { id: 'mota_vu',  label: 'Mota VU',  duration: 30,
    dot: 'bg-pink-500',    block: 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-500/20 dark:text-pink-200 dark:border-pink-500/40',           badge: 'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300' },
];

export const WASH_TYPE_MAP: Record<WashTypeId, WashType> =
  WASH_TYPES.reduce((acc, w) => { acc[w.id] = w; return acc; }, {} as Record<WashTypeId, WashType>);

export interface CarWashCycle {
  id: string;
  plate: string;
  model: string | null;         // modelo da viatura a lavar
  wash_type: WashTypeId;
  duration_min: number;
  notes: string | null;         // observações (mensagem curta do agendamento)
  scheduled_at: string | null;  // ISO, hora agendada (null = lavagem imediata)
  started_at: string | null;    // ISO, início real (null = ainda só agendada)
  ended_at: string | null;      // ISO, null = por terminar
  effective_at: string | null;  // ISO, gerado: started_at ?? scheduled_at
  queue_order: number | null;   // ordem manual na fila (null = segue o plano)
  created_by: string | null;
  scheduled_by: string | null;  // interlocutor: quem agendou/reagendou a lavagem
  quality_score: number | null;    // controlo de qualidade 0–10
  quality_comment: string | null;
  quality_by: string | null;
  quality_at: string | null;        // ISO
  created_at: string;
  updated_at: string;
}

/* Estado de uma lavagem, derivado dos timestamps. */
export type CycleStatus = 'scheduled' | 'in_progress' | 'done';
export function cycleStatus(c: CarWashCycle): CycleStatus {
  if (c.ended_at) return 'done';
  if (c.started_at) return 'in_progress';
  return 'scheduled';
}

/* Hora que posiciona a lavagem na agenda: início real ou, na sua falta, o agendamento. */
export const effectiveAt = (c: CarWashCycle): string =>
  c.effective_at ?? c.started_at ?? c.scheduled_at ?? c.created_at;

/* Chave de ordenação da fila de execução (segundos): ordem manual, se definida,
 * senão a hora do plano. Permite antecipar/reordenar sem tocar em scheduled_at. */
export const queueKey = (c: CarWashCycle): number =>
  c.queue_order ?? new Date(c.scheduled_at ?? c.effective_at ?? c.created_at).getTime() / 1000;

/* Desvio (min) entre o início real e a hora agendada.
 * Negativo = antecipada; positivo = iniciada em atraso; null = sem base de comparação. */
export function startDeviationMin(c: CarWashCycle): number | null {
  if (!c.started_at || !c.scheduled_at) return null;
  return Math.round((new Date(c.started_at).getTime() - new Date(c.scheduled_at).getTime()) / 60000);
}

export type NewCycle = {
  plate: string;
  wash_type: WashTypeId;
  model?: string | null;   // modelo da viatura
  notes?: string | null;   // observações
  created_by?: string | null;
  scheduled_at?: string;   // ISO; se presente, cria uma lavagem agendada (started_at fica null)
  start_now?: boolean;     // "Agendar já": agenda para este instante e inicia de imediato
};

/* Lista os ciclos com hora efetiva dentro de [from, to) (ISO), mais recentes primeiro. */
export async function listCycles(range?: { from?: string; to?: string }): Promise<CarWashCycle[]> {
  let q = supabase.from('car_wash_cycles').select('*');
  if (range?.from) q = q.gte('effective_at', range.from);
  if (range?.to) q = q.lt('effective_at', range.to);
  const { data, error } = await q.order('effective_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CarWashCycle[];
}

/* Ciclos por terminar (agendados + em curso), independentemente da semana. */
export async function listActiveCycles(): Promise<CarWashCycle[]> {
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .select('*')
    .is('ended_at', null)
    .order('effective_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CarWashCycle[];
}

/* Cria um ciclo de lavagem. A duração é fixada a partir do tipo.
 * - start_now -> "Agendar já": agenda para este instante e arranca de imediato
 *   (scheduled_at e started_at = agora);
 * - scheduled_at (sem start_now) -> lavagem agendada (started_at fica null, entra na fila);
 * - nenhum dos dois -> lavagem imediata (arranca já, sem agendamento). */
export async function createCycle(input: NewCycle): Promise<CarWashCycle> {
  const type = WASH_TYPE_MAP[input.wash_type];
  const row: Record<string, unknown> = {
    plate: input.plate.trim().toUpperCase(),
    wash_type: input.wash_type,
    duration_min: type.duration,
    model: input.model && input.model.trim() ? input.model.trim() : null,
    notes: input.notes && input.notes.trim() ? input.notes.trim() : null,
    created_by: input.created_by ?? null,
    scheduled_by: input.created_by ?? null,   // interlocutor inicial do agendamento
  };
  const now = new Date().toISOString();
  if (input.start_now) {                                             // agendar já (agenda + inicia)
    row.scheduled_at = input.scheduled_at ?? now;
    row.started_at = now;
  } else if (input.scheduled_at) {                                   // agendada (por iniciar)
    row.scheduled_at = input.scheduled_at;
  } else {                                                           // imediata (sem agendamento)
    row.started_at = now;
  }
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as CarWashCycle;
}

/* Inicia uma lavagem agendada: regista o início real (fila -> em curso). */
export async function startCycle(id: string): Promise<CarWashCycle> {
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .update({ started_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CarWashCycle;
}

/* Reagenda uma lavagem (arrastar na agenda): fixa nova hora do plano e limpa a
 * ordem manual da fila. Regista também o interlocutor que reagendou (scheduled_by),
 * para que a slot indique com quem falar sobre a marcação. */
export async function rescheduleCycle(id: string, scheduledAtISO: string, by?: string | null): Promise<CarWashCycle> {
  const patch: Record<string, unknown> = { scheduled_at: scheduledAtISO, queue_order: null };
  if (by !== undefined) patch.scheduled_by = by;
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CarWashCycle;
}

/* Ajuste operacional da fila: define a ordem manual (antecipar/reordenar).
 * Não altera o plano (scheduled_at) nem a agenda. */
export async function setQueueOrder(id: string, order: number): Promise<CarWashCycle> {
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .update({ queue_order: order })
    .eq('id', id)
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

/* Controlo de qualidade — nota (0–10) e comentário. score null limpa a nota. */
export async function setQuality(
  id: string,
  score: number | null,
  comment: string | null,
  by?: string | null,
): Promise<CarWashCycle> {
  const { data, error } = await supabase
    .from('car_wash_cycles')
    .update({
      quality_score: score,
      quality_comment: comment && comment.trim() ? comment.trim() : null,
      quality_by: score === null && !comment ? null : (by ?? null),
      quality_at: score === null && !comment ? null : new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CarWashCycle;
}

/* ── Relatório Excel ──────────────────────────────────────────────────────────
 * Gera e descarrega um .xlsx com o detalhe das lavagens (matrícula, tipo,
 * duração, timestamps) + uma folha de resumo por tipo.
 * ──────────────────────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');
const fmtPT = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDatePT = (iso: string): string => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const STATUS_LABEL: Record<CycleStatus, string> = {
  scheduled: 'Agendada', in_progress: 'Em curso', done: 'Terminada',
};

export function exportCyclesToExcel(rows: CarWashCycle[], filename?: string): void {
  // Detalhe — mais antigos primeiro (leitura cronológica, por hora efetiva).
  const sorted = [...rows].sort((a, b) => effectiveAt(a).localeCompare(effectiveAt(b)));

  const detail = sorted.map(c => ({
    'Matrícula/Chassis': c.plate,
    'Modelo': c.model ?? '',
    'Tipo': WASH_TYPE_MAP[c.wash_type]?.label ?? c.wash_type,
    'Duração (min)': c.duration_min,
    'Data': fmtDatePT(effectiveAt(c)),
    'Agendada': fmtPT(c.scheduled_at),
    'Agendado por': c.scheduled_by ?? '',
    'Início': fmtPT(c.started_at),
    'Fim': fmtPT(c.ended_at),
    'Desvio (min)': startDeviationMin(c) ?? '',
    'Estado': STATUS_LABEL[cycleStatus(c)],
    'Nota QC': c.quality_score ?? '',
    'Comentário QC': c.quality_comment ?? '',
    'Observações': c.notes ?? '',
    'Início (ISO)': c.started_at ?? '',
    'Fim (ISO)': c.ended_at ?? '',
  }));

  // Resumo por tipo — nº de lavagens e minutos totais.
  const summary = WASH_TYPES.map(t => {
    const items = rows.filter(c => c.wash_type === t.id);
    return {
      'Tipo': t.label,
      'Duração (min)': t.duration,
      'Nº lavagens': items.length,
      'Minutos totais': items.reduce((s, c) => s + c.duration_min, 0),
    };
  });
  summary.push({
    'Tipo': 'TOTAL', 'Duração (min)': '' as unknown as number,
    'Nº lavagens': rows.length,
    'Minutos totais': rows.reduce((s, c) => s + c.duration_min, 0),
  });

  const wb = XLSX.utils.book_new();
  const wsDetail = XLSX.utils.json_to_sheet(detail);
  wsDetail['!cols'] = [
    { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 },
    { wch: 12 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 22 }, { wch: 22 },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Lavagens');

  const name = filename ?? `lavagens_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, name);
}

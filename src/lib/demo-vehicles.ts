import { supabase } from '@/integrations/supabase/client';
import { tipoFlags } from '@/lib/demoPricing';
import { chassisCurto, formatMatricula } from '@/lib/viaturaFormat';

/* Viaturas demo (parque partilhado com a plataforma Caetano, tabela `viaturas`)
 * para pré-preencher um negócio VD. Só leitura. A regra de quais são demos é a
 * mesma do tab Demos: estado_negocio diferente de 'VU' e sem motas. */

export interface DemoVehicle {
  chassis: string;
  matricula: string | null;
  modelo: string | null;
  versao: string | null;
  encomenda: string | null;
  data_matricula: string | null;
  tipologia: unknown;
  marca: string | null;
  estado_negocio: string | null;
}

function asArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; }
    catch { return v.includes(',') ? v.split(',').map(s => s.trim()) : [v]; }
  }
  return [];
}

export const isDemoVehicle = (v: DemoVehicle): boolean =>
  v.estado_negocio !== 'VU' && !asArray(v.marca).some(m => m.trim().toLowerCase().includes('motorrad'));

export async function fetchDemoVehicles(): Promise<DemoVehicle[]> {
  // Mesma origem do tab Demos: demos_viaturas() e, se ainda não existir, a tabela.
  let q = await supabase.rpc('demos_viaturas');
  if (q.error && (q.error as { code?: string }).code === 'PGRST202') {
    q = await supabase.from('viaturas').select('*') as unknown as typeof q;
  }
  if (q.error) throw new Error(q.error.message);
  return ((q.data as DemoVehicle[]) ?? [])
    .filter(isDemoVehicle)
    .sort((a, b) => `${a.modelo ?? ''} ${a.versao ?? ''}`.localeCompare(`${b.modelo ?? ''} ${b.versao ?? ''}`, 'pt'));
}

/** Rótulo para a lista de seleção: modelo, versão, matrícula e chassis curto. */
export function demoLabel(v: DemoVehicle): string {
  const mat = v.matricula ? formatMatricula(v.matricula) : 'sem matrícula';
  return [`${v.modelo ?? ''} ${v.versao ?? ''}`.trim(), mat, chassisCurto(v.chassis)].filter(Boolean).join(' · ');
}

/** Campos de control_records preenchidos a partir da demo (o BEV conta também como xEV). */
export interface DemoPatch {
  type: 'VD';
  model: string; version: string; chas: string; mat: string; enc: string;
  dmat: string | null;
  bev: number; xev: number; qor: number; m: number;
}

export function demoToRecordPatch(v: DemoVehicle): DemoPatch {
  const t = tipoFlags(asArray(v.tipologia));
  return {
    type: 'VD',
    model: v.modelo ?? '',
    version: v.versao ?? '',
    chas: v.chassis ?? '',
    mat: v.matricula ? formatMatricula(v.matricula) : '',
    enc: v.encomenda ?? '',
    dmat: v.data_matricula || null,
    bev: t.bev ? 1 : 0,
    xev: t.xev ? 1 : 0,
    qor: t.qor ? 1 : 0,
    m: t.m ? 1 : 0,
  };
}

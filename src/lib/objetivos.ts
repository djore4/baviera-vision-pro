import { supabase } from '@/integrations/supabase/client';
import type { ObjetivoTotal, ObjetivoResp } from '@/types/data';

const pad = (m: number) => String(m).padStart(2, '0');

interface OrcamentoRow { ano: number; mes: number; tipo: 'GSC' | 'BMW'; orcamento: number | null }
interface RespRow { ano: number; mes: number; responsavel: string; objetivo: number | null }

/**
 * Lê os objetivos definidos no tab "Objetivos" (tabelas Supabase
 * objetivos_resp e objetivos_orcamento) e devolve-os no formato que os
 * dashboards já consomem.
 */
export async function loadObjetivos(): Promise<{ objetivosTotal: ObjetivoTotal[]; objetivosResp: ObjetivoResp[] }> {
  const [{ data: respData, error: respErr }, { data: orcData, error: orcErr }] = await Promise.all([
    supabase.from('objetivos_resp').select('*'),
    supabase.from('objetivos_orcamento').select('*'),
  ]);
  if (respErr || orcErr) return { objetivosTotal: [], objetivosResp: [] };

  const objetivosResp: ObjetivoResp[] = ((respData ?? []) as unknown as RespRow[])
    .filter(o => o.ano && o.mes && o.responsavel)
    .map(o => ({ mes: `${o.ano}/${pad(o.mes)}`, resp: o.responsavel, objetivo: Number(o.objetivo) || 0 }));

  // Agrupa os orçamentos GSC/BMW por mês.
  const byMonth: Record<string, { gsc: number; bmw: number }> = {};
  ((orcData ?? []) as unknown as OrcamentoRow[]).forEach(o => {
    if (!o.ano || !o.mes) return;
    const key = `${o.ano}/${pad(o.mes)}`;
    byMonth[key] ??= { gsc: 0, bmw: 0 };
    if (o.tipo === 'GSC') byMonth[key].gsc = Number(o.orcamento) || 0;
    else if (o.tipo === 'BMW') byMonth[key].bmw = Number(o.orcamento) || 0;
  });
  const objetivosTotal: ObjetivoTotal[] = Object.entries(byMonth).map(([mes, { gsc, bmw }]) => ({
    mes,
    orcado: gsc,                    // Caetano (GSC)
    range2: bmw,                    // BMW
    range3: Math.ceil(bmw * 1.1),   // BMW 110% (majora sempre para o inteiro seguinte)
    real: 0,                        // calculado a partir dos registos, não guardado
  }));

  return { objetivosTotal, objetivosResp };
}

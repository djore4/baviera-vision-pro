import { supabase } from '@/integrations/supabase/client';
import type { ControlRecord } from '@/types/data';

/* ── Lead time de entrega: Parque → Certificado de entrega ───────────────────
 * Dias entre a entrada da viatura em parque (coluna 198 = "P", registada na
 * tabela parque_entradas) e a data do certificado de entrega (data 298 / Retail).
 * Por comercial (resp). Ver a migração 20261117100000_parque_entradas.sql.
 * ──────────────────────────────────────────────────────────────────────────── */

const DAY = 1000 * 60 * 60 * 24;

/** Chave de cruzamento com parque_entradas (igual à da BD: maiúsculas, sem espaços nas pontas). */
export const chassisKey = (c: string | null | undefined) => (c ?? '').trim().toUpperCase();

/** chassis → data de entrada em parque (null = já estava em parque antes do registo). */
export type EntradasParque = Map<string, Date | null>;

export interface LeadTimeEntregaRow {
  resp: string;
  /** Entregues no período com data de entrada conhecida (a base do indicador). */
  n: number;
  mean: number | null;
  median: number | null;
  /** Entregues no período SEM data de entrada (não entram na média). */
  semData: number;
  /** Viaturas em parque agora (não entregues). */
  emParque: number;
  /** Idade média em parque (dias) das que têm data de entrada. */
  idadeParque: number | null;
}

export interface LeadTimeEntrega {
  equipa: Omit<LeadTimeEntregaRow, 'resp'>;
  porResp: LeadTimeEntregaRow[];
  /** Entregues com data de entrega anterior à entrada em parque (dados incoerentes; excluídos). */
  incoerentes: number;
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, d) => s + d, 0) / arr.length) : null);

/** Mesma regra do filtro "Em parque" da app (ExtraFilters.isParked). */
const emParque = (r: ControlRecord) => r.week198.toUpperCase().includes('P') && r.status !== 'Retail';

/**
 * @param entregues  Retails do período (já filtrados por data de entrega e comercial).
 * @param carteira   Todos os registos visíveis (para contar o que está em parque agora).
 * @param entradas   Datas de entrada em parque, por chassis.
 */
export function calcLeadTimeEntrega(
  entregues: ControlRecord[],
  carteira: ControlRecord[],
  entradas: EntradasParque,
  hoje: Date = new Date(),
): LeadTimeEntrega {
  type Acc = { dias: number[]; semData: number; parque: number; idades: number[] };
  const novo = (): Acc => ({ dias: [], semData: 0, parque: 0, idades: [] });
  const equipa = novo();
  const map = new Map<string, Acc>();
  const get = (resp: string) => { let a = map.get(resp); if (!a) { a = novo(); map.set(resp, a); } return a; };
  let incoerentes = 0;

  for (const r of entregues) {
    if (!r.date298) continue;
    const a = get(r.resp || '—');
    const entrada = entradas.get(chassisKey(r.chas));
    if (!entrada) { a.semData++; equipa.semData++; continue; }
    const d = Math.round((r.date298.getTime() - entrada.getTime()) / DAY);
    if (d < 0) { incoerentes++; continue; }
    a.dias.push(d); equipa.dias.push(d);
  }

  for (const r of carteira) {
    if (!emParque(r)) continue;
    const a = get(r.resp || '—');
    a.parque++; equipa.parque++;
    const entrada = entradas.get(chassisKey(r.chas));
    if (entrada) {
      const idade = Math.max(0, Math.round((hoje.getTime() - entrada.getTime()) / DAY));
      a.idades.push(idade); equipa.idades.push(idade);
    }
  }

  const fecha = (a: Acc): Omit<LeadTimeEntregaRow, 'resp'> => ({
    n: a.dias.length, mean: mean(a.dias), median: median(a.dias),
    semData: a.semData, emParque: a.parque, idadeParque: mean(a.idades),
  });

  return {
    equipa: fecha(equipa),
    porResp: [...map.entries()]
      .map(([resp, a]) => ({ resp, ...fecha(a) }))
      .sort((x, y) => (y.n + y.semData + y.emParque) - (x.n + x.semData + x.emParque)),
    incoerentes,
  };
}

/** Lê as datas de entrada em parque. `null` = tabela por criar (migração por aplicar). */
export async function carregarEntradasParque(): Promise<EntradasParque | null> {
  const out: EntradasParque = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('parque_entradas')
      .select('chassis, entrada_em').order('chassis').range(from, from + PAGE - 1);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return null;
      throw new Error(error.message);
    }
    for (const row of data ?? []) out.set(row.chassis, row.entrada_em ? new Date(row.entrada_em) : null);
    if (!data || data.length < PAGE) break;
  }
  return out;
}

import type { ControlRecord, ObjetivoResp, ObjetivoTotal } from '@/types/data';
import { getDeliveryMonth, isRetailType } from '@/lib/excel-parser';

/* Perspetiva anual dos objetivos VN: por mês, os objetivos (GSC/Caetano, BMW e a soma
 * dos vendedores) e os retails reais. Os retails contam como no gauge da WIP VN:
 * viaturas VN/VD/RMK em estado Retail, no mês dado por getDeliveryMonth. */

export interface LinhaAnual {
  mes: number;                 // 1–12
  key: string;                 // AAAA/MM
  gsc: number;                 // orçamento Caetano
  bmw: number;                 // objetivo BMW
  vendedores: number;          // soma dos objetivos dos vendedores (negócios)
  retails: number;             // retails reais
  futuro: boolean;             // mês ainda por começar: sem real nem % de cumprimento
  pctGsc: number | null;       // retails / GSC (null sem objetivo ou futuro)
  pctBmw: number | null;       // retails / BMW
}

export interface Anual {
  linhas: LinhaAnual[];
  total: Omit<LinhaAnual, 'mes' | 'key' | 'futuro'>;
}

export const monthKey = (ano: number, mes: number) => `${ano}/${String(mes).padStart(2, '0')}`;

/** Normaliza chaves de mês ('2026/9' e '2026/09' são o mesmo mês). */
const normKey = (k: string) => {
  const m = k.match(/^(\d{4})\/(\d{1,2})$/);
  return m ? monthKey(Number(m[1]), Number(m[2])) : k;
};

export function retailsPorMes(control: ControlRecord[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of control) {
    if (r.status !== 'Retail' || !isRetailType(r.type)) continue;
    const k = normKey(getDeliveryMonth(r));
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const pct = (real: number, objetivo: number): number | null =>
  objetivo > 0 ? Math.round((real / objetivo) * 100) : null;

export function buildAnual(
  ano: number,
  totais: ObjetivoTotal[],
  porResp: ObjetivoResp[],
  control: ControlRecord[],
  hoje: Date = new Date(),
): Anual {
  const reais = retailsPorMes(control);
  const gsc: Record<string, number> = {};
  const bmw: Record<string, number> = {};
  totais.forEach(t => { const k = normKey(t.mes); gsc[k] = (gsc[k] ?? 0) + t.orcado; bmw[k] = (bmw[k] ?? 0) + t.range2; });
  const vend: Record<string, number> = {};
  porResp.forEach(o => { const k = normKey(o.mes); vend[k] = (vend[k] ?? 0) + o.objetivo; });

  const inicioProximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).getTime();
  const linhas: LinhaAnual[] = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const key = monthKey(ano, mes);
    const futuro = new Date(ano, i, 1).getTime() >= inicioProximoMes;
    const retails = futuro ? 0 : (reais[key] ?? 0);
    return {
      mes, key, futuro, retails,
      gsc: gsc[key] ?? 0, bmw: bmw[key] ?? 0, vendedores: vend[key] ?? 0,
      pctGsc: futuro ? null : pct(retails, gsc[key] ?? 0),
      pctBmw: futuro ? null : pct(retails, bmw[key] ?? 0),
    };
  });

  const soma = (f: (l: LinhaAnual) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const t = { gsc: soma(l => l.gsc), bmw: soma(l => l.bmw), vendedores: soma(l => l.vendedores), retails: soma(l => l.retails) };
  return { linhas, total: { ...t, pctGsc: pct(t.retails, t.gsc), pctBmw: pct(t.retails, t.bmw) } };
}

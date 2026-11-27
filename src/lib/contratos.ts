import type { ContratoManutencao, ContratoRI, TabelaManutencao } from '@/lib/contratos-data';

/* ── Contratos (Transversal) — lógica pura de consulta das tabelas de preços ───
 * Os preços vivem em contratos-data.ts (copiados dos ficheiros oficiais). Aqui só se
 * formata, filtra e agrupa para a consulta das equipas comerciais.
 * ──────────────────────────────────────────────────────────────────────────── */

export type ComIva = 'com' | 'sem';

/* Nos contratos BEV o ficheiro usa 999999 km como "sem limite de quilómetros". */
export const KM_SEM_LIMITE = 999999;

export const fmtPreco = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—'
    : `${n.toLocaleString('pt-PT', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;

export const fmtKm = (km: number): string =>
  km >= KM_SEM_LIMITE ? 'Sem limite' : `${km.toLocaleString('pt-PT')} km`;

export const fmtAnos = (anos: number): string => `${anos} ${anos === 1 ? 'ano' : 'anos'}`;

/** Preço de uma linha para um modelo (índice em `modelos`), com ou sem IVA. */
export function precoDe(l: Pick<ContratoManutencao, 'sem' | 'com'>, modelo: number, iva: ComIva): number | null {
  return (iva === 'com' ? l.com : l.sem)[modelo] ?? null;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filtra por código de opção (ex.: "07NG"), sem distinguir maiúsculas. */
export function filtrarPorCodigo<T extends { codigo: string }>(linhas: T[], query: string): T[] {
  const q = norm(query);
  return q ? linhas.filter(l => norm(l.codigo).includes(q)) : linhas;
}

export interface SecaoManutencao {
  chave: string;
  titulo: string;
  linhas: ContratoManutencao[];
}

/** Agrupa as linhas por tipo / categoria / intervalo, pela ordem do ficheiro. */
export function agruparManutencao(linhas: ContratoManutencao[]): SecaoManutencao[] {
  const out: SecaoManutencao[] = [];
  for (const l of linhas) {
    const chave = `${l.tipo}|${l.categoria}|${l.intervalo}`;
    let s = out.find(x => x.chave === chave);
    if (!s) {
      s = { chave, titulo: [l.tipo, l.categoria, l.intervalo].filter(Boolean).join(' · '), linhas: [] };
      out.push(s);
    }
    s.linhas.push(l);
  }
  return out;
}

/** Linhas que têm preço para o modelo escolhido (os vazios do ficheiro = não disponível). */
export function linhasDoModelo(t: TabelaManutencao, modelo: number, iva: ComIva): ContratoManutencao[] {
  return t.linhas.filter(l => precoDe(l, modelo, iva) !== null);
}

/** Modelos de um RI agrupados (BMW, MINI, elétricos...), com o índice original da coluna. */
export function agruparModelosRI(modelos: { nome: string; grupo: string }[]) {
  const out: { grupo: string; itens: { nome: string; indice: number }[] }[] = [];
  modelos.forEach((m, indice) => {
    let g = out.find(x => x.grupo === m.grupo);
    if (!g) { g = { grupo: m.grupo, itens: [] }; out.push(g); }
    g.itens.push({ nome: m.nome, indice });
  });
  return out;
}

export const descricaoRI = (c: ContratoRI) => `${fmtAnos(c.anos)} / ${c.km.toLocaleString('pt-PT')} km`;

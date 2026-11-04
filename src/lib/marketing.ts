/* ── Marketing (Transversal) — linha do tempo de eventos ─────────────────────
 * Lógica pura (sem React) do tab Marketing: tipos, categorias, estado de cada
 * evento face a "hoje", agrupamento por mês e posição do marcador "Hoje".
 * Os eventos abaixo são DE EXEMPLO (`exemplo: true`) até existir uma fonte de dados
 * (tabela na base de dados); trocar MARKETING_EVENTOS pela fonte real não exige
 * mexer na interface.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CategoriaKey = 'lancamento' | 'evento' | 'campanha' | 'comunicacao';

export interface CategoriaDef {
  key: CategoriaKey;
  label: string;
  /** Cor da categoria (HSL sem hsl()), para marcadores, selos e filtros. */
  hsl: string;
}

export const CATEGORIAS: CategoriaDef[] = [
  { key: 'lancamento', label: 'Lançamento', hsl: '214 77% 47%' },
  { key: 'evento', label: 'Evento', hsl: '262 60% 55%' },
  { key: 'campanha', label: 'Campanha', hsl: '28 90% 50%' },
  { key: 'comunicacao', label: 'Comunicação', hsl: '160 60% 38%' },
];

export const CATEGORIA_BY_KEY: Record<CategoriaKey, CategoriaDef> =
  CATEGORIAS.reduce((acc, c) => { acc[c.key] = c; return acc; }, {} as Record<CategoriaKey, CategoriaDef>);

export interface MarketingEvento {
  id: string;
  titulo: string;
  descricao?: string;
  categoria: CategoriaKey;
  /** Dia (ISO, AAAA-MM-DD). */
  inicio: string;
  /** Último dia, se o evento durar mais do que um. */
  fim?: string;
  local?: string;
  /** Dado de exemplo (ainda sem fonte real). */
  exemplo?: boolean;
}

export const MARKETING_EVENTOS: MarketingEvento[] = [
  { id: 'e1', titulo: 'Black Friday Premium', descricao: 'Condições especiais em stock selecionado e oferta de manutenção.', categoria: 'campanha', inicio: '2026-11-23', fim: '2026-11-30', exemplo: true },
  { id: 'e2', titulo: 'Open House de Natal', descricao: 'Showroom aberto ao público com test drives e experiência M.', categoria: 'evento', inicio: '2026-12-05', fim: '2026-12-06', local: 'Aveiro', exemplo: true },
  { id: 'e3', titulo: 'Campanha de Natal', descricao: 'Comunicação nas redes e email aos clientes da carteira.', categoria: 'comunicacao', inicio: '2026-12-14', fim: '2026-12-24', exemplo: true },
  { id: 'e4', titulo: 'Arranque de ano: Plano Comercial', descricao: 'Apresentação de objetivos e campanhas do primeiro trimestre.', categoria: 'campanha', inicio: '2027-01-12', exemplo: true },
  { id: 'e5', titulo: 'Lançamento de novo modelo', descricao: 'Reveal interno e abertura de pré-reservas.', categoria: 'lancamento', inicio: '2027-02-18', local: 'Maia', exemplo: true },
  { id: 'e6', titulo: 'Test Drive Weekend', descricao: 'Fim de semana de test drives com a gama elétrica.', categoria: 'evento', inicio: '2027-03-13', fim: '2027-03-14', exemplo: true },
  { id: 'e7', titulo: 'Campanha de Primavera', descricao: 'Revisão e pneus, com comunicação segmentada por local.', categoria: 'comunicacao', inicio: '2027-04-06', fim: '2027-04-30', exemplo: true },
  { id: 'e8', titulo: 'Feira / Salão automóvel', descricao: 'Presença da marca com stand e equipa comercial.', categoria: 'evento', inicio: '2027-05-20', fim: '2027-05-23', local: 'Porto', exemplo: true },
  { id: 'e9', titulo: 'Lançamento série especial', descricao: 'Edição limitada para a rede, com campanha dedicada.', categoria: 'lancamento', inicio: '2027-06-15', exemplo: true },
  { id: 'e10', titulo: 'Campanha de Verão', descricao: 'Check-up de verão e condições de retoma.', categoria: 'campanha', inicio: '2027-07-01', fim: '2027-08-15', exemplo: true },
];

/* ── Datas ────────────────────────────────────────────────────────────────────
 * Dias ISO tratados em hora local (meio-dia, para o horário de verão não deslocar
 * o dia). Nunca `new Date('AAAA-MM-DD')`, que é UTC e pode cair no dia anterior. */
export function parseDia(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function hojeIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const MS_DIA = 86_400_000;

/** Dias de calendário entre dois dias ISO (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((parseDia(b).getTime() - parseDia(a).getTime()) / MS_DIA);
}

export type Estado = 'passado' | 'a-decorrer' | 'futuro';

export function estadoDe(ev: MarketingEvento, hoje: string): Estado {
  const fim = ev.fim ?? ev.inicio;
  if (fim < hoje) return 'passado';
  if (ev.inicio <= hoje) return 'a-decorrer';
  return 'futuro';
}

export function ordenar(eventos: MarketingEvento[]): MarketingEvento[] {
  return [...eventos].sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.fim ?? a.inicio).localeCompare(b.fim ?? b.inicio) || a.titulo.localeCompare(b.titulo));
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const nomeMes = (mes0: number) => MESES[mes0];

export interface GrupoMes {
  /** AAAA-MM */
  key: string;
  label: string;
  eventos: MarketingEvento[];
}

/** Agrupa (já ordenados) por mês de início. */
export function agruparPorMes(eventos: MarketingEvento[]): GrupoMes[] {
  const grupos: GrupoMes[] = [];
  for (const ev of ordenar(eventos)) {
    const key = ev.inicio.slice(0, 7);
    let g = grupos[grupos.length - 1];
    if (!g || g.key !== key) {
      const d = parseDia(ev.inicio);
      g = { key, label: `${MESES[d.getMonth()]} ${d.getFullYear()}`, eventos: [] };
      grupos.push(g);
    }
    g.eventos.push(ev);
  }
  return grupos;
}

/** "5 dez", "5–6 dez" ou "28 nov – 2 dez". */
export function formatarIntervalo(ev: Pick<MarketingEvento, 'inicio' | 'fim'>): string {
  const a = parseDia(ev.inicio);
  if (!ev.fim || ev.fim === ev.inicio) return `${a.getDate()} ${MESES_CURTO[a.getMonth()]}`;
  const b = parseDia(ev.fim);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${MESES_CURTO[b.getMonth()]}`;
  }
  return `${a.getDate()} ${MESES_CURTO[a.getMonth()]} – ${b.getDate()} ${MESES_CURTO[b.getMonth()]}`;
}

/** Texto relativo a hoje: "Hoje", "Amanhã", "Em 19 dias", "A decorrer", "Há 3 dias". */
export function textoRelativo(ev: MarketingEvento, hoje: string): string {
  const estado = estadoDe(ev, hoje);
  if (estado === 'a-decorrer') return ev.inicio === hoje ? 'Começa hoje' : 'A decorrer';
  if (estado === 'futuro') {
    const n = diasEntre(hoje, ev.inicio);
    return n === 1 ? 'Amanhã' : `Em ${n} dias`;
  }
  const n = diasEntre(ev.fim ?? ev.inicio, hoje);
  return n === 1 ? 'Ontem' : `Há ${n} dias`;
}

/** O próximo evento por acontecer ou a decorrer (o mais próximo de hoje). */
export function proximoEvento(eventos: MarketingEvento[], hoje: string): MarketingEvento | null {
  return ordenar(eventos).find(e => estadoDe(e, hoje) !== 'passado') ?? null;
}

/**
 * Onde o marcador "Hoje" cai na sequência de eventos (ordenados), como posição
 * contínua: 0 = no 1.º evento, 1 = no 2.º, 0.5 = a meio caminho entre o 1.º e o 2.º…
 * Antes do 1.º evento: 0. Depois do último: n − 1. Interpola pelo tempo decorrido
 * entre inícios, para o traçado "preenchido" avançar de forma proporcional.
 */
export function posicaoHoje(eventos: MarketingEvento[], hoje: string): number {
  const evs = ordenar(eventos);
  if (evs.length === 0) return 0;
  if (hoje <= evs[0].inicio) return 0;
  for (let i = 0; i < evs.length - 1; i++) {
    const a = evs[i].inicio, b = evs[i + 1].inicio;
    if (hoje >= a && hoje < b) {
      const total = diasEntre(a, b);
      return total <= 0 ? i : i + diasEntre(a, hoje) / total;
    }
  }
  return evs.length - 1;
}

/* ── Marketing (Transversal) — lógica pura da linha do tempo e dos eventos ────
 * Sem React nem base de dados: tipos, estado de cada evento face a "hoje",
 * agrupamento por mês, posição do marcador "Hoje", orçamento, convidados e o
 * texto/link de convite para WhatsApp. Os dados vêm de marketing-data.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface Categoria {
  id: string;
  nome: string;
  /** HSL sem hsl(), p.ex. '214 77% 47%'. */
  cor: string;
  ordem: number;
}

/** Cores à escolha ao criar/editar uma categoria (HSL, alinhadas com o tema). */
export const CORES_CATEGORIA: { nome: string; hsl: string }[] = [
  { nome: 'Azul', hsl: '214 77% 47%' },
  { nome: 'Roxo', hsl: '262 60% 55%' },
  { nome: 'Laranja', hsl: '28 90% 50%' },
  { nome: 'Verde', hsl: '160 60% 38%' },
  { nome: 'Vermelho', hsl: '0 72% 51%' },
  { nome: 'Rosa', hsl: '330 70% 50%' },
  { nome: 'Âmbar', hsl: '45 93% 42%' },
  { nome: 'Cinza', hsl: '215 14% 46%' },
];

export interface MarketingEvento {
  id: string;
  titulo: string;
  categoria_id: string | null;
  /** Dia (AAAA-MM-DD). */
  inicio: string;
  /** Último dia, se durar mais do que um. */
  fim: string | null;
  hora: string | null;
  local: string;
  descricao: string | null;
  dress_code: string | null;
  highlights: string[];
  imagem_path: string | null;
}

export type EventoInput = Omit<MarketingEvento, 'id'>;

/** Orçamento do evento (tabela à parte: só quem edita o vê). */
export interface Orcamento {
  previsto: number | null;
  real: number | null;
}

export const LOCAL_PADRAO = 'Aveiro';

/** Cor neutra para eventos sem categoria. */
export const COR_SEM_CATEGORIA = '215 14% 46%';

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

type Datado = { inicio: string; fim?: string | null };

export type EstadoEvento = 'passado' | 'a-decorrer' | 'futuro';

export function estadoDe(ev: Datado, hoje: string): EstadoEvento {
  const fim = ev.fim ?? ev.inicio;
  if (fim < hoje) return 'passado';
  if (ev.inicio <= hoje) return 'a-decorrer';
  return 'futuro';
}

export function ordenar<T extends Datado & { titulo: string }>(eventos: T[]): T[] {
  return [...eventos].sort((a, b) =>
    a.inicio.localeCompare(b.inicio) || (a.fim ?? a.inicio).localeCompare(b.fim ?? b.inicio) || a.titulo.localeCompare(b.titulo));
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface GrupoMes<T> {
  /** AAAA-MM */
  key: string;
  label: string;
  eventos: T[];
}

/** Agrupa por mês de início (ordenados). */
export function agruparPorMes<T extends Datado & { titulo: string }>(eventos: T[]): GrupoMes<T>[] {
  const grupos: GrupoMes<T>[] = [];
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
export function formatarIntervalo(ev: Datado): string {
  const a = parseDia(ev.inicio);
  if (!ev.fim || ev.fim === ev.inicio) return `${a.getDate()} ${MESES_CURTO[a.getMonth()]}`;
  const b = parseDia(ev.fim);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${MESES_CURTO[b.getMonth()]}`;
  }
  return `${a.getDate()} ${MESES_CURTO[a.getMonth()]} – ${b.getDate()} ${MESES_CURTO[b.getMonth()]}`;
}

/** "5 dez 2026" / "5–6 dez 2026" (com ano, para o detalhe e o convite). */
export function formatarIntervaloComAno(ev: Datado): string {
  const fim = ev.fim ?? ev.inicio;
  const anoFim = parseDia(fim).getFullYear();
  return `${formatarIntervalo(ev)} ${anoFim}`;
}

/** Texto relativo a hoje: "Começa hoje", "Amanhã", "Em 19 dias", "A decorrer", "Ontem", "Há 3 dias". */
export function textoRelativo(ev: Datado, hoje: string): string {
  const estado = estadoDe(ev, hoje);
  if (estado === 'a-decorrer') return ev.inicio === hoje ? 'Começa hoje' : 'A decorrer';
  if (estado === 'futuro') {
    const n = diasEntre(hoje, ev.inicio);
    return n === 1 ? 'Amanhã' : `Em ${n} dias`;
  }
  const n = diasEntre(ev.fim ?? ev.inicio, hoje);
  return n === 1 ? 'Ontem' : `Há ${n} dias`;
}

/** O próximo evento por acontecer ou a decorrer. */
export function proximoEvento<T extends Datado & { titulo: string }>(eventos: T[], hoje: string): T | null {
  return ordenar(eventos).find(e => estadoDe(e, hoje) !== 'passado') ?? null;
}

/**
 * Onde "hoje" cai na sequência de eventos (ordenados), como posição contínua:
 * 0 = no 1.º evento, 1 = no 2.º, 0.5 = a meio caminho entre o 1.º e o 2.º…
 * Antes do 1.º: 0. Depois do último: n − 1. Interpola pelo tempo entre inícios.
 */
export function posicaoHoje<T extends Datado & { titulo: string }>(eventos: T[], hoje: string): number {
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

/* ── Orçamento: previsto (expectativa) vs real ─────────────────────────────── */

export const fmtEuro = (v: number | null | undefined): string =>
  v == null ? '—' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export interface OrcamentoResumo {
  previsto: number | null;
  real: number | null;
  /** real − previsto (positivo = acima do previsto); null se faltar algum. */
  desvio: number | null;
  /** real / previsto, 0..n; null se não der para calcular. */
  usado: number | null;
  estado: 'sem-dados' | 'dentro' | 'proximo' | 'acima';
}

export function resumoOrcamento(previsto: number | null, real: number | null): OrcamentoResumo {
  if (previsto == null || real == null || previsto <= 0) {
    return { previsto, real, desvio: previsto != null && real != null ? real - previsto : null, usado: null, estado: 'sem-dados' };
  }
  const usado = real / previsto;
  return { previsto, real, desvio: real - previsto, usado, estado: usado > 1 ? 'acima' : usado >= 0.9 ? 'proximo' : 'dentro' };
}

/* ── Highlights: uma linha de texto = um ponto ─────────────────────────────── */

export const highlightsDeTexto = (t: string): string[] =>
  t.split('\n').map(l => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);

/* ── Convidados e presenças ────────────────────────────────────────────────── */

export type EstadoConvidado = 'convidado' | 'confirmado' | 'compareceu' | 'faltou' | 'recusou';

export const ESTADOS_CONVIDADO: { value: EstadoConvidado; label: string; cls: string }[] = [
  { value: 'convidado', label: 'Convidado', cls: 'bg-muted text-muted-foreground' },
  { value: 'confirmado', label: 'Confirmado', cls: 'bg-primary/10 text-primary' },
  { value: 'compareceu', label: 'Compareceu', cls: 'bg-success/15 text-success' },
  { value: 'faltou', label: 'Faltou', cls: 'bg-warning/15 text-warning' },
  { value: 'recusou', label: 'Recusou', cls: 'bg-destructive/10 text-destructive' },
];

export interface Convidado {
  id: string;
  evento_id: string;
  vendedor_email: string;
  vendedor_nome: string | null;
  nome: string;
  contacto: string | null;
  estado: EstadoConvidado;
  obs: string | null;
}

export interface ResumoConvidados {
  total: number;
  confirmados: number;
  compareceram: number;
  /** compareceram / (convidados que não recusaram); null sem convidados. */
  assiduidade: number | null;
}

export function resumoConvidados(lista: Pick<Convidado, 'estado'>[]): ResumoConvidados {
  const total = lista.length;
  const compareceram = lista.filter(c => c.estado === 'compareceu').length;
  const confirmados = lista.filter(c => c.estado === 'confirmado' || c.estado === 'compareceu').length;
  const base = lista.filter(c => c.estado !== 'recusou').length;
  return { total, confirmados, compareceram, assiduidade: base > 0 ? compareceram / base : null };
}

export interface GrupoVendedor {
  email: string;
  nome: string;
  convidados: Convidado[];
  resumo: ResumoConvidados;
}

/** Convidados agrupados por vendedor (por nome), cada grupo com o seu resumo. */
export function agruparPorVendedor(lista: Convidado[]): GrupoVendedor[] {
  const mapa = new Map<string, GrupoVendedor>();
  for (const c of lista) {
    const g = mapa.get(c.vendedor_email) ?? { email: c.vendedor_email, nome: c.vendedor_nome || c.vendedor_email, convidados: [], resumo: resumoConvidados([]) };
    g.convidados.push(c);
    mapa.set(c.vendedor_email, g);
  }
  const grupos = [...mapa.values()];
  for (const g of grupos) {
    g.convidados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    g.resumo = resumoConvidados(g.convidados);
  }
  return grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

/* ── WhatsApp ─────────────────────────────────────────────────────────────────
 * Sem API: abre-se o WhatsApp (wa.me) com o texto do convite já escrito e é o
 * vendedor quem carrega em "enviar". */

/** Número só com dígitos e indicativo (assume Portugal sem indicativo). null se não for válido. */
export function telefoneWhatsApp(contacto: string | null | undefined): string | null {
  if (!contacto) return null;
  let d = contacto.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^[29]\d{8}$/.test(d)) d = `351${d}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}

export function textoConvite(
  ev: Pick<MarketingEvento, 'titulo' | 'inicio' | 'fim' | 'hora' | 'local' | 'descricao' | 'dress_code'>,
  convidado?: string,
  vendedor?: string,
): string {
  const linhas: string[] = [];
  linhas.push(convidado ? `Olá ${convidado.split(' ')[0]}!` : 'Olá!');
  linhas.push('');
  linhas.push(`Temos o gosto de o(a) convidar para *${ev.titulo}*.`);
  if (ev.descricao) linhas.push('', ev.descricao.trim());
  linhas.push('');
  linhas.push(`📅 ${formatarIntervaloComAno(ev)}${ev.hora ? ` · ${ev.hora}` : ''}`);
  linhas.push(`📍 ${ev.local}`);
  if (ev.dress_code) linhas.push(`👔 ${ev.dress_code}`);
  linhas.push('', 'Poderá confirmar a sua presença respondendo a esta mensagem.');
  if (vendedor) linhas.push('', `${vendedor.split(' ')[0]} · Caetano BMW`);
  return linhas.join('\n');
}

/** Link wa.me; sem número abre o seletor de contactos do WhatsApp. */
export function linkWhatsApp(texto: string, contacto?: string | null): string {
  const tel = telefoneWhatsApp(contacto);
  return `https://wa.me/${tel ?? ''}?text=${encodeURIComponent(texto)}`;
}

/* ── Mapa (Google Maps) ───────────────────────────────────────────────────────
 * Sem chave, o mapa do local abre por embed simples e a rota vai por ligação ao
 * Google Maps (onde se vê a distância). Com VITE_GOOGLE_MAPS_KEY (Maps Embed API,
 * gratuita) o próprio mapa mostra a rota, a distância e o tempo de viagem. */

const enc = encodeURIComponent;

/** Mapa embebido: com chave, rota origem→local (distância e tempo no próprio mapa); sem chave, só o local. */
export function urlMapaEmbed(local: string, origem: string, chave?: string | null): string {
  if (chave) {
    return `https://www.google.com/maps/embed/v1/directions?key=${enc(chave)}&origin=${enc(origem)}&destination=${enc(local)}&language=pt-PT&region=PT`;
  }
  return `https://www.google.com/maps?q=${enc(local)}&hl=pt-PT&z=14&output=embed`;
}

export const urlAbrirMapa = (local: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${enc(local)}`;

export const urlRota = (origem: string, local: string): string =>
  `https://www.google.com/maps/dir/?api=1&origin=${enc(origem)}&destination=${enc(local)}&travelmode=driving`;

/* ── Resumo da agenda (faixa de números no topo) ───────────────────────────── */

export interface ResumoAgenda {
  porAcontecer: number;
  proximos30: number;
  realizados: number;
}

export function resumoAgenda(eventos: Datado[], hoje: string): ResumoAgenda {
  let porAcontecer = 0, proximos30 = 0, realizados = 0;
  for (const e of eventos) {
    const estado = estadoDe(e, hoje);
    if (estado === 'passado') { realizados++; continue; }
    porAcontecer++;
    if (estado === 'a-decorrer' || diasEntre(hoje, e.inicio) <= 30) proximos30++;
  }
  return { porAcontecer, proximos30, realizados };
}

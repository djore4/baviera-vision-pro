import { supabase as typedClient } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saudacao } from '@/lib/matricula';

/* ── Seguros (Transversal) — controlo dos seguros das viaturas ────────────────
 * Cada registo é um período de seguro de uma matrícula. O estado (ativo, a
 * expirar, expirado…) deriva das datas e de `arquivado` — nunca se guarda, para
 * não ficar desatualizado. As regras de controlo vivem aqui, puras e testáveis:
 *   • viatura a circular sem seguro  → seguro cujo fim passou e não foi arquivado;
 *   • seguro ativo de viatura vendida → mesma matrícula em viaturas_vendidas;
 *   • custo duplicado                 → dois seguros por arquivar a sobrepor-se na mesma matrícula.
 *
 * A tabela não consta dos tipos gerados do Supabase: cliente sem tipos (como eot.ts).
 * ──────────────────────────────────────────────────────────────────────────── */

const supabase = typedClient as unknown as SupabaseClient;

const TABLE = 'seguros';

/* ── Enumerações e etiquetas ─────────────────────────────────────────────────── */

export type Area = 'bmw_vn' | 'bmw_vu' | 'motorrad' | 'apv';

export const AREAS_SEGURO: { value: Area; label: string }[] = [
  { value: 'bmw_vn',   label: 'BMW VN' },
  { value: 'bmw_vu',   label: 'BMW VU' },
  { value: 'motorrad', label: 'BMW Motorrad' },
  { value: 'apv',      label: 'Após-venda' },
];
export const areaLabel = (a: Area) => AREAS_SEGURO.find(x => x.value === a)?.label ?? a;

export type Cobertura = 'terceiros' | 'danos_proprios';

export const COBERTURAS: { value: Cobertura; label: string }[] = [
  { value: 'terceiros',      label: 'Contra terceiros' },
  { value: 'danos_proprios', label: 'Danos próprios' },
];
export const coberturaLabel = (c: Cobertura) => COBERTURAS.find(x => x.value === c)?.label ?? c;

export type MotivoArquivo = 'terminado' | 'viatura_vendida' | 'cancelado' | 'substituido';

export const MOTIVOS_ARQUIVO: { value: MotivoArquivo; label: string }[] = [
  { value: 'terminado',       label: 'Terminado' },
  { value: 'viatura_vendida', label: 'Viatura vendida' },
  { value: 'cancelado',       label: 'Cancelado' },
  { value: 'substituido',     label: 'Substituído por outro' },
];
export const motivoLabel = (m: MotivoArquivo | null) => MOTIVOS_ARQUIVO.find(x => x.value === m)?.label ?? '—';

/* Dias de antecedência a partir dos quais um seguro "está a expirar". */
export const DIAS_AVISO = 30;

export interface Seguro {
  id: string;
  matricula: string;
  matricula_norm: string;
  chassis: string | null;
  viatura: string;
  area: Area;
  solicitante: string;        // quem pede
  responsavel_info: string | null; // quem prestou a informação (obrigatório em danos próprios)
  cancelamento_pedido_em: string | null; // quando se pediu à seguradora o cancelamento (a baixa é arquivar)
  dp_desde: string | null;    // desde quando a cobertura é danos próprios (upgrade)
  cliente: string | null;     // a serviço de
  data_pedido: string;        // ISO 'AAAA-MM-DD'
  inicio: string;
  fim: string | null;         // null = sem termo (apólice de frota em vigor até ser cancelada)
  cobertura: Cobertura;
  capital_seguro: number | null;
  premio: number | null;
  seguradora: string | null;
  apolice: string | null;
  obs: string | null;
  arquivado: boolean;
  arquivado_em: string | null;
  motivo_arquivo: MotivoArquivo | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

/* De onde vem uma viatura do parque que tem de estar segurada. */
export type OrigemParque = 'demos' | 'stock_vu';
export const ORIGENS_PARQUE: Record<OrigemParque, string> = { demos: 'Demos VN', stock_vu: 'Stock VU' };

export interface ViaturaParque {
  origem: OrigemParque;
  ref: string;                // chassis (viaturas) ou id (retomas)
  chassis: string | null;
  matricula: string | null;
  modelo: string | null;
  versao: string | null;
  marca: string | null;
  area: Area;                 // área sugerida ao registar
}

/* Sinal que prova que a viatura já não é nossa. */
export type OrigemVenda = 'demos_arquivo' | 'retail' | 'stock_vu';
export const ORIGENS_VENDA: Record<OrigemVenda, string> = {
  demos_arquivo: 'arquivada nos Demos', retail: 'passou a Retail', stock_vu: 'arquivada no Stock VU',
};

export interface ViaturaVendida {
  matricula: string | null;
  origem: OrigemVenda;
  data_venda: string | null;
}

/* Valores do formulário (strings, como nos inputs). */
export interface SeguroFormValues {
  matricula: string;
  chassis: string;
  viatura: string;
  area: Area;
  solicitante: string;
  responsavel_info: string;
  cliente: string;
  data_pedido: string;
  inicio: string;
  fim: string;                // '' = sem termo
  cobertura: Cobertura;
  capital_seguro: string;
  premio: string;
  seguradora: string;
  apolice: string;
  obs: string;
}

/* ── Datas e matrículas ──────────────────────────────────────────────────────── */

export const hojeIso = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseDia = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** Dias de calendário de `a` até `b` (negativo se `b` é anterior). Imune à mudança de hora. */
export const diasEntre = (a: string, b: string): number => {
  const da = parseDia(a), db = parseDia(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate())
    - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86_400_000);
};

export const fmtDia = (iso: string | null): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};

export const fmtEuro = (n: number | null | undefined): string =>
  n == null ? '—' : n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/** Matrícula sem hífens/espaços e em maiúsculas — a chave de cruzamento ("00-AA-00" = "00aa00"). */
export const normMatricula = (m: string | null | undefined): string =>
  (m ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ── Estado derivado ─────────────────────────────────────────────────────────── */

export type EstadoSeguro = 'futuro' | 'ativo' | 'a_expirar' | 'expirado' | 'arquivado';

export const ESTADOS_SEGURO: { value: EstadoSeguro; label: string; cls: string }[] = [
  { value: 'ativo',     label: 'Ativo',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  { value: 'a_expirar', label: 'A expirar',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'expirado',  label: 'Expirado',   cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  { value: 'futuro',    label: 'Por iniciar', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { value: 'arquivado', label: 'Arquivado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300' },
];
export const estadoDef = (e: EstadoSeguro) => ESTADOS_SEGURO.find(x => x.value === e) ?? ESTADOS_SEGURO[0];

/** `fim` é inclusivo: um seguro que termina hoje ainda cobre hoje. */
export function estadoSeguro(s: Pick<Seguro, 'inicio' | 'fim' | 'arquivado'>, hoje: string = hojeIso()): EstadoSeguro {
  if (s.arquivado) return 'arquivado';
  if (s.fim && s.fim < hoje) return 'expirado';
  if (s.inicio > hoje) return 'futuro';
  if (!s.fim) return 'ativo';
  return diasEntre(hoje, s.fim) <= DIAS_AVISO ? 'a_expirar' : 'ativo';
}

/** Cobre a viatura hoje: começou, não acabou e não foi arquivado. */
export const cobreHoje = (s: Pick<Seguro, 'inicio' | 'fim' | 'arquivado'>, hoje: string = hojeIso()): boolean =>
  !s.arquivado && s.inicio <= hoje && (!s.fim || s.fim >= hoje);

/** Dias até ao fim (negativo = já terminou há N dias); null se não tem termo. */
export const diasParaFim = (s: Pick<Seguro, 'fim'>, hoje: string = hojeIso()): number | null =>
  s.fim ? diasEntre(hoje, s.fim) : null;

/* ── Alertas de controlo ─────────────────────────────────────────────────────── */

export interface Alertas {
  /** Fim já passou e continua por arquivar: a viatura pode estar a circular sem seguro. */
  expirados: Seguro[];
  /** Por arquivar e a expirar nos próximos DIAS_AVISO dias (renovar ou arquivar). */
  aExpirar: Seguro[];
  /** Por arquivar, de uma matrícula que já está nas viaturas vendidas: custo a cortar. */
  vendidosAtivos: Seguro[];
  /** Matrículas com dois ou mais seguros por arquivar a sobrepor-se no tempo: custo duplicado. */
  sobrepostos: { matricula: string; seguros: Seguro[] }[];
}

export function alertas(list: Seguro[], vendidas: Pick<ViaturaVendida, 'matricula'>[] = [], hoje: string = hojeIso()): Alertas {
  const porArquivar = list.filter(s => !s.arquivado);
  const vendidasSet = new Set(vendidas.map(v => normMatricula(v.matricula)).filter(Boolean));

  const expirados = porArquivar.filter(s => estadoSeguro(s, hoje) === 'expirado')
    .sort((a, b) => (a.fim ?? '').localeCompare(b.fim ?? ''));
  const aExpirar = porArquivar.filter(s => estadoSeguro(s, hoje) === 'a_expirar')
    .sort((a, b) => (a.fim ?? '').localeCompare(b.fim ?? ''));
  const vendidosAtivos = porArquivar.filter(s => vendidasSet.has(s.matricula_norm || normMatricula(s.matricula)));

  const porMatricula = new Map<string, Seguro[]>();
  for (const s of porArquivar) {
    const k = s.matricula_norm || normMatricula(s.matricula);
    porMatricula.set(k, [...(porMatricula.get(k) ?? []), s]);
  }
  const sobrepostos: Alertas['sobrepostos'] = [];
  for (const seguros of porMatricula.values()) {
    if (seguros.length < 2) continue;
    const ord = [...seguros].sort((a, b) => a.inicio.localeCompare(b.inicio));
    const envolvidos = new Set<Seguro>();
    for (let i = 0; i < ord.length; i++) {
      for (let j = i + 1; j < ord.length; j++) {
        if (ord[j].inicio <= (ord[i].fim ?? '9999-12-31')) { envolvidos.add(ord[i]); envolvidos.add(ord[j]); }
      }
    }
    if (envolvidos.size) sobrepostos.push({ matricula: ord[0].matricula, seguros: ord.filter(s => envolvidos.has(s)) });
  }
  return { expirados, aExpirar, vendidosAtivos, sobrepostos };
}

/** Venda detetada da matrícula deste seguro (a mais antiga), ou `null`. */
export function vendaDe(s: Pick<Seguro, 'matricula' | 'matricula_norm'>, vendidas: ViaturaVendida[]): ViaturaVendida | null {
  const n = s.matricula_norm || normMatricula(s.matricula);
  const v = vendidas.filter(x => normMatricula(x.matricula) === n);
  return v.length ? v.sort((a, b) => (a.data_venda ?? '').localeCompare(b.data_venda ?? ''))[0] : null;
}

/** Texto do realce "dar baixa": "passou a Retail em 05-11-2026". */
export const textoVenda = (v: ViaturaVendida): string =>
  `${ORIGENS_VENDA[v.origem] ?? 'vendida'}${v.data_venda ? ` em ${fmtDia(v.data_venda)}` : ''}`;

/** Campos obrigatórios em falta num seguro de danos próprios por arquivar (ex.: importados sem fim). */
export function dadosEmFalta(s: Pick<Seguro, 'cobertura' | 'arquivado' | 'capital_seguro' | 'fim' | 'responsavel_info'>): string[] {
  if (s.arquivado || s.cobertura !== 'danos_proprios') return [];
  const f: string[] = [];
  if (!s.capital_seguro || s.capital_seguro <= 0) f.push('valor seguro');
  if (!s.fim) f.push('data de fim');
  if (!(s.responsavel_info ?? '').trim()) f.push('responsável pela informação');
  return f;
}

/** Viaturas do parque (com matrícula) sem nenhum seguro a cobri-las hoje. */
export function parqueSemSeguro(parque: ViaturaParque[], list: Seguro[], hoje: string = hojeIso()): ViaturaParque[] {
  const cobertas = new Set(list.filter(s => cobreHoje(s, hoje)).map(s => s.matricula_norm || normMatricula(s.matricula)));
  return parque.filter(v => {
    const m = normMatricula(v.matricula);
    return m !== '' && !cobertas.has(m);
  });
}

/** Viaturas do parque ainda sem matrícula: não se podem segurar, mas ficam à vista. */
export const parqueSemMatricula = (parque: ViaturaParque[]): ViaturaParque[] =>
  parque.filter(v => normMatricula(v.matricula) === '');

/* ── KPIs e custo ────────────────────────────────────────────────────────────── */

export interface SegurosKpi {
  ativos: number;            // por arquivar e a cobrir hoje (inclui "a expirar")
  aExpirar: number;
  expirados: number;
  vendidosAtivos: number;
  dadosEmFalta: number;      // danos próprios por arquivar com campos obrigatórios por preencher
  premioAtivo: number;       // soma dos prémios dos seguros por arquivar e a cobrir hoje
  capitalAtivo: number;      // soma do capital seguro (danos próprios) dos mesmos
}

export function kpis(list: Seguro[], vendidas: Pick<ViaturaVendida, 'matricula'>[] = [], hoje: string = hojeIso()): SegurosKpi {
  const a = alertas(list, vendidas, hoje);
  const ativos = list.filter(s => cobreHoje(s, hoje));
  return {
    ativos: ativos.length,
    aExpirar: a.aExpirar.length,
    expirados: a.expirados.length,
    vendidosAtivos: a.vendidosAtivos.length,
    dadosEmFalta: list.filter(s => dadosEmFalta(s).length > 0).length,
    premioAtivo: ativos.reduce((t, s) => t + (s.premio ?? 0), 0),
    capitalAtivo: ativos.reduce((t, s) => t + (s.capital_seguro ?? 0), 0),
  };
}

/** Prémios por área (só seguros que cobrem hoje), do mais caro para o mais barato. */
export function custoPorArea(list: Seguro[], hoje: string = hojeIso()): { area: Area; seguros: number; premio: number }[] {
  const m = new Map<Area, { seguros: number; premio: number }>();
  for (const s of list) {
    if (!cobreHoje(s, hoje)) continue;
    const cur = m.get(s.area) ?? { seguros: 0, premio: 0 };
    m.set(s.area, { seguros: cur.seguros + 1, premio: cur.premio + (s.premio ?? 0) });
  }
  return AREAS_SEGURO.filter(a => m.has(a.value)).map(a => ({ area: a.value, ...m.get(a.value)! }))
    .sort((a, b) => b.premio - a.premio);
}

/* ── Filtros ─────────────────────────────────────────────────────────────────── */

export interface SeguroFiltro {
  separador: 'ativos' | 'arquivados';
  area: Area | 'all';
  cobertura: Cobertura | 'all';
  estado: EstadoSeguro | 'all';
  q: string;
}

const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrar(list: Seguro[], f: SeguroFiltro, hoje: string = hojeIso()): Seguro[] {
  const q = semAcentos(f.q.trim());
  const qm = normMatricula(f.q);
  return list.filter(s => {
    if (f.separador === 'ativos' ? s.arquivado : !s.arquivado) return false;
    if (f.area !== 'all' && s.area !== f.area) return false;
    if (f.cobertura !== 'all' && s.cobertura !== f.cobertura) return false;
    if (f.estado !== 'all' && estadoSeguro(s, hoje) !== f.estado) return false;
    if (q) {
      const hay = semAcentos([s.matricula, s.viatura, s.solicitante, s.cliente, s.seguradora, s.apolice, s.chassis]
        .filter(Boolean).join(' '));
      if (!hay.includes(q) && !(qm && s.matricula_norm.includes(qm))) return false;
    }
    return true;
  }).sort((a, b) => f.separador === 'ativos'
    ? (a.fim ?? '9999').localeCompare(b.fim ?? '9999')                                      // o que acaba primeiro, primeiro
    : (b.arquivado_em ?? '').localeCompare(a.arquivado_em ?? ''));
}

/* ── Formulário ──────────────────────────────────────────────────────────────── */

export const emptyForm = (hoje: string = hojeIso()): SeguroFormValues => ({
  matricula: '', chassis: '', viatura: '', area: 'bmw_vn', solicitante: '', responsavel_info: '', cliente: '',
  data_pedido: hoje, inicio: hoje, fim: '', cobertura: 'terceiros', capital_seguro: '', premio: '',
  seguradora: '', apolice: '', obs: '',
});

export const formFromSeguro = (s: Seguro): SeguroFormValues => ({
  matricula: s.matricula, chassis: s.chassis ?? '', viatura: s.viatura, area: s.area,
  solicitante: s.solicitante, responsavel_info: s.responsavel_info ?? '', cliente: s.cliente ?? '', data_pedido: s.data_pedido, inicio: s.inicio, fim: s.fim ?? '',
  cobertura: s.cobertura, capital_seguro: s.capital_seguro != null ? String(s.capital_seguro) : '',
  premio: s.premio != null ? String(s.premio) : '', seguradora: s.seguradora ?? '', apolice: s.apolice ?? '', obs: s.obs ?? '',
});

/** "1 234,50" / "1234.5" → 1234.5; vazio ou inválido → null. */
export const parseEuro = (s: string): number | null => {
  const t = s.replace(/\s/g, '').replace(/€/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};

/** Primeira mensagem de erro do formulário, ou `null` se estiver válido. */
export function validarForm(v: SeguroFormValues): string | null {
  if (!normMatricula(v.matricula)) return 'Indica a matrícula.';
  if (!v.viatura.trim()) return 'Indica a viatura (marca e modelo).';
  if (!v.solicitante.trim()) return 'Indica quem pede o seguro.';
  if (!v.inicio) return 'Indica a data de início.';
  if (v.fim && v.fim < v.inicio) return 'A data de fim não pode ser anterior à de início.';
  if (v.cobertura === 'danos_proprios') {
    // Danos próprios: valor seguro, início, fim e responsável pela informação são obrigatórios.
    const c = parseEuro(v.capital_seguro);
    if (c == null || c <= 0) return 'Em danos próprios, indica o valor seguro.';
    if (!v.fim) return 'Em danos próprios, indica a data de fim.';
    if (!v.responsavel_info.trim()) return 'Em danos próprios, indica o responsável pela informação prestada.';
  }
  if (v.premio.trim()) {
    const p = parseEuro(v.premio);
    if (p == null || p < 0) return 'O prémio tem de ser um valor positivo.';
  }
  return null;
}

const clean = (s: string | null | undefined) => {
  const v = (s ?? '').trim();
  return v === '' ? null : v;
};

const toRow = (v: SeguroFormValues) => ({
  matricula: v.matricula.trim().toUpperCase(),
  chassis: clean(v.chassis),
  viatura: v.viatura.trim(),
  area: v.area,
  solicitante: v.solicitante.trim(),
  responsavel_info: clean(v.responsavel_info),
  cliente: clean(v.cliente),
  data_pedido: v.data_pedido || hojeIso(),
  inicio: v.inicio,
  fim: v.fim || null,
  cobertura: v.cobertura,
  capital_seguro: v.cobertura === 'danos_proprios' ? parseEuro(v.capital_seguro) : null,
  premio: parseEuro(v.premio),
  seguradora: clean(v.seguradora),
  apolice: clean(v.apolice),
  obs: clean(v.obs),
});

/* ── Acesso a dados ──────────────────────────────────────────────────────────── */

export async function listSeguros(): Promise<Seguro[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('fim', { ascending: true });
  if (error) throw new Error(`Não foi possível ler os seguros: ${error.message}`);
  return (data ?? []) as Seguro[];
}

export async function createSeguro(v: SeguroFormValues): Promise<Seguro> {
  const { data, error } = await supabase.from(TABLE).insert(toRow(v)).select().single();
  if (error) throw new Error(`Não foi possível registar o seguro: ${error.message}`);
  return data as Seguro;
}

export async function updateSeguro(id: string, v: SeguroFormValues): Promise<Seguro> {
  const { data, error } = await supabase.from(TABLE).update(toRow(v)).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível guardar o seguro: ${error.message}`);
  return data as Seguro;
}

export async function arquivarSeguro(id: string, motivo: MotivoArquivo): Promise<Seguro> {
  const { data, error } = await supabase.from(TABLE)
    .update({ arquivado: true, motivo_arquivo: motivo, arquivado_em: hojeIso() }).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível arquivar o seguro: ${error.message}`);
  return data as Seguro;
}

export async function reativarSeguro(id: string): Promise<Seguro> {
  const { data, error } = await supabase.from(TABLE)
    .update({ arquivado: false }).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível reativar o seguro: ${error.message}`);
  return data as Seguro;
}

export async function deleteSeguro(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Não foi possível apagar o seguro: ${error.message}`);
}

/* O parque e as vendidas só alimentam sugestões e alertas: se falharem, o tab continua a funcionar. */
export async function listParque(): Promise<ViaturaParque[]> {
  const { data, error } = await supabase.rpc('seguros_parque');
  if (error) return [];
  return (data ?? []) as ViaturaParque[];
}

export async function listVendidas(): Promise<ViaturaVendida[]> {
  const { data, error } = await supabase.rpc('seguros_vendidas');
  if (error) return [];
  return (data ?? []) as ViaturaVendida[];
}

/* ── Cancelar seguro: mensagem para colar no Outlook ─────────────────────────── */

export interface CancelamentoOpts {
  /** Data a partir da qual o cancelamento deve produzir efeito (AAAA-MM-DD). */
  efeito: string;
  /** Motivo escrito na mensagem. */
  motivo: string;
  now?: Date;
}

/** Texto do pedido de cancelamento (assunto + corpo), pronto a copiar para o email. */
export function mensagemCancelamento(s: Seguro, o: CancelamentoOpts): string {
  const linha = (k: string, v: string | null | undefined) => (v && v.trim() ? `${k}: ${v.trim()}` : null);
  return [
    `Assunto: Cancelamento de seguro | ${s.matricula}${s.apolice ? ` | Apólice ${s.apolice}` : ''}`,
    '',
    `${saudacao(o.now)},`,
    '',
    `Solicito o cancelamento do seguro da viatura abaixo, com efeito a ${fmtDia(o.efeito)}:`,
    '',
    linha('Matrícula', s.matricula),
    linha('Viatura', s.viatura),
    linha('Apólice', s.apolice),
    linha('Seguradora', s.seguradora),
    linha('Cobertura', coberturaLabel(s.cobertura)),
    `Período registado: ${fmtDia(s.inicio)} → ${s.fim ? fmtDia(s.fim) : 'sem termo'}`,
    linha('Motivo', o.motivo),
    '',
    'Agradeço a confirmação do cancelamento e, se aplicável, o estorno do prémio não utilizado.',
    '',
    'Cumprimentos,',
  ].filter((l): l is string => l !== null).join('\n');
}

/** Copia para a área de transferência (com recurso a execCommand fora de contextos seguros). */
export async function copiarTexto(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* cai no fallback */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/* ── Upgrade de terceiros para danos próprios ────────────────────────────────── */

export interface UpgradeValues {
  capital_seguro: string;
  dp_desde: string;
  fim: string;
  responsavel_info: string;
}

/** Danos próprios exigem valor seguro, início, fim e responsável pela informação. */
export function validarUpgrade(v: UpgradeValues, s: Pick<Seguro, 'inicio'>): string | null {
  const c = parseEuro(v.capital_seguro);
  if (c == null || c <= 0) return 'Indica o valor seguro.';
  if (!v.dp_desde) return 'Indica a data de início dos danos próprios.';
  if (v.dp_desde < s.inicio) return 'O início dos danos próprios não pode ser anterior ao início do seguro.';
  if (!v.fim) return 'Indica a data de fim.';
  if (v.fim < v.dp_desde) return 'A data de fim não pode ser anterior ao início dos danos próprios.';
  if (!v.responsavel_info.trim()) return 'Indica o responsável pela informação prestada.';
  return null;
}

export interface HistoricoSeguro {
  id: string;
  seguro_id: string;
  tipo: 'cobertura' | 'cancelamento_pedido' | 'arquivado' | 'reativado';
  de: string | null;
  para: string | null;
  detalhe: string | null;
  autor: string | null;
  created_at: string;
}

export function historicoLabel(h: Pick<HistoricoSeguro, 'tipo' | 'de' | 'para'>): string {
  switch (h.tipo) {
    case 'cobertura': return `Cobertura: ${coberturaLabel((h.de ?? 'terceiros') as Cobertura)} → ${coberturaLabel((h.para ?? 'terceiros') as Cobertura)}`;
    case 'cancelamento_pedido': return `Cancelamento pedido à seguradora (${h.para ?? '—'})`;
    case 'arquivado': return `Arquivado${h.para ? ` — ${motivoLabel(h.para as MotivoArquivo)}` : ''}`;
    case 'reativado': return 'Reativado';
  }
}

export async function upgradeDanosProprios(id: string, v: UpgradeValues): Promise<Seguro> {
  const { data, error } = await supabase.from(TABLE).update({
    cobertura: 'danos_proprios',
    capital_seguro: parseEuro(v.capital_seguro),
    dp_desde: v.dp_desde,
    fim: v.fim,
    responsavel_info: v.responsavel_info.trim(),
  }).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível fazer o upgrade para danos próprios: ${error.message}`);
  return data as Seguro;
}

export async function marcarCancelamentoPedido(id: string): Promise<Seguro> {
  const { data, error } = await supabase.from(TABLE)
    .update({ cancelamento_pedido_em: hojeIso() }).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível registar o pedido de cancelamento: ${error.message}`);
  return data as Seguro;
}

export async function listHistoricoSeguro(id: string): Promise<HistoricoSeguro[]> {
  const { data, error } = await supabase.from('seguros_historico').select('*').eq('seguro_id', id)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as HistoricoSeguro[];
}

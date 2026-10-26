import { supabase as typedClient } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/* ── Instalações — ocorrências registadas sobre a planta ──────────────────────
 * Cada ocorrência fica ancorada a um ponto de uma planta (piso + x/y como fração
 * 0–1 da imagem: não depende da resolução) e diz o que é preciso fazer, quando
 * aconteceu e a quem foi reportada. O histórico (criação, mudanças de estado e de
 * interlocutor) é escrito por trigger na base de dados.
 *
 * As tabelas não constam dos tipos gerados do Supabase: os nomes passam como
 * string e as respostas são convertidas — mesmo padrão de eot.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Cliente sem tipos de linha: no types.ts gerado, as colunas de estado/prioridade/
 * categoria são `string`, e aqui interessam as uniões literais (Estado, Prioridade…). */
const supabase = typedClient as unknown as SupabaseClient;

const TABLE = 'instalacoes_ocorrencias';
const HIST_TABLE = 'instalacoes_historico';

/* ── Enumerações e etiquetas ─────────────────────────────────────────────────── */

export type Estado = 'aberta' | 'em_curso' | 'resolvida' | 'cancelada';

export const ESTADOS: { value: Estado; label: string; cls: string }[] = [
  { value: 'aberta',    label: 'Aberta',    cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  { value: 'em_curso',  label: 'Em curso',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'resolvida', label: 'Resolvida', cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  { value: 'cancelada', label: 'Cancelada', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300' },
];

export const estadoDef = (e: Estado) => ESTADOS.find(x => x.value === e) ?? ESTADOS[0];

/* Ocorrências que ainda pedem ação. */
export const isAtiva = (o: Pick<Ocorrencia, 'estado'>) => o.estado === 'aberta' || o.estado === 'em_curso';

export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';

/* `pin` é a cor do marcador na planta; `rank` ordena (maior = mais urgente). */
export const PRIORIDADES: { value: Prioridade; label: string; pin: string; badge: string; rank: number }[] = [
  { value: 'baixa',   label: 'Baixa',   pin: '#64748b', rank: 0, badge: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'normal',  label: 'Normal',  pin: '#0ea5e9', rank: 1, badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { value: 'alta',    label: 'Alta',    pin: '#f59e0b', rank: 2, badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'urgente', label: 'Urgente', pin: '#dc2626', rank: 3, badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
];

export const prioridadeDef = (p: Prioridade) => PRIORIDADES.find(x => x.value === p) ?? PRIORIDADES[1];

export type Categoria =
  | 'eletricidade' | 'canalizacao' | 'climatizacao' | 'estrutura'
  | 'pintura' | 'equipamento' | 'seguranca' | 'limpeza' | 'outro';

export const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'eletricidade', label: 'Eletricidade' },
  { value: 'canalizacao',  label: 'Canalização' },
  { value: 'climatizacao', label: 'Climatização' },
  { value: 'estrutura',    label: 'Estrutura / pavimento' },
  { value: 'pintura',      label: 'Pintura' },
  { value: 'equipamento',  label: 'Equipamento' },
  { value: 'seguranca',    label: 'Segurança' },
  { value: 'limpeza',      label: 'Limpeza' },
  { value: 'outro',        label: 'Outro' },
];

export const categoriaLabel = (c: Categoria) => CATEGORIAS.find(x => x.value === c)?.label ?? c;

/* ── Tipos ───────────────────────────────────────────────────────────────────── */

export interface Ocorrencia {
  id: string;
  piso: string;
  x: number;                 // 0–1, fração da largura da planta
  y: number;                 // 0–1, fração da altura
  zona: string | null;
  titulo: string;
  intervencao: string;       // intervenção necessária
  categoria: Categoria;
  prioridade: Prioridade;
  estado: Estado;
  data_ocorrencia: string;   // ISO 'AAAA-MM-DD'
  interlocutor: string | null;
  data_reporte: string | null;
  obs: string | null;
  resolvida_em: string | null;
  criada_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoricoItem {
  id: string;
  ocorrencia_id: string;
  tipo: 'criada' | 'estado' | 'reporte';
  de: string | null;
  para: string | null;
  autor: string | null;
  created_at: string;
}

/* Campos que o utilizador preenche ao registar. */
export type NovaOcorrencia = Pick<Ocorrencia,
  'piso' | 'x' | 'y' | 'titulo' | 'intervencao' | 'categoria' | 'prioridade' | 'data_ocorrencia'>
  & Partial<Pick<Ocorrencia, 'zona' | 'interlocutor' | 'data_reporte' | 'obs'>>;

export type OcorrenciaPatch = Partial<Pick<Ocorrencia,
  'piso' | 'x' | 'y' | 'zona' | 'titulo' | 'intervencao' | 'categoria' | 'prioridade' | 'estado'
  | 'data_ocorrencia' | 'interlocutor' | 'data_reporte' | 'obs'>>;

/* ── Acesso a dados ──────────────────────────────────────────────────────────── */

export async function listOcorrencias(): Promise<Ocorrencia[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('data_ocorrencia', { ascending: false });
  if (error) throw new Error(`Não foi possível ler as ocorrências: ${error.message}`);
  return (data ?? []) as Ocorrencia[];
}

const clean = (s: string | null | undefined) => {
  const v = (s ?? '').trim();
  return v === '' ? null : v;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export async function createOcorrencia(input: NovaOcorrencia): Promise<Ocorrencia> {
  const { data, error } = await supabase.from(TABLE).insert({
    piso: input.piso,
    x: clamp01(input.x),
    y: clamp01(input.y),
    zona: clean(input.zona),
    titulo: input.titulo.trim(),
    intervencao: input.intervencao.trim(),
    categoria: input.categoria,
    prioridade: input.prioridade,
    data_ocorrencia: input.data_ocorrencia,
    interlocutor: clean(input.interlocutor),
    data_reporte: clean(input.interlocutor) ? (input.data_reporte ?? null) : null,
    obs: clean(input.obs),
  }).select().single();
  if (error) throw new Error(`Não foi possível registar a ocorrência: ${error.message}`);
  return data as Ocorrencia;
}

export async function updateOcorrencia(id: string, patch: OcorrenciaPatch): Promise<Ocorrencia> {
  const row: Record<string, unknown> = { ...patch };
  if (patch.x != null) row.x = clamp01(patch.x);
  if (patch.y != null) row.y = clamp01(patch.y);
  for (const k of ['zona', 'interlocutor', 'obs'] as const) {
    if (k in patch) row[k] = clean(patch[k]);
  }
  if ('titulo' in patch && patch.titulo != null) row.titulo = patch.titulo.trim();
  if ('intervencao' in patch && patch.intervencao != null) row.intervencao = patch.intervencao.trim();
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível guardar a ocorrência: ${error.message}`);
  return data as Ocorrencia;
}

export async function deleteOcorrencia(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Não foi possível apagar a ocorrência: ${error.message}`);
}

export async function listHistorico(ocorrenciaId: string): Promise<HistoricoItem[]> {
  const { data, error } = await supabase
    .from(HIST_TABLE).select('*').eq('ocorrencia_id', ocorrenciaId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as HistoricoItem[];
}

/* ── Derivados (puros, testáveis) ────────────────────────────────────────────── */

export interface InstalacoesKpi {
  ativas: number;
  urgentes: number;        // ativas com prioridade urgente
  porReportar: number;     // ativas sem interlocutor
  maisAntiga: number | null; // dias da ativa mais antiga
}

/** Dias desde uma data ISO (0 = hoje). `agora` injetável para testes. */
export function diasDesde(iso: string, agora: Date = new Date()): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const a = new Date(y, m - 1, d).getTime();
  const b = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function kpis(list: Ocorrencia[], agora: Date = new Date()): InstalacoesKpi {
  const ativas = list.filter(isAtiva);
  return {
    ativas: ativas.length,
    urgentes: ativas.filter(o => o.prioridade === 'urgente').length,
    porReportar: ativas.filter(o => !o.interlocutor).length,
    maisAntiga: ativas.length ? Math.max(...ativas.map(o => diasDesde(o.data_ocorrencia, agora))) : null,
  };
}

export interface OcorrenciaFiltro {
  piso?: string;                 // 'all' ou id
  estado?: 'ativas' | 'all' | Estado;
  categoria?: Categoria | 'all';
  prioridade?: Prioridade | 'all';
  q?: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtra e ordena: ativas primeiro, depois mais urgentes, depois mais antigas. */
export function filtrar(list: Ocorrencia[], f: OcorrenciaFiltro): Ocorrencia[] {
  const q = norm((f.q ?? '').trim());
  return list
    .filter(o => !f.piso || f.piso === 'all' || o.piso === f.piso)
    .filter(o => {
      const e = f.estado ?? 'ativas';
      return e === 'all' ? true : e === 'ativas' ? isAtiva(o) : o.estado === e;
    })
    .filter(o => !f.categoria || f.categoria === 'all' || o.categoria === f.categoria)
    .filter(o => !f.prioridade || f.prioridade === 'all' || o.prioridade === f.prioridade)
    .filter(o => !q || norm([o.titulo, o.intervencao, o.zona, o.interlocutor, o.obs].filter(Boolean).join(' ')).includes(q))
    .sort((a, b) =>
      Number(isAtiva(b)) - Number(isAtiva(a))
      || prioridadeDef(b.prioridade).rank - prioridadeDef(a.prioridade).rank
      || a.data_ocorrencia.localeCompare(b.data_ocorrencia));
}

/** Interlocutores já usados, mais frequentes primeiro (sugestões ao registar). */
export function interlocutoresUsados(list: Ocorrencia[]): string[] {
  const n = new Map<string, number>();
  for (const o of list) if (o.interlocutor) n.set(o.interlocutor, (n.get(o.interlocutor) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export function zonasUsadas(list: Ocorrencia[], piso?: string): string[] {
  const n = new Map<string, number>();
  for (const o of list) if (o.zona && (!piso || o.piso === piso)) n.set(o.zona, (n.get(o.zona) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

export function historicoLabel(h: Pick<HistoricoItem, 'tipo' | 'de' | 'para'>): string {
  switch (h.tipo) {
    case 'criada': return 'Ocorrência registada';
    case 'estado': return `Estado: ${estadoDef((h.de ?? 'aberta') as Estado).label} → ${estadoDef((h.para ?? 'aberta') as Estado).label}`;
    case 'reporte':
      if (!h.de && h.para) return `Reportada a ${h.para}`;
      if (h.de && !h.para) return `Reporte removido (era ${h.de})`;
      return `Reportada a ${h.para} (antes: ${h.de})`;
  }
}

/* ── Datas e formulário ──────────────────────────────────────────────────────── */

/** Hoje, 'AAAA-MM-DD' (hora local). */
export const hojeIso = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'AAAA-MM-DD' → data em português; '—' se vazio. */
export const fmtDia = (iso: string | null): string =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-PT') : '—';

/* Campos do formulário (registo e edição). A posição na planta não se escreve: vem do clique. */
export interface OcorrenciaFormValues {
  titulo: string;
  intervencao: string;
  zona: string;
  categoria: Categoria;
  prioridade: Prioridade;
  data_ocorrencia: string;
  interlocutor: string;
  data_reporte: string;
  obs: string;
}

export const emptyForm = (): OcorrenciaFormValues => ({
  titulo: '', intervencao: '', zona: '', categoria: 'outro', prioridade: 'normal',
  data_ocorrencia: hojeIso(), interlocutor: '', data_reporte: '', obs: '',
});

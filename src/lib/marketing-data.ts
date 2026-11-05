import { supabase as typedClient } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { locaisDoPerfil } from '@/lib/locations';
import type { Categoria, Convidado, EstadoConvidado, EventoInput, MarketingEvento, Orcamento } from '@/lib/marketing';

/* ── Marketing — acesso a dados ────────────────────────────────────────────────
 * Tabelas (migração 20261104130000_marketing) ainda fora dos tipos gerados: cliente
 * sem tipos, respostas convertidas — mesmo padrão de instalacoes.ts.
 * Acesso: só administradores (RLS is_app_admin()).
 * ──────────────────────────────────────────────────────────────────────────── */
const supabase = typedClient as unknown as SupabaseClient;

const BUCKET = 'marketing';
export const FICHEIRO_MAX_BYTES = 5 * 1024 * 1024;

const fail = (msg: string, e: { message: string }) => new Error(`${msg}: ${e.message}`);

/* ── Categorias ─────────────────────────────────────────────────────────────── */

export async function listCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase.from('marketing_categorias').select('*').order('ordem').order('nome');
  if (error) throw fail('Não foi possível ler as categorias', error);
  return (data ?? []) as Categoria[];
}

export async function saveCategoria(c: Pick<Categoria, 'nome' | 'cor'> & { id?: string; ordem?: number }): Promise<Categoria> {
  const row = { nome: c.nome.trim(), cor: c.cor, ...(c.ordem != null ? { ordem: c.ordem } : {}) };
  const q = c.id
    ? supabase.from('marketing_categorias').update(row).eq('id', c.id)
    : supabase.from('marketing_categorias').insert(row);
  const { data, error } = await q.select().single();
  if (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('Já existe uma categoria com esse nome.');
    throw fail('Não foi possível guardar a categoria', error);
  }
  return data as Categoria;
}

export async function deleteCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_categorias').delete().eq('id', id);
  if (error) {
    // 23503 (foreign_key_violation) ou 23001 (restrict_violation), conforme a versão do Postgres.
    if (['23503', '23001'].includes((error as { code?: string }).code ?? '')) throw new Error('Há eventos nesta categoria: muda-os para outra antes de a apagar.');
    throw fail('Não foi possível apagar a categoria', error);
  }
}

/* ── Eventos ────────────────────────────────────────────────────────────────── */

export async function listEventos(): Promise<MarketingEvento[]> {
  const { data, error } = await supabase.from('marketing_eventos').select('*').order('inicio');
  if (error) throw fail('Não foi possível ler os eventos', error);
  return ((data ?? []) as MarketingEvento[]).map(e => ({ ...e, highlights: e.highlights ?? [] }));
}

const limpar = (v: string | null | undefined) => (v ?? '').trim() || null;

function linha(e: EventoInput) {
  return {
    titulo: e.titulo.trim(),
    categoria_id: e.categoria_id,
    inicio: e.inicio,
    fim: e.fim && e.fim !== e.inicio ? e.fim : null,
    hora: limpar(e.hora),
    local: limpar(e.local) ?? 'Aveiro',
    descricao: limpar(e.descricao),
    dress_code: limpar(e.dress_code),
    highlights: e.highlights,
    imagem_path: e.imagem_path,
  };
}

export async function createEvento(e: EventoInput): Promise<MarketingEvento> {
  const { data, error } = await supabase.from('marketing_eventos').insert(linha(e)).select().single();
  if (error) throw fail('Não foi possível criar o evento', error);
  return data as MarketingEvento;
}

export async function updateEvento(id: string, e: EventoInput): Promise<MarketingEvento> {
  const { data, error } = await supabase.from('marketing_eventos').update(linha(e)).eq('id', id).select().single();
  if (error) throw fail('Não foi possível guardar o evento', error);
  return data as MarketingEvento;
}

/* ── Orçamento (só quem edita: a RLS não o devolve aos outros) ─────────────── */

export async function listOrcamentos(): Promise<Record<string, Orcamento>> {
  const { data, error } = await supabase.from('marketing_orcamentos').select('evento_id, previsto, real');
  if (error) return {};
  const out: Record<string, Orcamento> = {};
  for (const r of (data ?? []) as (Orcamento & { evento_id: string })[]) out[r.evento_id] = { previsto: r.previsto, real: r.real };
  return out;
}

/** Grava o orçamento; sem valores nenhuns apaga a linha. */
export async function saveOrcamento(eventoId: string, o: Orcamento): Promise<void> {
  if (o.previsto == null && o.real == null) {
    const { error } = await supabase.from('marketing_orcamentos').delete().eq('evento_id', eventoId);
    if (error) throw fail('Não foi possível guardar o orçamento', error);
    return;
  }
  const { error } = await supabase.from('marketing_orcamentos').upsert({ evento_id: eventoId, previsto: o.previsto, real: o.real });
  if (error) throw fail('Não foi possível guardar o orçamento', error);
}

export async function deleteEvento(ev: Pick<MarketingEvento, 'id' | 'imagem_path'>): Promise<void> {
  /* A base apaga as linhas filhas em cascata, mas não os ficheiros do bucket. */
  const anexos = await listAnexos(ev.id);
  const paths = [...anexos.map(a => a.path), ...(ev.imagem_path ? [ev.imagem_path] : [])];
  const { error } = await supabase.from('marketing_eventos').delete().eq('id', ev.id);
  if (error) throw fail('Não foi possível apagar o evento', error);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}

/* ── Ficheiros ──────────────────────────────────────────────────────────────── */

const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;
const DOC_EXT = /\.(png|jpe?g|gif|webp|heic|heif|pdf|docx?|xlsx?|pptx?|txt|csv)$/i;
export const IMAGEM_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
export const DOC_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
export const MAX_MB = FICHEIRO_MAX_BYTES / 1024 / 1024;

function validar(f: Pick<File, 'name' | 'size'>, ext: RegExp): string | null {
  if (f.size === 0) return `“${f.name}” está vazio.`;
  if (f.size > FICHEIRO_MAX_BYTES) return `“${f.name}” excede ${MAX_MB} MB.`;
  if (!ext.test(f.name)) return `“${f.name}”: tipo de ficheiro não suportado.`;
  return null;
}
const CONVITE_EXT = /\.(png|jpe?g|webp|gif|pdf)$/i;
export const CONVITE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.pdf';
export const validarConvite = (f: Pick<File, 'name' | 'size'>) => validar(f, CONVITE_EXT);
export const validarImagem = (f: Pick<File, 'name' | 'size'>) => validar(f, IMG_EXT);
export const validarDocumento = (f: Pick<File, 'name' | 'size'>) => validar(f, DOC_EXT);

export function fmtTamanho(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Nome seguro para a chave no bucket (sem acentos nem caracteres especiais). */
export const nomeSeguro = (nome: string): string =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-100) || 'ficheiro';

async function carregar(path: string, file: File) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw fail(`Não foi possível carregar “${file.name}”`, error);
}

/** Carrega a imagem de capa e devolve a chave no bucket (a gravar em imagem_path). */
export async function uploadCapa(file: File): Promise<string> {
  const invalido = validarImagem(file);
  if (invalido) throw new Error(invalido);
  const path = `capas/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  await carregar(path, file);
  return path;
}

export async function removerFicheiro(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

/* URL assinados (1 h) guardados em memória até perto de expirar. */
const cacheUrl = new Map<string, { url: string; ate: number }>();
export async function urlFicheiro(path: string): Promise<string> {
  const hit = cacheUrl.get(path);
  if (hit && hit.ate > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error('Não foi possível abrir o ficheiro.');
  cacheUrl.set(path, { url: data.signedUrl, ate: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/* ── Anexos ─────────────────────────────────────────────────────────────────── */

/** Convites (para descarregar e enviar aos convidados) ou documentos (brochuras, programa…). */
export type CategoriaAnexo = 'documento' | 'convite';

export interface Anexo {
  id: string;
  evento_id: string;
  categoria: CategoriaAnexo;
  path: string;
  nome: string;
  tipo: string | null;
  tamanho: number | null;
  created_at: string;
}

export async function listAnexos(eventoId: string, categoria?: CategoriaAnexo): Promise<Anexo[]> {
  let q = supabase.from('marketing_anexos').select('*').eq('evento_id', eventoId);
  if (categoria) q = q.eq('categoria', categoria);
  const { data, error } = await q.order('created_at');
  if (error) return [];
  return (data ?? []) as Anexo[];
}

export async function uploadAnexo(eventoId: string, file: File, categoria: CategoriaAnexo = 'documento'): Promise<Anexo> {
  const invalido = validarDocumento(file);
  if (invalido) throw new Error(invalido);
  const path = `${eventoId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
  await carregar(path, file);
  const { data, error } = await supabase.from('marketing_anexos').insert({
    evento_id: eventoId, path, nome: file.name, tipo: file.type || null, tamanho: file.size, categoria,
  }).select().single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // sem ficheiros órfãos
    throw fail(`Não foi possível registar “${file.name}”`, error);
  }
  return data as Anexo;
}

export async function deleteAnexo(a: Pick<Anexo, 'id' | 'path'>): Promise<void> {
  const { error } = await supabase.from('marketing_anexos').delete().eq('id', a.id);
  if (error) throw fail('Não foi possível remover o anexo', error);
  await supabase.storage.from(BUCKET).remove([a.path]);
}

/** URL para descarregar o anexo com o nome original. */
export async function urlDownload(a: Pick<Anexo, 'path' | 'nome'>): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 300, { download: a.nome });
  if (error || !data) throw new Error('Não foi possível abrir o anexo.');
  return data.signedUrl;
}

/* ── Viaturas do evento ─────────────────────────────────────────────────────── */

export interface ViaturaEvento {
  id: string;
  evento_id: string;
  chassis: string | null;
  descricao: string;
  local: string | null;
  obs: string | null;
}

export async function listViaturasEvento(eventoId: string): Promise<ViaturaEvento[]> {
  const { data, error } = await supabase.from('marketing_viaturas').select('*').eq('evento_id', eventoId).order('created_at');
  if (error) return [];
  return (data ?? []) as ViaturaEvento[];
}

export async function addViaturaEvento(eventoId: string, v: { chassis?: string | null; descricao: string; local?: string | null; obs?: string | null }): Promise<ViaturaEvento> {
  const { data, error } = await supabase.from('marketing_viaturas').insert({
    evento_id: eventoId, chassis: v.chassis ?? null, descricao: v.descricao.trim(), local: limpar(v.local), obs: limpar(v.obs),
  }).select().single();
  if (error) throw fail('Não foi possível adicionar a viatura', error);
  return data as ViaturaEvento;
}

export async function deleteViaturaEvento(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_viaturas').delete().eq('id', id);
  if (error) throw fail('Não foi possível remover a viatura', error);
}

/** Viatura do parque (tabela partilhada `viaturas`), para escolher no evento. */
export interface ViaturaParque {
  chassis: string;
  matricula: string | null;
  modelo: string | null;
  versao: string | null;
  marca: string | null;
  local: string;
}

export const descreverViatura = (v: Pick<ViaturaParque, 'marca' | 'modelo' | 'versao' | 'matricula'>): string =>
  [[v.marca, v.modelo, v.versao].filter(Boolean).join(' '), v.matricula].filter(Boolean).join(' · ');

export async function listParque(): Promise<ViaturaParque[]> {
  const { data, error } = await supabase.from('viaturas').select('chassis, matricula, modelo, versao, marca, local').order('modelo');
  if (error) return [];
  return ((data ?? []) as (Omit<ViaturaParque, 'local'> & { local: unknown })[])
    .map(v => ({ ...v, local: locaisDoPerfil(v.local).join(', ') }));
}

/* ── Convidados ─────────────────────────────────────────────────────────────── */

export async function listConvidados(eventoId: string): Promise<Convidado[]> {
  const { data, error } = await supabase.from('marketing_convidados').select('*').eq('evento_id', eventoId).order('created_at');
  if (error) return [];
  return (data ?? []) as Convidado[];
}

/** Estados de todos os convidados (uma só consulta), para os totais nos cartões da linha do tempo. */
export async function listEstadosConvidados(): Promise<{ evento_id: string; estado: EstadoConvidado }[]> {
  const { data, error } = await supabase.from('marketing_convidados').select('evento_id, estado');
  if (error) return [];
  return (data ?? []) as { evento_id: string; estado: EstadoConvidado }[];
}

export async function addConvidado(eventoId: string, c: { vendedor_email: string; vendedor_nome: string | null; nome: string; contacto?: string | null; obs?: string | null }): Promise<Convidado> {
  const { data, error } = await supabase.from('marketing_convidados').insert({
    evento_id: eventoId, vendedor_email: c.vendedor_email, vendedor_nome: c.vendedor_nome,
    nome: c.nome.trim(), contacto: limpar(c.contacto), obs: limpar(c.obs),
  }).select().single();
  if (error) throw fail('Não foi possível adicionar o convidado', error);
  return data as Convidado;
}

export async function updateConvidado(id: string, patch: Partial<Pick<Convidado, 'estado' | 'nome' | 'contacto' | 'obs'>>): Promise<Convidado> {
  const { data, error } = await supabase.from('marketing_convidados').update(patch).eq('id', id).select().single();
  if (error) throw fail('Não foi possível guardar o convidado', error);
  return data as Convidado;
}

export async function deleteConvidado(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_convidados').delete().eq('id', id);
  if (error) throw fail('Não foi possível remover o convidado', error);
}

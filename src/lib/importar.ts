import { supabase } from '@/integrations/supabase/client';
import { toLocalIsoDay } from '@/lib/utils';
import { chassisKey, type FaturaRow } from '@/lib/faturas-report';
import { normEnc, chassisCompativeis } from '../../supabase/functions/_shared/matriculas-email';
import type { ControlRecord } from '@/types/data';

/* ── Importar a partir de imagem / ficheiro ───────────────────────────────────
 * Um print do "Mapas de Retail - Veículos Novos" (ou uma imagem/PDF de faturas) vai à edge
 * function `importar-extrair`, que devolve as linhas já lidas. Aqui cruzamos essas linhas com
 * os registos, calculamos o que mudaria e só gravamos depois de o utilizador confirmar —
 * com os mesmos campos que preencheria à mão no editor (estado, DMAT, 298, matrícula).
 * ──────────────────────────────────────────────────────────────────────────── */

export type TipoDocumento = 'mapa_retail' | 'faturas' | 'desconhecido';

export interface LinhaExtraida {
  enc?: string | null; chassis?: string | null; matricula?: string | null;
  dataPedidoMatricula?: string | null; dataMatricula?: string | null; data298?: string | null; dataEntrega?: string | null;
  dfat?: string | null; total?: number | null;
}
export interface Extraido { tipo: TipoDocumento; linhas: LinhaExtraida[]; incerto?: string[]; notas?: string | null }

/** Nomes das propriedades de cada linha (a edge function usa exatamente estes; há um teste). */
export const LINHA_KEYS = ['enc', 'chassis', 'matricula', 'dataPedidoMatricula', 'dataMatricula', 'data298', 'dataEntrega', 'dfat', 'total'] as const;

/** Estados em que um registo pode passar a Retail por este caminho. */
export const ESTADOS_ELEGIVEIS = ['Carteira', 'Matricula', 'Retail'];

/* ── Ficheiro ─────────────────────────────────────────────────────────────── */

export const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const TAMANHO_MAX = 6 * 1024 * 1024;
const ehFolha = (f: { name?: string; type: string }) => /\.(xlsx|xls|csv)$/i.test(f.name ?? '') || /spreadsheet|excel|csv/i.test(f.type);

export type FonteFicheiro = 'imagem' | 'folha';

/** Mensagem de erro, ou null se o ficheiro serve. Devolve também o tipo de fonte. */
export function validarFicheiro(f: { name?: string; type: string; size: number }): { erro: string | null; fonte: FonteFicheiro | null } {
  if (f.size === 0) return { erro: 'O ficheiro está vazio.', fonte: null };
  if (ehFolha(f)) return { erro: null, fonte: 'folha' };
  if (!TIPOS_IMAGEM.includes(f.type)) return { erro: 'Formato não suportado: usa uma imagem (PNG, JPEG, WebP), PDF ou Excel.', fonte: null };
  if (f.size > TAMANHO_MAX) return { erro: 'O ficheiro é demasiado grande (máximo 6 MB).', fonte: null };
  return { erro: null, fonte: 'imagem' };
}

const paraBase64 = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
  r.readAsDataURL(f);
});

export async function extrairDeImagem(file: File): Promise<Extraido> {
  const { erro, fonte } = validarFicheiro(file);
  if (erro || fonte !== 'imagem') throw new Error(erro ?? 'Formato não suportado.');
  const data = await paraBase64(file);
  const { data: res, error } = await supabase.functions.invoke('importar-extrair', { body: { media_type: file.type, data } });
  if (error) {
    let corpo: { error?: string; message?: string; detalhe?: string } | null = null;
    const ctx = (error as { context?: Response }).context;
    try { corpo = ctx && typeof ctx.json === 'function' ? await ctx.json() : null; } catch { /* ignora */ }
    if (corpo?.error === 'SEM_CHAVE') throw new Error('A leitura automática ainda não está configurada (falta a chave da API).');
    if (ctx?.status === 404) throw new Error('A leitura automática ainda não está publicada (falta publicar a função importar-extrair).');
    throw new Error([corpo?.message ?? corpo?.error ?? 'Não foi possível ler o documento.', corpo?.detalhe].filter(Boolean).join(' — '));
  }
  const r = (res as { resultado?: Extraido } | null)?.resultado;
  if (!r || !Array.isArray(r.linhas)) throw new Error('Não foi possível ler o documento.');
  return r;
}

/* ── Limpeza do que veio da leitura ───────────────────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Data válida AAAA-MM-DD (ignora hora se vier), senão null. */
export function dataIso(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim().slice(0, 10) : '';
  if (!ISO.test(t)) return null;
  const d = new Date(`${t}T00:00:00`);
  return isNaN(d.getTime()) || toLocalIsoDay(d) !== t ? null : t;
}
const texto = (v: unknown, max = 40) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, '').toUpperCase().slice(0, max) : '');

/** Matrícula portuguesa AA-00-AA (devolve null se não tiver o formato). */
export function matriculaValida(v: unknown): string | null {
  const t = texto(v).replace(/-/g, '');
  return /^([A-Z]{2}\d{2}[A-Z]{2}|\d{2}[A-Z]{2}\d{2}|[A-Z]{2}\d{4}|\d{4}[A-Z]{2})$/.test(t) ? `${t.slice(0, 2)}-${t.slice(2, 4)}-${t.slice(4, 6)}` : null;
}

interface LinhaLimpa { enc: string; chassis: string; mat: string | null; dmat: string | null; data298: string | null }
const limpaMapa = (l: LinhaExtraida): LinhaLimpa => ({
  enc: texto(l.enc), chassis: texto(l.chassis, 17), mat: matriculaValida(l.matricula),
  dmat: dataIso(l.dataMatricula), data298: dataIso(l.data298),
});

/* ── Mapa de Retail → alterações ──────────────────────────────────────────── */

export interface Mudanca { campo: string; de: string; para: string }
export interface AlteracaoMapa {
  id: string; enc: string; chas: string; cliente: string;
  patch: { status?: string; date298?: string; dmat?: string; mat?: string; chas?: string };
  campos: Mudanca[];
}
export interface PlanoMapa {
  alteracoes: AlteracaoMapa[];
  iguais: number;
  ignoradas: { ref: string; motivo: string }[];
}

const isoOf = (d: Date | null | undefined) => (d && !isNaN(d.getTime()) ? toLocalIsoDay(d) : null);
export const dia = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Cruza as linhas do mapa com os registos e calcula o que mudaria. Não grava nada.
 *  Regras: chassis (7 últimos) > encomenda; ambiguidade ou falta de correspondência = por tratar;
 *  o mapa manda nas datas (DMAT e 298); a matrícula só se preenche se estiver vazia. */
export function planearMapaRetail(records: ControlRecord[], linhas: LinhaExtraida[]): PlanoMapa {
  const plano: PlanoMapa = { alteracoes: [], iguais: 0, ignoradas: [] };
  const porChassis = new Map<string, ControlRecord[]>();
  const porEnc = new Map<string, ControlRecord[]>();
  for (const r of records) {
    if (!r.id) continue;
    const ck = chassisKey(r.chas); if (ck) porChassis.set(ck, [...(porChassis.get(ck) ?? []), r]);
    const ek = normEnc(r.enc); if (ek) porEnc.set(ek, [...(porEnc.get(ek) ?? []), r]);
  }
  const vistos = new Set<string>();

  for (const bruta of linhas) {
    const l = limpaMapa(bruta);
    const ref = l.chassis || l.enc || '(linha sem chassis nem encomenda)';
    if (!l.chassis && !l.enc) { plano.ignoradas.push({ ref, motivo: 'sem chassis nem encomenda' }); continue; }

    let hits = l.chassis && chassisKey(l.chassis) ? porChassis.get(chassisKey(l.chassis)) ?? [] : [];
    if (hits.length === 0 && l.enc) hits = porEnc.get(normEnc(l.enc)) ?? [];
    if (hits.length === 0) { plano.ignoradas.push({ ref, motivo: 'não encontrei esta viatura na plataforma' }); continue; }
    if (hits.length > 1) { plano.ignoradas.push({ ref, motivo: `há ${hits.length} registos possíveis; trata à mão` }); continue; }
    const r = hits[0];
    if (vistos.has(r.id!)) { plano.ignoradas.push({ ref, motivo: 'viatura repetida no mapa' }); continue; }
    vistos.add(r.id!);

    if (!ESTADOS_ELEGIVEIS.includes(r.status)) { plano.ignoradas.push({ ref, motivo: `o registo está em «${r.status}»; só passo Carteira/Matrícula a Retail` }); continue; }
    if (!l.data298) { plano.ignoradas.push({ ref, motivo: 'o mapa não traz Data de 298 (ainda não é retail)' }); continue; }

    const patch: AlteracaoMapa['patch'] = {};
    const campos: Mudanca[] = [];
    if (r.status !== 'Retail') { patch.status = 'Retail'; campos.push({ campo: 'Estado', de: r.status || '—', para: 'Retail' }); }
    const d298 = isoOf(r.date298);
    if (l.data298 !== d298) { patch.date298 = l.data298; campos.push({ campo: '298', de: dia(d298), para: dia(l.data298) }); }
    const dm = isoOf(r.dmat);
    if (l.dmat && l.dmat !== dm) { patch.dmat = l.dmat; campos.push({ campo: 'DMAT', de: dia(dm), para: dia(l.dmat) }); }
    if (l.mat) {
      if (!(r.mat ?? '').trim()) { patch.mat = l.mat; campos.push({ campo: 'Matrícula', de: '—', para: l.mat }); }
      else if (r.mat.replace(/[\s-]/g, '').toUpperCase() !== l.mat.replace(/-/g, '')) {
        plano.ignoradas.push({ ref, motivo: `já tem matrícula (${r.mat}); o mapa diz ${l.mat} — não alterei` });
      }
    }
    if (l.chassis.length === 17 && (r.chas ?? '').length < 17 && chassisCompativeis(r.chas, l.chassis)) {
      patch.chas = l.chassis; campos.push({ campo: 'Chassis', de: r.chas || '—', para: l.chassis });
    }
    if (campos.length === 0) { plano.iguais++; continue; }
    plano.alteracoes.push({ id: r.id!, enc: r.enc, chas: r.chas, cliente: r.cliente, patch, campos });
  }
  return plano;
}

/** Grava as alterações confirmadas (só registos ainda em Carteira/Matrícula/Retail). */
export async function aplicarMapaRetail(alteracoes: AlteracaoMapa[]): Promise<{ aplicadas: number; falhadas: string[] }> {
  let aplicadas = 0;
  const falhadas: string[] = [];
  for (const a of alteracoes) {
    const { data, error } = await supabase.from('control_records').update(a.patch).eq('id', a.id).in('status', ESTADOS_ELEGIVEIS).select('id');
    if (error) falhadas.push(`${a.enc || a.chas}: ${error.message}`);
    else if (!data || data.length === 0) falhadas.push(`${a.enc || a.chas}: o registo mudou entretanto`);
    else aplicadas++;
  }
  return { aplicadas, falhadas };
}

/* ── Faturas lidas de imagem → o mesmo plano do relatório Excel ───────────── */

export function linhasParaFaturas(linhas: LinhaExtraida[]): FaturaRow[] {
  const out: FaturaRow[] = [];
  for (const l of linhas) {
    const vin = texto(l.chassis, 17);
    if (!chassisKey(vin)) continue;
    const total = typeof l.total === 'number' && Number.isFinite(l.total) ? l.total : null;
    out.push({ vin, dfat: dataIso(l.dfat), dmat: dataIso(l.dataMatricula), total, estado: '' });
  }
  return out;
}

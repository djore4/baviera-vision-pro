import { supabase } from '@/integrations/supabase/client';

/* ── Ficha de Margem: preencher a partir de um contrato (PDF) ou imagem ───────
 * O ficheiro vai à edge function `ficha-extrair`, que o lê e devolve só valores
 * económicos e o número do contrato (nunca dados pessoais; o servidor não guarda nada).
 * Cada leitura custa créditos, por isso o resultado fica em cache NO BROWSER de quem a fez
 * (chave = hash do ficheiro, só valores económicos, 7 dias): reabrir o mesmo contrato não
 * volta a gastar nada, e um duplo clique reaproveita o pedido em curso.
 * A página NUNCA aplica sem mostrar: cada campo preenchido fica destacado, e os
 * que o modelo marcou como incertos ficam a laranja para revisão.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Chaves da ficha = nomes do estado de FichaMargemPage = propriedades do esquema da
 * edge function (um teste garante que batem). O "APOIO" genérico (descrição + valor) e o TIPO
 * de cliente (Particular/Frotista) NÃO se preenchem a partir do documento: ficam sempre
 * em branco para o utilizador. */
export const TEXTO_KEYS = ['docNum', 'modelo', 'encChass', 'matricula'] as const;
export const NUMERO_KEYS = [
  'pvb', 'opc', 'bsi', 'eco', 'legTr', 'isv', 'recond', 'ofertas', 'precoVenda',
  'ivaPct', 'mgFixaPct', 'mgVarPct', 'pacPct', 'apoioFrotaPct', 'apoioDemoPct', 'deprec', 'bonusMPct',
] as const;
export const ENUM_OPCOES = {
  docTipo: ['Proposta', 'Contrato'],
  natureza: ['VN', 'VD'],
  pagamento: ['BMW FS', 'Financiamento Interno', 'Financiamento Externo', 'Pronto Pagamento'],
} as const;
export const FICHA_KEYS = [
  'docTipo', 'natureza', 'pagamento', 'dataMatricula',
  ...TEXTO_KEYS, ...NUMERO_KEYS,
] as const;
export type FichaKey = (typeof FICHA_KEYS)[number];

/* O que a edge function devolve (campos soltos, qualquer um pode faltar ou ser null). */
export type CamposExtraidos = Partial<Record<FichaKey, string | number | null>> & { incerto?: string[]; notas?: string | null };

export interface Aplicacao {
  /** Valores a pôr na ficha, já no formato dos inputs (texto, ponto decimal). */
  valores: Partial<Record<FichaKey, string>>;
  /** Campos preenchidos que o modelo não tem certeza de ter lido bem. */
  incertos: FichaKey[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';

/* Converte o que veio da leitura em valores para os inputs, descartando tudo o que
 * não for válido (números absurdos, opções desconhecidas, datas mal formadas). */
export function paraFicha(c: CamposExtraidos): Aplicacao {
  const valores: Partial<Record<FichaKey, string>> = {};

  for (const k of TEXTO_KEYS) {
    const v = c[k];
    if (nonEmpty(v)) valores[k] = v.trim().slice(0, 120);
  }
  for (const k of NUMERO_KEYS) {
    const v = c[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9) valores[k] = String(Math.round(v * 100) / 100);
  }
  for (const [k, opcoes] of Object.entries(ENUM_OPCOES) as [keyof typeof ENUM_OPCOES, readonly string[]][]) {
    const v = c[k];
    if (typeof v === 'string' && opcoes.includes(v)) valores[k] = v;
  }
  if (nonEmpty(c.dataMatricula) && ISO.test(c.dataMatricula.trim()) && !isNaN(new Date(c.dataMatricula).getTime())) {
    valores.dataMatricula = c.dataMatricula.trim();
  }
  // Percentagens fora de 0–100 não fazem sentido numa ficha.
  for (const k of ['ivaPct', 'mgFixaPct', 'mgVarPct', 'pacPct', 'apoioFrotaPct', 'apoioDemoPct', 'bonusMPct'] as const) {
    if (valores[k] !== undefined && Number(valores[k]) > 100) delete valores[k];
  }
  // Matrícula e data só fazem sentido numa viatura usada.
  if (valores.natureza === 'VD' || valores.matricula || valores.dataMatricula) {
    if (!valores.natureza) valores.natureza = 'VD';
  }

  const incertos = (Array.isArray(c.incerto) ? c.incerto : [])
    .filter((k): k is FichaKey => (FICHA_KEYS as readonly string[]).includes(k) && valores[k as FichaKey] !== undefined);
  return { valores, incertos: [...new Set(incertos)] };
}

/* ── Envio ────────────────────────────────────────────────────────────────── */

export const TIPOS_ACEITES = ['application/pdf', 'image/png', 'image/jpeg'];
export const TAMANHO_MAX = 6 * 1024 * 1024;

export function validarFicheiro(f: { type: string; size: number }): string | null {
  if (!TIPOS_ACEITES.includes(f.type)) return 'Formato não suportado: usa PDF, PNG ou JPEG.';
  if (f.size > TAMANHO_MAX) return 'O ficheiro é demasiado grande (máximo 6 MB).';
  if (f.size === 0) return 'O ficheiro está vazio.';
  return null;
}

const paraBase64 = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
  r.onerror = () => reject(new Error('Não foi possível ler o ficheiro.'));
  r.readAsDataURL(f);
});

/* ── Cache local (poupa créditos) ─────────────────────────────────────────── */

const CACHE_PREFIX = 'ficha-extrair:';
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CACHE_MAX = 20;

/** SHA-256 em hexadecimal; null se o browser não tiver `crypto.subtle` (então não há cache). */
export async function hashTexto(texto: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

export function lerCache(hash: string, agora = Date.now()): CamposExtraidos | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + hash);
    if (!raw) return null;
    const { t, campos } = JSON.parse(raw) as { t: number; campos: CamposExtraidos };
    if (typeof t !== 'number' || agora - t > CACHE_TTL_MS || !campos || typeof campos !== 'object') {
      localStorage.removeItem(CACHE_PREFIX + hash);
      return null;
    }
    return campos;
  } catch { return null; }
}

export function gravarCache(hash: string, campos: CamposExtraidos, agora = Date.now()): void {
  try {
    localStorage.setItem(CACHE_PREFIX + hash, JSON.stringify({ t: agora, campos }));
    // Mantém só as CACHE_MAX leituras mais recentes.
    const todas: { k: string; t: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(CACHE_PREFIX)) continue;
      try { todas.push({ k, t: (JSON.parse(localStorage.getItem(k) ?? '{}') as { t?: number }).t ?? 0 }); } catch { todas.push({ k, t: 0 }); }
    }
    todas.sort((a, b) => b.t - a.t).slice(CACHE_MAX).forEach(e => localStorage.removeItem(e.k));
  } catch { /* sem localStorage: segue sem cache */ }
}

const emCurso = new Map<string, Promise<CamposExtraidos>>();

export async function extrairFicha(file: File): Promise<CamposExtraidos> {
  const erro = validarFicheiro(file);
  if (erro) throw new Error(erro);
  const data = await paraBase64(file);

  const hash = await hashTexto(`${file.type}:${data}`);
  if (!hash) return lerNoServidor(file, data);
  const guardado = lerCache(hash);
  if (guardado) return guardado;
  let pedido = emCurso.get(hash);
  if (!pedido) {
    pedido = lerNoServidor(file, data)
      .then(campos => { gravarCache(hash, campos); return campos; })
      .finally(() => emCurso.delete(hash));
    emCurso.set(hash, pedido);
  }
  return pedido;
}

async function lerNoServidor(file: File, data: string): Promise<CamposExtraidos> {
  const { data: res, error } = await supabase.functions.invoke('ficha-extrair', { body: { media_type: file.type, data } });
  if (error) {
    let corpo: { error?: string; message?: string; detalhe?: string } | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      corpo = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
    } catch { /* ignora */ }
    if (corpo?.error === 'SEM_CHAVE') throw new Error('A leitura automática ainda não está configurada (falta a chave da API).');
    if ((error as { context?: Response }).context?.status === 404) throw new Error('A leitura automática ainda não está publicada.');
    throw new Error([corpo?.message ?? corpo?.error ?? 'Não foi possível ler o documento.', corpo?.detalhe].filter(Boolean).join(' — '));
  }
  const campos = (res as { campos?: CamposExtraidos } | null)?.campos;
  if (!campos) throw new Error('Não foi possível ler o documento.');
  return campos;
}

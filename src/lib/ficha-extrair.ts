import { supabase } from '@/integrations/supabase/client';

/* ── Ficha de Margem: preencher a partir de um contrato (PDF) ou imagem ───────
 * O ficheiro vai à edge function `ficha-extrair`, que o lê e devolve só valores
 * económicos e o número do contrato (nunca dados pessoais; nada fica guardado).
 * A página NUNCA aplica sem mostrar: cada campo preenchido fica destacado, e os
 * que o modelo marcou como incertos ficam a laranja para revisão.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Chaves da ficha = nomes do estado de FichaMargemPage = propriedades do esquema da
 * edge function (um teste garante que batem). */
export const TEXTO_KEYS = ['docNum', 'modelo', 'encChass', 'matricula', 'apoioLabel'] as const;
export const NUMERO_KEYS = [
  'pvb', 'opc', 'bsi', 'eco', 'legTr', 'isv', 'recond', 'ofertas', 'precoVenda',
  'ivaPct', 'mgFixaPct', 'mgVarPct', 'pacPct', 'apoioFrotaPct', 'apoioDemoPct', 'deprec', 'bonusMPct', 'apoioValor',
] as const;
export const ENUM_OPCOES = {
  docTipo: ['Proposta', 'Contrato'],
  natureza: ['VN', 'VD'],
  pagamento: ['BMW FS', 'Financiamento Interno', 'Financiamento Externo', 'Pronto Pagamento'],
  tipoCliente: ['Particular', 'Empresa'],
} as const;
export const FICHA_KEYS = [
  'docTipo', 'natureza', 'pagamento', 'tipoCliente', 'dataMatricula',
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

export async function extrairFicha(file: File): Promise<CamposExtraidos> {
  const erro = validarFicheiro(file);
  if (erro) throw new Error(erro);
  const data = await paraBase64(file);

  const { data: res, error } = await supabase.functions.invoke('ficha-extrair', { body: { media_type: file.type, data } });
  if (error) {
    let corpo: { error?: string; message?: string } | null = null;
    try {
      const ctx = (error as { context?: Response }).context;
      corpo = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
    } catch { /* ignora */ }
    if (corpo?.error === 'SEM_CHAVE') throw new Error('A leitura automática ainda não está configurada (falta a chave da API).');
    if ((error as { context?: Response }).context?.status === 404) throw new Error('A leitura automática ainda não está publicada.');
    throw new Error(corpo?.message ?? corpo?.error ?? 'Não foi possível ler o documento.');
  }
  const campos = (res as { campos?: CamposExtraidos } | null)?.campos;
  if (!campos) throw new Error('Não foi possível ler o documento.');
  return campos;
}

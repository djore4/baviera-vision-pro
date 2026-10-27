import { createClient } from '@supabase/supabase-js';

/* ── Produto (Transversal) — dados técnicos e opcionais BMW ───────────────────
 * Catálogo de produto partilhado com a plataforma Caetano. Vive num projeto
 * Supabase próprio (não o desta plataforma), de leitura pública: a chave é a anon
 * (pública por design) e o cliente não guarda sessão. Pode ser substituído por
 * VITE_PRODUTO_SUPABASE_URL / VITE_PRODUTO_SUPABASE_KEY.
 * ──────────────────────────────────────────────────────────────────────────── */

const PRODUTO_URL = import.meta.env.VITE_PRODUTO_SUPABASE_URL || 'https://lhznwlfovoifvoxruqcj.supabase.co';
const PRODUTO_KEY = import.meta.env.VITE_PRODUTO_SUPABASE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxoem53bGZvdm9pZnZveHJ1cWNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTkzMDQsImV4cCI6MjA5MjQ5NTMwNH0.3rJYpsuFic-2Hd88ce-8f5DCZgwM5zCfYKt_gKOzhio';

let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) {
    _db = createClient(PRODUTO_URL, PRODUTO_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return _db;
}

/* ── Tipos ────────────────────────────────────────────────────────────────── */

export interface Modelo { id: string; codigo: string; nome: string }
export interface Motorizacao { id: string; codigo: string; nome_visual: string | null }
export type Specs = Record<string, string>;

export interface OpMotorizacao { id: string; nome: string }
export type OpTipo = 'serie' | 'opcional' | string | null;
export interface Opcional {
  id: string;
  codigo: string;
  nome: string;
  preco_iva: number | null;
  preco_siva: number | null;
  descricao: string | null;
  regras: string | null;
  secao: string;
  tipo: OpTipo;
}
export interface Disponibilidade { tipo: OpTipo; motorizacao: string }

/* ── Séries ───────────────────────────────────────────────────────────────── */

export const MAX_COMPARAR = 4;
export const SERIES_ORDEM = ['1', '2', '3', '4', '5', '7', 'X', 'Z', 'Outros'] as const;

const SERIES: { label: string; match: (n: string) => boolean }[] = [
  { label: '1', match: n => /série 1|series 1|\bm135\b|\bm140\b/i.test(n) },
  { label: '2', match: n => /série 2|series 2|\bm2\b/i.test(n) },
  { label: '3', match: n => /série 3|series 3|\bm3\b/i.test(n) },
  { label: '4', match: n => /série 4|series 4|\bm4\b|\bi4\b/i.test(n) },
  { label: '5', match: n => /série 5|series 5|\bm5\b/i.test(n) },
  { label: '7', match: n => /série 7|series 7/i.test(n) },
  { label: 'X', match: n => /\bx1\b|\bx2\b|\bx3\b|\bx4\b|\bx5\b|\bx6\b|\bx7\b|\bxm\b|\bix\b|\bix3\b|\bix1\b|\bix2\b/i.test(n) },
  { label: 'Z', match: n => /\bz4\b/i.test(n) },
];

export function getSerie(nome: string): string {
  return SERIES.find(s => s.match(nome))?.label ?? 'Outros';
}

/* Séries presentes numa lista de modelos, pela ordem de apresentação. */
export function seriesPresentes(modelos: Modelo[]): string[] {
  const p = new Set(modelos.map(m => getSerie(m.nome)));
  return SERIES_ORDEM.filter(s => p.has(s));
}

export function modelosDaSerie(modelos: Modelo[], serie: string): Modelo[] {
  return serie === 'Todos' ? modelos : modelos.filter(m => getSerie(m.nome) === serie);
}

export function pesquisarModelos(modelos: Modelo[], q: string): Modelo[] {
  const t = q.toLowerCase().trim();
  return modelos.filter(m => m.nome.toLowerCase().includes(t) || m.codigo.toLowerCase().includes(t));
}

/* ── Opcionais: regras de apresentação ────────────────────────────────────── */

/* Colunas da folha de preços que não são motorizações. */
export function motorizacaoValida(nome: string): boolean {
  return !nome.includes('Recomendado') && !nome.includes('IVA') && !nome.includes('PVP') && nome.trim() !== '';
}

/* Secções ordenadas pelo número com que começam ("1.2 Exterior" antes de "10 ..."). */
export function ordenarSecoes(opcionais: Opcional[]): string[] {
  const raw = [...new Set(opcionais.map(o => o.secao).filter(Boolean))];
  const num = (s: string) => parseFloat(s.match(/^[\d.]+/)?.[0] || '999');
  return raw.sort((a, b) => num(a) - num(b));
}

/* Chaves das especificações, pela ordem em que aparecem nas motorizações escolhidas. */
export function chavesSpecs(ids: string[], cache: Record<string, Specs>): string[] {
  const chaves: string[] = [];
  for (const id of ids) {
    for (const k of Object.keys(cache[id] ?? {})) if (!chaves.includes(k)) chaves.push(k);
  }
  return chaves;
}

export const fmtEuro = (n: number) => `${Number(n).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`;

/* ── Acesso a dados ───────────────────────────────────────────────────────── */

export async function listModelos(): Promise<Modelo[]> {
  const { data, error } = await db().from('modelos').select('id, codigo, nome').order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Modelo[];
}

export async function listMotorizacoes(modeloId: string): Promise<Motorizacao[]> {
  const { data, error } = await db().from('motorizacoes').select('id, codigo, nome_visual')
    .eq('modelo_id', modeloId).order('codigo');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Motorizacao[];
}

export async function getSpecs(motorizacaoId: string): Promise<Specs> {
  const { data, error } = await db().from('especificacoes').select('chave, valor').eq('motorizacao_id', motorizacaoId);
  if (error) throw new Error(error.message);
  const out: Specs = {};
  for (const r of (data ?? []) as unknown as { chave: string; valor: string }[]) out[r.chave] = r.valor;
  return out;
}

export async function listOpModelos(): Promise<Modelo[]> {
  const { data, error } = await db().from('op_modelos').select('id, codigo, nome').order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Modelo[];
}

export async function listOpMotorizacoes(modeloId: string): Promise<OpMotorizacao[]> {
  const { data, error } = await db().from('op_motorizacoes').select('id, nome')
    .eq('modelo_id', modeloId).order('col_index');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OpMotorizacao[]).filter(m => motorizacaoValida(m.nome));
}

interface OpRow {
  tipo: OpTipo;
  op_opcionais: (Omit<Opcional, 'secao' | 'tipo'> & { op_secoes: { nome: string } | null }) | null;
}

/* Opcionais de uma motorização (a API devolve no máximo 1000 linhas por pedido). */
export async function listOpcionais(motorizacaoId: string): Promise<Opcional[]> {
  const rows: OpRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('op_disponibilidade')
      .select('tipo,op_opcionais(id,codigo,nome,preco_iva,preco_siva,descricao,regras,op_secoes(nome))')
      .eq('motorizacao_id', motorizacaoId).range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as OpRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows
    .filter(r => r.op_opcionais)
    .map(r => {
      const { op_secoes, ...o } = r.op_opcionais!;
      return { ...o, secao: op_secoes?.nome || 'Outros', tipo: r.tipo };
    });
}

/* Em que motorizações um opcional é de série / opcional / não disponível. */
export async function listDisponibilidade(opcionalId: string): Promise<Disponibilidade[]> {
  const { data, error } = await db().from('op_disponibilidade')
    .select('tipo,op_motorizacoes(nome)').eq('opcional_id', opcionalId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { tipo: OpTipo; op_motorizacoes: { nome: string } | null }[])
    .map(d => ({ tipo: d.tipo, motorizacao: d.op_motorizacoes?.nome || '' }));
}

/* ── Comparador ───────────────────────────────────────────────────────────────
 * Compara até 4 motorizações de QUALQUER modelo. As linhas "principais" são as
 * que interessam numa conversa de venda; as chaves da base de dados variam de
 * modelo para modelo (e de ano para ano), por isso cada linha aceita várias.
 * Tudo o resto que exista nas motorizações escolhidas fica em "Outras
 * especificações", para nunca se perder informação por falta de mapeamento.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LinhaComparador { label: string; keys: string[] }

export const LINHAS_COMPARADOR: LinhaComparador[] = [
  { label: 'Código Modelo', keys: ['Código Modelo'] },
  { label: 'Potência (cv)', keys: ['Potência combinada comunicada, cv', 'Potência do sistema motor (acumulado), cv', 'Potência do sistema motor (acumulado) 30 min, cv'] },
  { label: '0-100 km/h (seg)', keys: ['0-100 km/h, seg.', '0-100Km/h, seg.', '0-100 km/h (arranque 1-ft), s'] },
  { label: 'Velocidade Máxima (km/h)', keys: ['Velocidade máxima, km/h', 'Velocidade máxima em modo puramente elétrico, km/h', 'Velocidade Máxima'] },
  { label: 'Tração', keys: ['Tração', 'Tracção'] },
  { label: 'Autonomia WLTP (km)', keys: ['Alcance/Autonomia (WLTP), km', 'Alcance (WLTP), km', 'Autonomia (km)', 'Autonomia WLTP (km)'] },
  { label: 'Consumo (kWh/100km)', keys: ['Consumo combinado de energia (WLTP), kWh/100 km', 'Consumo de energia combinado (WLTP), kWh/100 km', 'Consumo (kWh/100km)'] },
  { label: 'Bateria líquida (kWh)', keys: ['Capacidade líquida da bateria de alta tensão, kWh'] },
  { label: 'Bateria bruta (kWh)', keys: ['Bateria de Alta Tensão - Capacidade energética (bruta), kWh'] },
  { label: 'Carga DC máx (kW)', keys: ['Potência máxima de carregamento DC, kW', 'Capacidade maxima de carga DC, kW'] },
  { label: 'Carga AC série (kW)', keys: ['Capacidade maxima de carga AC standard, kW'] },
  { label: 'Carga AC opcional (kW)', keys: ['Capacidade maxima de carga AC alta, kW', 'Capacidade maxima de carga AC alta (opcional), kW'] },
];

export interface SlotComparador { modelo: Modelo; mot: Motorizacao; specs: Specs }
export interface LinhaValores { label: string; valores: string[]; difere: boolean }

const vazio = (v: string | null | undefined) => v === null || v === undefined || v === '';

export function valorLinha(specs: Specs, keys: string[]): string {
  for (const k of keys) if (!vazio(specs[k])) return specs[k];
  return '—';
}

/* Variações de carregamento (AC/DC 1..4) que existam nas motorizações escolhidas. */
function linhasCarregamento(specs: Specs[]): LinhaComparador[] {
  const out: LinhaComparador[] = [];
  for (const [tipo, intervalo] of [['AC', '0-100%'], ['DC', '10-80%']] as const) {
    for (const n of [1, 2, 3, 4]) {
      const desc = specs.map(s => s[`Variação de carregamento ${tipo} ${n}`]).find(d => !vazio(d));
      if (!desc) continue;
      const nome = desc.replace(`${tipo} charging with `, `${tipo} `).replace(/\(.*\)/, '').replace(/EVSE limitation/, '').trim();
      out.push({ label: `${intervalo} ${nome}`, keys: [`Tempo de carregamento ${tipo} ${n} (${intervalo}), h`] });
    }
  }
  return out;
}

const linha = (l: LinhaComparador, specs: Specs[]): LinhaValores => {
  const valores = specs.map(s => valorLinha(s, l.keys));
  return { label: l.label, valores, difere: !valores.every(v => v === valores[0]) };
};

/* Linhas principais com algum valor + carregamento. Linhas sem nenhum valor
 * (ex.: bateria num modelo a combustão) não aparecem. */
export function linhasPrincipais(specs: Specs[]): LinhaValores[] {
  return [...LINHAS_COMPARADOR, ...linhasCarregamento(specs)]
    .map(l => linha(l, specs))
    .filter(l => l.valores.some(v => v !== '—'));
}

/* Tudo o que não está coberto pelas linhas principais, pela ordem de aparição. */
export function linhasOutras(specs: Specs[]): LinhaValores[] {
  const usadas = new Set([...LINHAS_COMPARADOR, ...linhasCarregamento(specs)].flatMap(l => l.keys));
  const chaves: string[] = [];
  for (const s of specs) for (const k of Object.keys(s)) if (!usadas.has(k) && !chaves.includes(k)) chaves.push(k);
  return chaves
    .map(k => linha({ label: k, keys: [k] }, specs))
    .filter(l => l.valores.some(v => v !== '—'));
}

/* ── Calculadora de carregamento ──────────────────────────────────────────── */

export interface CalcInputs {
  bateria: number;   // kWh
  potencia: number;  // kW
  socIni: number;    // %
  socFin: number;    // %
  precoKwh: number;  // €
  km: number;
  consumo: number;   // kWh/100 km
}

export const CALC_DEFAULTS: CalcInputs = { bateria: 75, potencia: 11, socIni: 10, socFin: 100, precoKwh: 0.15, km: 100, consumo: 20 };

export interface CalcResult {
  valido: boolean;
  horas: number;
  energia: number;        // kWh a carregar
  custoCarga: number;
  custoPor100km: number;
  energiaViagem: number;
  custoViagem: number;
}

export function calcular(i: CalcInputs): CalcResult {
  const energiaViagem = (i.consumo / 100) * i.km;
  const viagem = { energiaViagem, custoViagem: energiaViagem * i.precoKwh };
  if (i.socFin <= i.socIni) return { valido: false, horas: 0, energia: 0, custoCarga: 0, custoPor100km: 0, ...viagem };
  const energia = i.bateria * (i.socFin - i.socIni) / 100;
  const custoCarga = energia * i.precoKwh;
  const autonomia = (i.bateria / i.consumo) * 100;
  return {
    valido: true,
    horas: energia / i.potencia,
    energia,
    custoCarga,
    custoPor100km: autonomia > 0 ? (custoCarga / autonomia) * 100 : 0,
    ...viagem,
  };
}

export function formatarTempo(horas: number): string {
  if (isNaN(horas) || horas <= 0) return '—';
  const h = Math.floor(horas);
  const m = Math.round((horas - h) * 60);
  if (m === 60) return `${h + 1}h`;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

export const fmtNum = (n: number, dec = 2) =>
  n.toLocaleString('pt-PT', { minimumFractionDigits: dec, maximumFractionDigits: dec });

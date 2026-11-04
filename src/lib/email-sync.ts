/**
 * Sincronização com o email (VN): lê o que a secretaria comercial envia e atualiza
 * os registos de control_records.
 *
 * Duas fontes, as duas só de leitura no email:
 *  1. "Matriculas - Aveiro" (diário): tabela com encomenda, chassis, matrícula e data
 *     de matrícula  → preenche MAT, CHAS e DMAT.
 *  2. "Pedido de matrícula | cliente": o pedido de um consultor SÓ conta depois de a
 *     secretaria responder "matrícula pedida" na mesma conversa → Carteira passa a
 *     Matricula, com a data dessa resposta em DMAT.
 *
 * Tudo aqui é puro (sem rede nem base de dados): o email chega já lido pela edge
 * function `email-sync`, e o resultado é um PLANO de alterações que o administrador
 * vê e confirma antes de se gravar. Nada sobrescreve em silêncio um valor diferente:
 * os desencontros ficam em `issues`.
 */
import { formatMatricula, matriculaCompacta } from '@/lib/viaturaFormat';

/* ───────────────────────── Tipos ───────────────────────── */

/** Linha da tabela do email "Matriculas - Aveiro". */
export interface PlateRow {
  enc: string;
  chas: string;
  modelo: string;
  /** Matrícula já formatada (AA-00-BB). */
  mat: string;
  /** Data da matrícula, AAAA-MM-DD. */
  dmat: string;
  /** Texto da coluna seguinte: nome do cliente ou "DEMO". */
  nota: string;
  /** Iniciais do vendedor (última coluna), quando existem. */
  resp: string;
  /** Receção do email (ISO), para escolher a mais recente quando há repetidas. */
  recebido: string;
}

/** Mensagem da conversa "Pedido de matrícula" (como vem da edge function). */
export interface PedidoMsg {
  id: string;
  conversationId: string;
  subject: string;
  /** Endereço de quem enviou, em minúsculas. */
  from: string;
  /** Envio (ISO, UTC). */
  sentAt: string;
  /** Texto SÓ desta mensagem (sem o histórico citado). */
  text: string;
}

export interface PedidoCampos {
  cliente: string;
  enc: string;
  chas: string;
  biz: string;
}

/** Pedido já confirmado pela secretaria ("matrícula pedida"). */
export interface PedidoConfirmado extends PedidoCampos {
  /** Dia (AAAA-MM-DD, hora de Lisboa) da resposta que confirma. */
  confirmadoEm: string;
  conversationId: string;
}

/** O mínimo de um registo de control_records de que o plano precisa. */
export interface SyncRecord {
  id: string;
  status: string;
  enc: string;
  chas: string;
  mat: string;
  biz: string;
  cliente: string;
  /** AAAA-MM-DD ou null. */
  dmat: string | null;
}

export interface SyncPatch {
  status?: string;
  mat?: string;
  chas?: string;
  dmat?: string;
}

export interface PlannedChange {
  recordId: string;
  enc: string;
  cliente: string;
  origem: ('matriculas' | 'pedido')[];
  /** Estado de partida (para mostrar e para proteger contra edições entretanto). */
  antes: { status: string; mat: string; chas: string; dmat: string | null };
  patch: SyncPatch;
}

export type IssueKind = 'sem_registo' | 'ambiguo' | 'conflito' | 'estado';

export interface SyncIssue {
  kind: IssueKind;
  origem: 'matriculas' | 'pedido';
  /** Encomenda / chassis / Bizagi tal como veio no email. */
  ref: string;
  detalhe: string;
}

export interface SyncPlan {
  changes: PlannedChange[];
  issues: SyncIssue[];
  /** Quantos itens do email já estavam refletidos nos registos (nada a fazer). */
  jaAtualizados: number;
}

/* ───────────────────────── Normalização ───────────────────────── */

const clean = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Encomenda para comparar: numéricas perdem os zeros à esquerda (o email traz
 * "0230244" e os registos "230244", ou ao contrário); alfanuméricas ficam em maiúsculas.
 */
export function normEnc(s: string | null | undefined): string {
  const t = clean(s).toUpperCase().replace(/\s/g, '');
  return /^\d+$/.test(t) ? t.replace(/^0+/, '') : t;
}

const normChas = (s: string | null | undefined) => clean(s).toUpperCase().replace(/\s/g, '');

/** Chassis compatíveis: iguais, ou um é o final do outro (os pedidos trazem só os últimos 7). */
export function chassisCompativeis(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normChas(a), y = normChas(b);
  if (x.length < 6 || y.length < 6) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/** 'dd/mm/aaaa' → 'AAAA-MM-DD' (valida o calendário); null se inválida. */
export function dataPt(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(s));
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Dia civil em Lisboa (AAAA-MM-DD) de um instante ISO. Independente do fuso da máquina. */
export function diaLisboa(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/* ───────────────────────── 1. Email "Matriculas - Aveiro" ───────────────────────── */

const RE_ENC = /^\d{4,9}$/;
const RE_VIN = /^[A-HJ-NPR-Z0-9]{17}$/;
const RE_PLATE = /^[A-Z0-9]{2}[\s-]?[A-Z0-9]{2}[\s-]?[A-Z0-9]{2}$/;

/**
 * Lê a tabela do email diário. Reconhece as linhas pela FORMA (encomenda numérica,
 * chassis de 17 caracteres, matrícula, data) e não pela posição na página, por isso
 * tolera tabelas dentro de tabelas, linhas de cabeçalho e assinaturas. A 6.ª coluna
 * (cliente ou "DEMO") e a 7.ª (iniciais do vendedor) são opcionais.
 */
export function parsePlatesHtml(html: string, recebido = ''): PlateRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: PlateRow[] = [];
  doc.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH').map(c => clean(c.textContent));
    if (cells.length < 5) return;
    const [enc, chas, modelo, mat, data, nota = '', resp = ''] = cells;
    const dmat = dataPt(data);
    const vin = chas.toUpperCase().replace(/\s/g, '');
    if (!RE_ENC.test(enc) || !RE_VIN.test(vin) || !RE_PLATE.test(mat.toUpperCase()) || !dmat) return;
    out.push({ enc, chas: vin, modelo, mat: formatMatricula(mat), dmat, nota, resp, recebido });
  });
  return out;
}

/** Várias linhas da mesma encomenda (reenvios/correções): fica a do email mais recente. */
export function dedupePlates(rows: PlateRow[]): PlateRow[] {
  const byEnc = new Map<string, PlateRow>();
  for (const r of rows) {
    const k = normEnc(r.enc);
    const prev = byEnc.get(k);
    if (!prev || r.recebido >= prev.recebido) byEnc.set(k, r);
  }
  return [...byEnc.values()];
}

/* ───────────────────────── 2. "Pedido de matrícula" ───────────────────────── */

const RE_PEDIDO_ASSUNTO = /pedido\s+de\s+matr[ií]cula/i;
const RE_RESPOSTA = /^\s*(re|res|fw|fwd|enc)\s*:/i;

/** Lê "Cliente: …", "Encomenda: …", "Chassis: …", "Bizagi: …" do corpo do pedido. */
export function parsePedido(text: string): PedidoCampos {
  const campo = (nome: string) => {
    const m = new RegExp(`^\\s*${nome}\\s*:\\s*(.*)$`, 'im').exec(text);
    return clean(m?.[1]);
  };
  return { cliente: campo('Cliente'), enc: campo('Encomenda'), chas: campo('Chassis'), biz: campo('Bizagi') };
}

/**
 * A resposta da secretaria diz que a matrícula foi pedida? Só se olha para o texto da
 * própria resposta (nunca para o histórico citado) e uma negação ("ainda não foi
 * pedida") anula.
 */
export function isMatriculaPedida(text: string): boolean {
  const t = clean(text).toLowerCase();
  if (!/matr[ií]culas?\s+(j[aá]\s+)?pedid[ao]s?/.test(t)) return false;
  return !/\bn[aã]o\b[^.!?\n]{0,40}pedid[ao]s?/.test(t);
}

/**
 * Pedidos de matrícula CONFIRMADOS. Numa conversa, o pedido é a mensagem original
 * (com a encomenda ou o chassis); conta quando alguém da secretaria (`confirmadores`)
 * responde, depois dela, "matrícula pedida". Vale a primeira confirmação.
 */
export function pedidosConfirmados(msgs: PedidoMsg[], confirmadores: string[]): PedidoConfirmado[] {
  const ok = new Set(confirmadores.map(e => e.trim().toLowerCase()));
  const porConversa = new Map<string, PedidoMsg[]>();
  for (const m of msgs) {
    if (!RE_PEDIDO_ASSUNTO.test(m.subject)) continue;
    porConversa.set(m.conversationId, [...(porConversa.get(m.conversationId) ?? []), m]);
  }
  const out: PedidoConfirmado[] = [];
  for (const [conversationId, grupo] of porConversa) {
    const ordenado = [...grupo].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    // Original: a primeira mensagem que não é resposta e traz encomenda ou chassis.
    const original = ordenado.find(m => !RE_RESPOSTA.test(m.subject) && (() => { const c = parsePedido(m.text); return !!(c.enc || c.chas); })());
    if (!original) continue;
    const confirmacao = ordenado.find(m => m.id !== original.id && m.sentAt > original.sentAt && ok.has(m.from.toLowerCase()) && isMatriculaPedida(m.text));
    if (!confirmacao) continue;
    const dia = diaLisboa(confirmacao.sentAt);
    if (!dia) continue;
    out.push({ ...parsePedido(original.text), confirmadoEm: dia, conversationId });
  }
  return out;
}

/* ───────────────────────── Emparelhamento ───────────────────────── */

type Procura = { enc?: string; chas?: string; biz?: string };
type Achado =
  | { tipo: 'um'; registo: SyncRecord; por: 'enc' | 'chas' | 'biz' }
  | { tipo: 'varios'; n: number }
  | { tipo: 'nenhum' };

/** Encomenda → chassis → Bizagi; só devolve um registo se for inequívoco. */
function procurar(registos: SyncRecord[], q: Procura): Achado {
  const tentativas: ['enc' | 'chas' | 'biz', (r: SyncRecord) => boolean][] = [];
  const e = normEnc(q.enc);
  if (e) tentativas.push(['enc', r => normEnc(r.enc) === e]);
  if (normChas(q.chas).length >= 6) tentativas.push(['chas', r => chassisCompativeis(r.chas, q.chas)]);
  const b = clean(q.biz);
  if (b) tentativas.push(['biz', r => clean(r.biz) === b]);
  for (const [por, fn] of tentativas) {
    const hits = registos.filter(fn);
    if (hits.length === 1) return { tipo: 'um', registo: hits[0], por };
    if (hits.length > 1) return { tipo: 'varios', n: hits.length };
  }
  return { tipo: 'nenhum' };
}

const ESTADOS_ATIVOS = new Set(['Carteira', 'Matricula']);
const ESTADOS_PLANEAVEIS = new Set(['Carteira', 'Matricula', 'Retail']);

/* ───────────────────────── Plano ───────────────────────── */

export function planSync(registos: SyncRecord[], plates: PlateRow[], pedidos: PedidoConfirmado[]): SyncPlan {
  const issues: SyncIssue[] = [];
  let jaAtualizados = 0;
  const alteracoes = new Map<string, PlannedChange>();

  const alvo = (r: SyncRecord, origem: 'matriculas' | 'pedido'): PlannedChange => {
    let c = alteracoes.get(r.id);
    if (!c) {
      c = { recordId: r.id, enc: r.enc, cliente: r.cliente, origem: [], antes: { status: r.status, mat: r.mat, chas: r.chas, dmat: r.dmat }, patch: {} };
      alteracoes.set(r.id, c);
    }
    if (!c.origem.includes(origem)) c.origem.push(origem);
    return c;
  };

  /* 2. Pedidos confirmados: Carteira → Matricula, DMAT = dia da confirmação. */
  for (const p of pedidos) {
    const ref = p.enc || p.chas || p.biz;
    const a = procurar(registos, p);
    if (a.tipo === 'nenhum') { issues.push({ kind: 'sem_registo', origem: 'pedido', ref, detalhe: 'Nenhum registo com esta encomenda, chassis ou Bizagi.' }); continue; }
    if (a.tipo === 'varios') { issues.push({ kind: 'ambiguo', origem: 'pedido', ref, detalhe: `${a.n} registos correspondem; não se altera nenhum.` }); continue; }
    const r = a.registo;
    if (p.biz && r.biz && clean(p.biz) !== clean(r.biz)) {
      issues.push({ kind: 'conflito', origem: 'pedido', ref, detalhe: `Bizagi do email (${p.biz}) ≠ do registo (${r.biz}).` });
      continue;
    }
    if (r.status === 'Carteira') {
      const c = alvo(r, 'pedido');
      c.patch.status = 'Matricula';
      if (!r.dmat) c.patch.dmat = p.confirmadoEm;
    } else if (r.status === 'Matricula' || r.status === 'Retail') {
      jaAtualizados++;
    } else {
      issues.push({ kind: 'estado', origem: 'pedido', ref, detalhe: `O registo está em "${r.status || 'sem estado'}"; só Carteira passa a Matrícula.` });
    }
  }

  /* 1. Matrículas atribuídas: MAT, CHAS, DMAT (e Carteira → Matricula). */
  for (const pl of dedupePlates(plates)) {
    const a = procurar(registos, { enc: pl.enc, chas: pl.chas });
    if (a.tipo === 'nenhum') { issues.push({ kind: 'sem_registo', origem: 'matriculas', ref: pl.enc, detalhe: `${pl.mat} (${pl.nota || 'sem nota'}) não tem registo com esta encomenda nem chassis.` }); continue; }
    if (a.tipo === 'varios') { issues.push({ kind: 'ambiguo', origem: 'matriculas', ref: pl.enc, detalhe: `${a.n} registos correspondem; não se altera nenhum.` }); continue; }
    const r = a.registo;
    if (!ESTADOS_PLANEAVEIS.has(r.status)) {
      issues.push({ kind: 'estado', origem: 'matriculas', ref: pl.enc, detalhe: `Matrícula ${pl.mat}, mas o registo está em "${r.status || 'sem estado'}".` });
      continue;
    }
    // Encomenda igual com chassis diferente = troca de encomenda ou erro: não se mexe.
    if (r.chas && !chassisCompativeis(r.chas, pl.chas)) {
      issues.push({ kind: 'conflito', origem: 'matriculas', ref: pl.enc, detalhe: `Chassis do email (${pl.chas}) ≠ do registo (${r.chas}).` });
      continue;
    }
    if (r.mat && matriculaCompacta(r.mat) !== matriculaCompacta(pl.mat)) {
      issues.push({ kind: 'conflito', origem: 'matriculas', ref: pl.enc, detalhe: `Matrícula do email (${pl.mat}) ≠ do registo (${r.mat}).` });
      continue;
    }

    const patch: SyncPatch = {};
    if (!r.mat) patch.mat = pl.mat;
    // Completa um chassis parcial (os últimos 7) com o VIN inteiro.
    if (normChas(r.chas) !== pl.chas) patch.chas = pl.chas;
    if (ESTADOS_ATIVOS.has(r.status) && r.dmat !== pl.dmat) patch.dmat = pl.dmat;
    else if (r.status === 'Retail' && !r.dmat) patch.dmat = pl.dmat;
    if (r.status === 'Carteira') patch.status = 'Matricula';

    if (Object.keys(patch).length === 0) { jaAtualizados++; continue; }
    const c = alvo(r, 'matriculas');
    Object.assign(c.patch, patch); // a data real da matrícula prevalece sobre a do pedido
  }

  // O que ficou igual ao que já está gravado não é alteração.
  const changes: PlannedChange[] = [];
  for (const c of alteracoes.values()) {
    for (const k of Object.keys(c.patch) as (keyof SyncPatch)[]) {
      const antes = k === 'dmat' ? c.antes.dmat : c.antes[k];
      if ((antes ?? '') === c.patch[k]) delete c.patch[k];
    }
    if (Object.keys(c.patch).length > 0) changes.push(c);
    else jaAtualizados++;
  }
  changes.sort((x, y) => normEnc(x.enc).localeCompare(normEnc(y.enc), 'pt', { numeric: true }));
  return { changes, issues, jaAtualizados };
}

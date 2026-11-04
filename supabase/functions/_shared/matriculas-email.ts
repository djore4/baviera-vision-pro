// Regras (puras, sem Deno nem rede) para ler as respostas ao "Pedido de matrícula".
// Usadas pela edge function sync-matriculas e testadas em src/test/matriculas-email.test.ts.
//
// Fluxo: a pessoa envia "Pedido de matrícula | <Cliente>" (texto gerado por
// buildMatriculaRequest, com Encomenda/Chassis). O stand responde:
//   1) "matrícula pedida"  → o pedido passa a contar como feito;
//   2) mais tarde, a matrícula atribuída (ex.: AB-12-CD) → preenche `mat`.

export interface RegistoVN {
  id: string;
  cliente: string | null;
  enc: string | null;
  chas: string | null;
  mat: string | null;
  status: string | null;
  mat_pedida_em: string | null;
  /** AAAA-MM-DD. Opcional: só o email diário de matrículas o usa. */
  dmat?: string | null;
}

export interface Mensagem {
  id: string;
  /** Remetente em minúsculas (só usado para escolher o email diário de matrículas). */
  de?: string;
  assunto: string;
  corpo: string;          // texto simples, incluindo a conversa citada
  recebidaEm: string;     // ISO
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Só a parte nova da resposta: corta no início da conversa citada. */
export function parteNova(corpo: string): string {
  const linhas = corpo.replace(/\r\n?/g, "\n").split("\n");
  const marca = /^\s*(>|-{2,}\s*(original|mensagem original|forwarded)|_{5,}|(de|from)\s*:|(enviado|sent)\s*:|em .+ escreveu:|on .+ wrote:)/i;
  const out: string[] = [];
  for (const l of linhas) {
    if (marca.test(l)) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

export const ehMatriculaPedida = (nova: string): boolean => /matricula\s+pedida/.test(norm(nova));

/** Matrículas portuguesas (AA-00-00, 00-00-AA, 00-AA-00, AA-00-AA), com hífens e em maiúsculas. */
export function extrairMatricula(nova: string): string | null {
  const re = /(?<![A-Z0-9])([A-Z]{2}|\d{2})[-\s]?([A-Z]{2}|\d{2})[-\s]?([A-Z]{2}|\d{2})(?![A-Z0-9])/g;
  for (const m of nova.matchAll(re)) {
    const grupos = [m[1], m[2], m[3]];
    const letras = grupos.filter(g => /^[A-Z]{2}$/.test(g)).length;
    // Tem de ter letras e números; sem hífens exige 3 grupos coladas (evita falsos positivos).
    const comHifen = /-/.test(m[0]);
    if (letras >= 1 && letras <= 2 && (comHifen || !/\s/.test(m[0]))) return grupos.join("-");
  }
  return null;
}

export interface Referencias {
  chassis: string | null;
  encomenda: string | null;
  cliente: string | null;
}

/** Chassis/encomenda da conversa citada e cliente do assunto ("Pedido de matrícula | Cliente"). */
export function extrairReferencias(assunto: string, corpo: string): Referencias {
  const chassis = corpo.match(/chassis\s*:\s*\*?\s*([A-HJ-NPR-Z0-9]{17})\b/i)?.[1]
    ?? corpo.match(/\b([A-HJ-NPR-Z0-9]{17})\b/)?.[1] ?? null;
  const encomenda = corpo.match(/encomenda\s*:\s*\*?\s*([A-Za-z0-9\-/.]+)/i)?.[1] ?? null;
  const cliente = assunto.replace(/^\s*((re|fw|fwd|enc|res)\s*:\s*)+/i, "")
    .match(/pedido\s+de\s+matr[ií]cula\s*\|\s*\*?([^*]+?)\*?\s*$/i)?.[1]?.trim() ?? null;
  return { chassis: chassis ? chassis.toUpperCase() : null, encomenda, cliente };
}

export type Casamento =
  | { registo: RegistoVN; por: "chassis" | "encomenda" | "cliente"; motivo?: undefined }
  | { registo: null; motivo: string; por?: undefined };

/** Associa a mensagem a UM registo (chassis > encomenda > cliente único). Ambiguidade = sem casamento. */
export function casar(ref: Referencias, registos: RegistoVN[]): Casamento {
  const un = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").toUpperCase();
  if (ref.chassis) {
    const r = registos.filter(x => un(x.chas) === ref.chassis);
    if (r.length === 1) return { registo: r[0], por: "chassis" };
    if (r.length > 1) return { registo: null, motivo: "chassis repetido" };
  }
  if (ref.encomenda) {
    const r = registos.filter(x => un(x.enc) === un(ref.encomenda));
    if (r.length === 1) return { registo: r[0], por: "encomenda" };
    if (r.length > 1) return { registo: null, motivo: "encomenda repetida" };
  }
  if (ref.cliente) {
    const r = registos.filter(x => norm(x.cliente ?? "") === norm(ref.cliente!));
    if (r.length === 1) return { registo: r[0], por: "cliente" };
    if (r.length > 1) return { registo: null, motivo: "vários negócios do mesmo cliente" };
  }
  return { registo: null, motivo: "negócio não encontrado" };
}

export interface Alteracao {
  id: string;
  mat_pedida_em?: string;
  mat?: string;
  chas?: string;
  dmat?: string;
}
export interface Resultado {
  alteracoes: Alteracao[];
  pedidas: number;
  matriculas: number;
  ignoradas: { assunto: string; motivo: string }[];
}

/** Processa as mensagens por ordem cronológica e devolve o que gravar. Idempotente. */
export function processar(mensagens: Mensagem[], registos: RegistoVN[]): Resultado {
  const estado = new Map<string, RegistoVN>(registos.map(r => [r.id, { ...r }]));
  const mudou = new Map<string, Alteracao>();
  const res: Resultado = { alteracoes: [], pedidas: 0, matriculas: 0, ignoradas: [] };
  const ordenadas = [...mensagens].sort((a, b) => a.recebidaEm.localeCompare(b.recebidaEm));

  for (const m of ordenadas) {
    const nova = parteNova(m.corpo);
    const pedida = ehMatriculaPedida(nova);
    const mat = extrairMatricula(nova);
    if (!pedida && !mat) continue;   // ex.: o próprio pedido, sem resposta

    const c = casar(extrairReferencias(m.assunto, m.corpo), [...estado.values()]);
    if (c.registo === null) { res.ignoradas.push({ assunto: m.assunto, motivo: c.motivo }); continue; }
    const r = estado.get(c.registo.id)!;
    const alt = mudou.get(r.id) ?? { id: r.id };

    if (pedida && !r.mat_pedida_em) {
      r.mat_pedida_em = m.recebidaEm; alt.mat_pedida_em = m.recebidaEm; res.pedidas++;
    }
    if (mat) {
      if (!r.mat_pedida_em) {
        res.ignoradas.push({ assunto: m.assunto, motivo: "matrícula sem resposta 'matrícula pedida' anterior" });
      } else if (!(r.mat ?? "").trim()) {
        r.mat = mat; alt.mat = mat; res.matriculas++;
      } else if (norm(r.mat!) !== norm(mat)) {
        res.ignoradas.push({ assunto: m.assunto, motivo: `já tem matrícula (${r.mat}); recebida ${mat}` });
      }
    }
    if (alt.mat_pedida_em || alt.mat) mudou.set(r.id, alt);
  }
  res.alteracoes = [...mudou.values()];
  return res;
}

/* ───────────────────────── Email diário "Matriculas - Aveiro" ─────────────────────────
 * O stand envia todos os dias úteis uma tabela com as matrículas atribuídas:
 *   Nº Encomenda | NºChassis | Line | Matrícula | Data Matrícula | cliente ou DEMO | iniciais
 * É a fonte da matrícula, do chassis completo e da data real da matrícula (DMAT). Ao
 * contrário das respostas ao pedido, não depende da conversa: o emparelhamento é pela
 * encomenda (sem zeros à esquerda) ou pelo chassis. Nunca sobrescreve um valor diferente.
 */

export const ehEmailDiario = (assunto: string): boolean => /^\s*matr[ií]culas\s*-\s*aveiro/i.test(assunto.normalize("NFC"));

export interface Diario {
  id: string;
  recebidaEm: string;
  html: string;
}
export interface LinhaDiaria {
  enc: string;
  chas: string;
  mat: string;
  /** Data da matrícula, AAAA-MM-DD. */
  dmat: string;
  /** Cliente ou "DEMO", tal como vem no email. */
  nota: string;
}

const limpar = (s: string) =>
  s.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function dataPt(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const formatarMatricula = (s: string): string => {
  const m = /^([A-Z0-9]{2})[\s-]?([A-Z0-9]{2})[\s-]?([A-Z0-9]{2})$/.exec(s.trim().toUpperCase());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.trim().toUpperCase();
};

/**
 * Lê a tabela do email diário. As linhas reconhecem-se pela FORMA (encomenda numérica,
 * chassis de 17 caracteres, matrícula, data), não pela posição: cabeçalho, "Data:…" e
 * assinatura são ignorados. Sem DOM (corre no Deno): extração por expressões regulares.
 */
export function lerTabelaDiaria(html: string): LinhaDiaria[] {
  const out: LinhaDiaria[] = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const c = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => limpar(m[1]));
    if (c.length < 5) continue;
    const [enc, chasRaw, , mat, data, nota = ""] = c;
    const chas = chasRaw.toUpperCase().replace(/\s/g, "");
    const dmat = dataPt(data);
    if (!/^\d{4,9}$/.test(enc) || !/^[A-HJ-NPR-Z0-9]{17}$/.test(chas) || !/^[A-Z0-9]{2}[\s-]?[A-Z0-9]{2}[\s-]?[A-Z0-9]{2}$/i.test(mat) || !dmat) continue;
    out.push({ enc, chas, mat: formatarMatricula(mat), dmat, nota });
  }
  return out;
}

/** Encomenda para comparar: numéricas perdem os zeros à esquerda ("0230244" = "230244"). */
export const normEnc = (s: string | null | undefined): string => {
  const t = (s ?? "").replace(/\s/g, "").toUpperCase();
  return /^\d+$/.test(t) ? t.replace(/^0+/, "") : t;
};

/** Chassis compatíveis: iguais ou um é o final do outro (os pedidos trazem só os últimos 7). */
export function chassisCompativeis(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").replace(/\s/g, "").toUpperCase(), y = (b ?? "").replace(/\s/g, "").toUpperCase();
  if (x.length < 6 || y.length < 6) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

const compacta = (m: string | null | undefined) => (m ?? "").replace(/[\s-]/g, "").toUpperCase();

export interface ResultadoDiarios {
  alteracoes: Alteracao[];
  /** Registos a que se acrescentou matrícula / chassis / data da matrícula. */
  matriculas: number;
  chassis: number;
  datas: number;
  ignoradas: { assunto: string; motivo: string }[];
}

/** Aplica as alterações já decididas a uma cópia dos registos (para encadear fontes). */
export function aplicarAlteracoes(registos: RegistoVN[], alteracoes: Alteracao[]): RegistoVN[] {
  const por = new Map(alteracoes.map(a => [a.id, a]));
  return registos.map(r => {
    const { id: _id, ...campos } = por.get(r.id) ?? { id: r.id };
    return { ...r, ...campos };
  });
}

/**
 * Processa os emails diários por ordem cronológica. Devolve só o que MUDA (idempotente).
 * `registos` devem ser os negócios ainda por entregar (Carteira/Matrícula).
 */
export function processarDiarios(diarios: Diario[], registos: RegistoVN[]): ResultadoDiarios {
  const estado = new Map<string, RegistoVN>(registos.map(r => [r.id, { ...r }]));
  const mudou = new Map<string, Alteracao>();
  const res: ResultadoDiarios = { alteracoes: [], matriculas: 0, chassis: 0, datas: 0, ignoradas: [] };
  const ignorar = (l: LinhaDiaria, motivo: string) => res.ignoradas.push({ assunto: `Matriculas - Aveiro · ${l.enc} (${l.mat})`, motivo });

  for (const d of [...diarios].sort((a, b) => a.recebidaEm.localeCompare(b.recebidaEm))) {
    for (const l of lerTabelaDiaria(d.html)) {
      const todos = [...estado.values()];
      let hits = todos.filter(r => normEnc(r.enc) && normEnc(r.enc) === normEnc(l.enc));
      if (hits.length === 0) hits = todos.filter(r => chassisCompativeis(r.chas, l.chas));
      if (hits.length === 0) { ignorar(l, "negócio não encontrado"); continue; }
      if (hits.length > 1) { ignorar(l, "vários negócios correspondem"); continue; }
      const r = hits[0];

      // Encomenda igual com outro chassis = troca de encomenda ou engano: não se mexe.
      if ((r.chas ?? "").trim() && !chassisCompativeis(r.chas, l.chas)) { ignorar(l, `chassis diferente (${r.chas})`); continue; }
      if ((r.mat ?? "").trim() && compacta(r.mat) !== compacta(l.mat)) { ignorar(l, `já tem matrícula (${r.mat})`); continue; }

      const alt = mudou.get(r.id) ?? { id: r.id };
      if (!(r.mat ?? "").trim()) { r.mat = l.mat; alt.mat = l.mat; res.matriculas++; }
      // Completa um chassis parcial (os últimos 7) com o VIN inteiro.
      if ((r.chas ?? "").replace(/\s/g, "").toUpperCase() !== l.chas) { r.chas = l.chas; alt.chas = l.chas; res.chassis++; }
      if ((r.dmat ?? "") !== l.dmat) { r.dmat = l.dmat; alt.dmat = l.dmat; res.datas++; }
      if (alt.mat || alt.chas || alt.dmat) mudou.set(r.id, alt);
    }
  }
  res.alteracoes = [...mudou.values()];
  return res;
}

/** Junta duas listas de alterações do mesmo registo numa só (a segunda prevalece em conflito). */
export function juntarAlteracoes(...listas: Alteracao[][]): Alteracao[] {
  const out = new Map<string, Alteracao>();
  for (const a of listas.flat()) out.set(a.id, { ...(out.get(a.id) ?? {}), ...a });
  return [...out.values()];
}

export interface Detalhe {
  id: string;
  enc: string;
  cliente: string;
  campos: { campo: string; de: string; para: string }[];
}

const ROTULOS: Record<string, string> = { mat_pedida_em: "Pedido de matrícula", mat: "Matrícula", chas: "Chassis", dmat: "DMAT" };
const dia = (v: string) => (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : v);

/** O que vai mudar, em linguagem de utilizador, para a pré-visualização. */
export function detalhar(alteracoes: Alteracao[], registos: RegistoVN[]): Detalhe[] {
  const por = new Map(registos.map(r => [r.id, r]));
  return alteracoes.map(a => {
    const r = por.get(a.id);
    const campos = (["mat_pedida_em", "mat", "chas", "dmat"] as const)
      .filter(k => a[k] !== undefined)
      .map(k => {
        const antes = k === "mat_pedida_em" ? "" : String(r?.[k] ?? "");
        const depois = String(a[k]);
        return { campo: ROTULOS[k], de: antes ? (k === "dmat" ? dia(antes) : antes) : "—", para: k === "mat_pedida_em" || k === "dmat" ? dia(depois) : depois };
      });
    return { id: a.id, enc: r?.enc ?? "", cliente: r?.cliente ?? "", campos };
  });
}

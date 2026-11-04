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
}

export interface Mensagem {
  id: string;
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

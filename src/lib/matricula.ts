/**
 * Geração do texto do "Pedido de matrícula" para copy/paste.
 *
 * Os campos usados já existem no modelo de dados (control_records):
 *  - cliente  ← id_cliente (nome do cliente)
 *  - enc      ← número de encomenda
 *  - chas     ← chassis / VIN
 *  - biz      ← número Bizagi
 *  - fin      ← método de pagamento (coluna "Pag")
 */

export interface MatriculaFields {
  cliente?: string | null;
  enc?: string | null;
  chas?: string | null;
  biz?: string | null;
  fin?: string | null;
}

/** Destinatários e CC fixos do pedido de matrícula. */
const DESTINATARIOS = ['sonia.carvalho@caetano.pt', 'lurdes.aguiar@caetano.pt'];
const CC = ['jose.mesquita@caetano.pt', 'joaocarlos.duarte@caetano.pt'];

/** Saudação em função da hora: bom dia (<12h), boa tarde (12–20h), boa noite (>=20h). */
export function saudacao(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

/** Constrói o corpo do pedido de matrícula com a saudação ajustada à hora do copy. */
export function buildMatriculaRequest(f: MatriculaFields, now: Date = new Date()): string {
  const val = (v?: string | null) =>
    v === null || v === undefined || String(v).trim() === '' ? '' : String(v).trim();

  return [
    `Destinatários: ${DESTINATARIOS.join('; ')}`,
    `CC: ${CC.join('; ')}`,
    `Assunto: *Pedido de matrícula* | *${val(f.cliente)}*`,
    '',
    `${saudacao(now)},`,
    '',
    'Solicito que avancem com o seguinte pedido de matrícula:',
    '',
    `Cliente: ${val(f.cliente)}`,
    `Encomenda: ${val(f.enc)}`,
    `Chassis: ${val(f.chas)}`,
    `Bizagi: ${val(f.biz)}`,
    `Pagamento: ${val(f.fin)}`,
  ].join('\n');
}

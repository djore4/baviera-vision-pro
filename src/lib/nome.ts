/* Como o sistema trata uma pessoa: "Primeiro Último" (nunca o email, nem os nomes do meio). */

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
const semAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Palavras do nome que vêm de um email (joao.duarte@x.pt → ['Joao','Duarte']). */
const doEmail = (email: string | null | undefined): string[] =>
  (email ?? '').split('@')[0].split(/[._-]+/).filter(w => /^\p{L}+$/u.test(w)).map(cap);

/**
 * "Primeiro Último" a partir do nome completo. Se o nome em ficha for, na verdade, um email
 * (acontece quando a conta foi criada só com o email), ou não existir, deduz-se do email. Um nome
 * só com o primeiro nome completa-se com o apelido do email quando este começar pelo mesmo nome.
 */
export function nomeCurto(nome: string | null | undefined, email?: string | null): string {
  const bruto = (nome ?? '').trim();
  const eMail = bruto.includes('@') ? bruto : email;
  const partes = bruto && !bruto.includes('@') ? bruto.split(/\s+/).filter(Boolean) : [];

  if (partes.length >= 2) return `${partes[0]} ${partes[partes.length - 1]}`;

  const palavras = doEmail(eMail);
  if (partes.length === 1) {
    return palavras.length >= 2 && semAcentos(palavras[0]) === semAcentos(partes[0])
      ? `${partes[0]} ${palavras[palavras.length - 1]}` : partes[0];
  }
  if (palavras.length === 0) return '';
  return palavras.length === 1 ? palavras[0] : `${palavras[0]} ${palavras[palavras.length - 1]}`;
}

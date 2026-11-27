/* ── Bimby · o boneco de cartão que repete o que lhe escrevem ─────────────────
 * Lógica pura (sem UI): transforma o texto introduzido numa versão "cómica" para
 * o boneco dizer em voz alta. `rng` é injetável para os testes serem determinísticos.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Rng = () => number;

export const MAX_CHARS = 280;

const ABERTURAS = [
  'Atenção, atenção!', 'Ai Jesus!', 'Credo!', 'Oh pá!', 'Psiu!', 'Alerta Bimby!',
  'Chiça!', 'Meu Deus do céu!', 'Boa tarde, Portugal!', 'Notícia de última hora!',
];

const REMATES = [
  'E pronto.', 'Foi o que me disseram, não fui eu!', 'Eu sou só de cartão, não me culpem.',
  'Disse o Bimby, com toda a seriedade.', 'Hihihi!', 'E isto é tudo, minha gente.',
  'Que Deus me dê paciência para este papelão!', 'Pipi! Pipi!', 'Fica registado em cartão.',
  'Mas quem é que paga o café?',
];

const MEIO = ['pá', 'tipo', 'ó pá', 'sabes', 'ai ai', 'olha', 'epá'];

const VOGAL = /[aeiouáéíóúâêôãõà]/i;

function pick<T>(lista: readonly T[], rng: Rng): T {
  return lista[Math.floor(rng() * lista.length) % lista.length];
}

/* Alonga a última vogal da palavra ("olá" → "oláááá"). Palavras sem vogais ficam como estão. */
export function alongar(palavra: string, rng: Rng = Math.random): string {
  for (let i = palavra.length - 1; i >= 0; i--) {
    if (VOGAL.test(palavra[i])) {
      const extra = 3 + Math.floor(rng() * 4);
      return palavra.slice(0, i + 1) + palavra[i].repeat(extra) + palavra.slice(i + 1);
    }
  }
  return palavra;
}

/* Limpa o texto: espaços repetidos, quebras de linha, tamanho máximo. */
export function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
}

/* Versão cómica do texto. Em modo "fiel" devolve só o texto normalizado.
 * Estrutura: abertura + palavras (algumas esticadas, gritadas ou com muletas) + remate. */
export function bimbyficar(texto: string, modo: 'fiel' | 'maluco' = 'maluco', rng: Rng = Math.random): string {
  const limpo = normalizar(texto);
  if (!limpo) return '';
  if (modo === 'fiel') return limpo;

  const palavras = limpo.split(' ');
  const saida: string[] = [];
  palavras.forEach((p, i) => {
    const letras = p.replace(/[^\p{L}]/gu, '');
    let w = p;
    // só mexe em palavras de verdade (pelo menos 3 letras), para não estragar "de", "a", números…
    if (letras.length >= 3) {
      const r = rng();
      if (r < 0.2) w = alongar(p, rng);
      else if (r < 0.32) w = p.toUpperCase() + '!';
    }
    saida.push(w);
    if (i < palavras.length - 1 && i > 0 && i % 4 === 0 && rng() < 0.6) saida.push(`${pick(MEIO, rng)},`);
  });

  return `${pick(ABERTURAS, rng)} ${saida.join(' ')} ${pick(REMATES, rng)}`;
}

/* O que se mostra no balão: igual ao que o boneco diz. */
export function textoParaFala(texto: string, modo: 'fiel' | 'maluco', rng: Rng = Math.random): string {
  return bimbyficar(texto, modo, rng);
}

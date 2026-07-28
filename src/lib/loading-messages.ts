/* ── Easter egg: mensagens de "loading" com humor ─────────────────────────────
 * Na maioria das vezes devolve "A carregar…"; ocasionalmente, uma frase divertida
 * de garagem. Chamar dentro de useState(() => funLoadingLabel()) para escolher
 * uma vez por montagem (sem flicker entre re-renders).
 * ──────────────────────────────────────────────────────────────────────────── */

const DEFAULT_LABEL = 'A carregar…';

const FUN_LABELS = [
  'A aquecer o motor…',
  'A polir os retails…',
  'A afinar a suspensão…',
  'A encher os pneus…',
  'A calibrar o turbo…',
];

/* Probabilidade de mostrar uma frase divertida (senão, o texto normal). */
const FUN_CHANCE = 0.18;

export function funLoadingLabel(): string {
  if (Math.random() < FUN_CHANCE) {
    return FUN_LABELS[Math.floor(Math.random() * FUN_LABELS.length)];
  }
  return DEFAULT_LABEL;
}

/* ── Easter egg: saudação na consola ──────────────────────────────────────────
 * Mensagem estilizada para quem abre o DevTools. Invisível ao utilizador normal,
 * clássico e profissional. Corre apenas uma vez por sessão de página.
 * ──────────────────────────────────────────────────────────────────────────── */

let printed = false;

export function printConsoleEgg(): void {
  if (printed || typeof console === 'undefined') return;
  printed = true;

  const banner = [
    'background:#1C69D4', 'color:#fff', 'font-size:14px', 'font-weight:700',
    'padding:6px 12px', 'border-radius:4px',
  ].join(';');
  const line = 'color:#1C69D4;font-size:12px';

  console.log('%cCaetano BMW · Dashboard', banner);
  console.log(
    '%c👀 A espreitar o motor? Se percebes de código, fala connosco. 🏎️',
    line,
  );
}

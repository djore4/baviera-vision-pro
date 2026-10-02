import type { ClientConfig } from './types';

/* Cliente desta instalação, escolhido no build por VITE_CLIENT (por omissão a
 * Baviera, a instalação original). Um id desconhecido falha no arranque em vez
 * de mostrar a marca de outro cliente. */
const modules = import.meta.glob<{ default: ClientConfig }>('./*/config.ts', { eager: true });

export const CLIENTS: Record<string, ClientConfig> = Object.fromEntries(
  Object.values(modules).map(m => [m.default.id, m.default]),
);

const clientId = import.meta.env.VITE_CLIENT || 'baviera';
const selected = CLIENTS[clientId];
if (!selected) throw new Error(`VITE_CLIENT desconhecido: "${clientId}"`);

export const client: ClientConfig = selected;

/* Aplica a marca do cliente ao documento: título, cores e tipo de letra. */
export function applyClientBranding(c: ClientConfig = client) {
  document.title = `${c.title} — Dashboard`;

  const root = document.documentElement.style;
  root.setProperty('--brand-primary', c.theme.primary);
  root.setProperty('--brand-dark', c.theme.dark);
  root.setProperty('--primary', c.theme.primary);

  if (c.font) {
    const byWeight = new Map<number, string[]>();
    for (const f of c.font.faces) {
      byWeight.set(f.weight, [...(byWeight.get(f.weight) ?? []), `url('${import.meta.env.BASE_URL}${f.url.replace(/^\//, '')}') format('${f.format}')`]);
    }
    const css = [...byWeight].map(([weight, srcs]) =>
      `@font-face{font-family:'${c.font!.family}';src:${srcs.join(',')};font-weight:${weight};font-style:normal;font-display:swap}`,
    ).join('\n');
    const style = document.createElement('style');
    style.dataset.clientFont = c.id;
    style.textContent = css;
    document.head.appendChild(style);
    root.setProperty('--font-brand', `'${c.font.family}'`);
  }
}

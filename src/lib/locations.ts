import { client } from '@/clients';

/* ── Locais (stands) do grupo ─────────────────────────────────────────────────
 * A lista vive na config do cliente (client.locais). Cada utilizador tem os
 * locais em que opera em app_users.local (jsonb, array de nomes canónicos) —
 * escolhidos pelo administrador em Utilizadores. Servem para abrir cada tab no
 * local da pessoa; NÃO são uma barreira de acesso (ver tab a tab).
 *
 * Os ficheiros e as bases escrevem o mesmo local de várias formas ("Caetano
 * Aveiro", "Baviera Aveiro 2", "V. N. Gaia"): canonicalLocal() reduz tudo ao nome
 * canónico, para comparar sempre o mesmo com o mesmo.
 * ──────────────────────────────────────────────────────────────────────────── */

export type LocalDef = NonNullable<typeof client.locais>[number];

/* minúsculas, sem acentos nem pontuação, espaços simples. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const locaisDoGrupo = (locais: LocalDef[] | undefined = client.locais): string[] =>
  (locais ?? []).map(l => l.nome);

/* Nome canónico do local a que `raw` se refere, ou null se não for de nenhum.
 * Aceita o nome ou um alias, também dentro de um texto maior ("Caetano Aveiro 2");
 * com vários a corresponder, ganha a forma mais comprida. */
export function canonicalLocal(raw: string | null | undefined, locais: LocalDef[] | undefined = client.locais): string | null {
  const t = norm(raw ?? '');
  if (!t || !locais?.length) return null;
  let best: { nome: string; len: number } | null = null;
  for (const l of locais) {
    for (const forma of [l.nome, ...(l.aliases ?? [])]) {
      const f = norm(forma);
      if (f && new RegExp(`(^| )${escapeRe(f)}( |$)`).test(t) && (!best || f.length > best.len)) best = { nome: l.nome, len: f.length };
    }
  }
  return best?.nome ?? null;
}

/* Locais de um perfil (app_users.local), em nomes canónicos, sem repetidos.
 * Aceita array, texto ou nulo; valores que não são de nenhum local ignoram-se. */
export function locaisDoPerfil(v: unknown, locais: LocalDef[] | undefined = client.locais): string[] {
  const brutos = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  for (const b of brutos) {
    const c = typeof b === 'string' ? canonicalLocal(b, locais) : null;
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

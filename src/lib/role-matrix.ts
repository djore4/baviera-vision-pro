import {
  LOCAL_ACESSO_COMPLETO, funcaoDaEquipa, tabLivreForaDoLocal,
  type AccessLevel, type AppRole,
} from '@/lib/permissions';

/* ── Matriz de permissões: lógica pura (tab Utilizadores) ──────────────────────
 * Cada célula é (tab × coluna). Colunas: um local, "sem local" (matriz base) ou uma
 * equipa. Local e base têm sempre um nível; a equipa é uma CAMADA por cima: uma
 * célula vazia (`undefined`) herda do local, uma preenchida (incluindo 'none')
 * substitui-o. Espelha access_rank / nivelDaFuncao.
 * ──────────────────────────────────────────────────────────────────────────── */

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };
const nivel = (v: unknown): AccessLevel => (v === 'view' || v === 'edit' ? v : 'none');

/** Próximo nível ao clicar numa célula de local/base: sem acesso → consulta → edição → sem acesso.
 *  Uma permissão fina (só 'sim'/'não') alterna entre sem acesso e edição. */
export const proximoNivel = (v: AccessLevel, fina = false): AccessLevel =>
  fina ? (v === 'none' ? 'edit' : 'none') : v === 'none' ? 'view' : v === 'view' ? 'edit' : 'none';

/** Próximo valor numa célula de equipa: herda → sem acesso → consulta → edição → herda. */
export const proximoNivelEquipa = (v: AccessLevel | undefined, fina = false): AccessLevel | undefined => {
  if (v === undefined) return 'none';
  if (fina) return v === 'none' ? 'edit' : undefined;
  return v === 'none' ? 'view' : v === 'view' ? 'edit' : undefined;
};

/** O nível mais frequente (em empate, o mais alto). */
export function nivelMaioritario(valores: readonly AccessLevel[]): AccessLevel {
  const n: Record<AccessLevel, number> = { none: 0, view: 0, edit: 0 };
  valores.forEach(v => { n[v] += 1; });
  return (['edit', 'view', 'none'] as AccessLevel[]).reduce((best, l) => (n[l] > n[best] ? l : best), 'edit' as AccessLevel);
}

/** Quais dos valores (por ordem) diferem do maioritário. Tudo igual → nenhum. */
export function diferentesDoMaioritario(valores: readonly AccessLevel[]): boolean[] {
  const m = nivelMaioritario(valores);
  return valores.map(v => v !== m);
}

/* ── Acesso efetivo de uma pessoa, com a origem de cada nível ─────────────────── */

export interface AcessoEfetivo { nivel: AccessLevel; origem: string }

/** O mesmo resultado que nivelDaFuncao (testado), mais a explicação de onde vem. */
export function acessoEfetivo(
  role: AppRole | null | undefined, locais: readonly string[], tab: string,
  opts: { tabsPorLocal?: readonly string[]; comExcecao?: boolean; equipa?: string | null } = {},
): AcessoEfetivo {
  if (!role) return { nivel: 'none', origem: 'Sem função' };
  const eq = opts.equipa ?? null;
  const camadaBruta = eq ? role.permissions_equipa?.[eq] : undefined;
  const efetiva = funcaoDaEquipa(role, eq);
  const daEquipa = !!camadaBruta && efetiva !== role && Object.prototype.hasOwnProperty.call(camadaBruta, tab);
  const origemEquipa = `Equipa ${eq}`;

  if (!efetiva) return { nivel: 'none', origem: 'Sem função' };
  if (locais.length === 0) {
    return { nivel: nivel(efetiva.permissions?.[tab]), origem: daEquipa ? origemEquipa : 'Função (sem local)' };
  }
  let best: AcessoEfetivo | null = null;
  for (const l of locais) {
    const guardada = efetiva.permissions_local?.[l];
    let r: AcessoEfetivo;
    if (guardada && typeof guardada === 'object') {
      r = { nivel: nivel(guardada[tab]), origem: daEquipa ? origemEquipa : `Matriz do local ${l}` };
    } else if (l === LOCAL_ACESSO_COMPLETO || opts.comExcecao || tabLivreForaDoLocal(tab, opts.tabsPorLocal)) {
      r = { nivel: nivel(efetiva.permissions?.[tab]), origem: daEquipa ? origemEquipa : `Função (${l} sem matriz própria: regra anterior)` };
    } else {
      r = { nivel: 'none', origem: `${l} não tem matriz própria nesta função: só o End-of-Term` };
    }
    if (!best || RANK[r.nivel] > RANK[best.nivel]) best = r;
  }
  return best as AcessoEfetivo;
}

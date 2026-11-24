import {
  LOCAL_ACESSO_COMPLETO, funcaoDaEquipa, tabLivreForaDoLocal,
  type AccessLevel, type AppRole,
} from '@/lib/permissions';

/* ── Acesso de uma conta por local: lógica pura (tab Utilizadores → Contas) ────
 * Espelha access_rank / nivelDaFuncao: matriz do local, camada da equipa por cima.
 * ──────────────────────────────────────────────────────────────────────────── */

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };
const nivel = (v: unknown): AccessLevel => (v === 'view' || v === 'edit' ? v : 'none');

/* ── Acesso efetivo de uma pessoa, com a origem de cada nível ─────────────────── */

export interface AcessoEfetivo { nivel: AccessLevel; origem: string }

/** O mesmo resultado que nivelDaFuncao (testado), mais a explicação de onde vem. */
export function acessoEfetivo(
  role: AppRole | null | undefined, locais: readonly string[], tab: string,
  opts: { tabsPorLocal?: readonly string[]; comExcecao?: boolean; equipa?: string | null } = {},
): AcessoEfetivo {
  if (!role) return { nivel: 'none', origem: 'Sem função' };
  if (role.modelo_simples) {
    if (locais.length === 0) return { nivel: nivel(role.permissions?.[tab]), origem: 'Perfil · sem local' };
    let melhor: AcessoEfetivo | null = null;
    for (const l of locais) {
      const completo = l === LOCAL_ACESSO_COMPLETO || !!opts.comExcecao;
      const r: AcessoEfetivo = completo
        ? { nivel: nivel(role.permissions?.[tab]), origem: `Perfil · ${l === LOCAL_ACESSO_COMPLETO ? l : 'exceção por email'}` }
        : { nivel: nivel(role.permissions_outros?.[tab]), origem: `Perfil · outros locais (${l})` };
      if (!melhor || RANK[r.nivel] > RANK[melhor.nivel]) melhor = r;
    }
    return melhor as AcessoEfetivo;
  }
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

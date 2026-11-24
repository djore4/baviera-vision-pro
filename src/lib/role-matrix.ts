import { celulaMatriz, EQUIPAS_DA_MATRIZ, SEM_EQUIPA, SEM_LOCAL, type AccessLevel, type AppRole } from '@/lib/permissions';

/* ── Acesso de uma conta, com a origem de cada nível (tab Utilizadores → Contas) ───────────────
 * Espelha role_tab_level_matriz (SQL): a célula (local, equipa, tab) do perfil; vários locais = o mais alto. */

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

export interface AcessoEfetivo { nivel: AccessLevel; origem: string }

export function acessoEfetivo(
  role: AppRole | null | undefined, locais: readonly string[], tab: string, opts: { equipa?: string | null } = {},
): AcessoEfetivo {
  if (!role) return { nivel: 'none', origem: 'Sem perfil' };
  const eq = opts.equipa ?? null;
  const col = eq && (EQUIPAS_DA_MATRIZ as readonly string[]).includes(eq) ? eq : SEM_EQUIPA;
  let melhor: AcessoEfetivo | null = null;
  for (const l of locais.length ? locais : [SEM_LOCAL]) {
    const r: AcessoEfetivo = {
      nivel: celulaMatriz(role.permissions_matriz, l, col, tab),
      origem: `Perfil · ${l === SEM_LOCAL ? 'sem local' : l} · ${col === SEM_EQUIPA ? 'sem equipa' : col}`,
    };
    if (!melhor || RANK[r.nivel] > RANK[melhor.nivel]) melhor = r;
  }
  return melhor as AcessoEfetivo;
}

import { useMemo } from 'react';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import type { Scope } from '@/lib/eot';

/* Perfis com visibilidade total no End-of-Term (veem e controlam todos os
 * contratos, como o administrador). Os restantes perfis com acesso ao tab
 * (ex.: vendedores) veem apenas os contratos que lhes estão afetos (owner_email). */
const EOT_FULL_ACCESS_ROLES = new Set(['Finance']);

/* Escopo de acesso ao End-of-Term:
 *  - administrador e perfis de gestão (Finance) → veem tudo;
 *  - vendedores → apenas os contratos de que são responsáveis (owner_email). */
export function useEotScope() {
  const { session } = useAuth();
  const { isAdmin, roleName, me } = usePermissions();

  const email = session?.user.email ?? null;
  const nome = me?.nome ?? session?.user.email ?? null;

  const isDirector = isAdmin || (!!roleName && EOT_FULL_ACCESS_ROLES.has(roleName));

  const scope = useMemo<Scope>(() => ({ isDirector, email }), [isDirector, email]);

  return { scope, isDirector, myEmail: email, myNome: nome };
}

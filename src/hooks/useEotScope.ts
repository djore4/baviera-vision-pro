import { useMemo } from 'react';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { eotIsDirector } from '@/lib/eot-access';
import type { Scope } from '@/lib/eot';

/* Escopo de acesso ao End-of-Term:
 *  - administrador e quem tem a permissão 'end-of-term:todos' (ex.: Finance) → veem tudo;
 *  - vendedores → apenas os contratos de que são responsáveis (owner_email).
 * Ver eotIsDirector (regra, com a compatibilidade com a base ainda não migrada). */
export function useEotScope() {
  const { session } = useAuth();
  const { isAdmin, roleName, me, canView, capabilities } = usePermissions();

  const email = session?.user.email ?? null;
  const nome = me?.nome ?? session?.user.email ?? null;

  const isDirector = eotIsDirector({ isAdmin, roleName, capabilities, canView });

  const scope = useMemo<Scope>(() => ({ isDirector, email }), [isDirector, email]);

  return { scope, isDirector, isAdmin, myEmail: email, myNome: nome };
}

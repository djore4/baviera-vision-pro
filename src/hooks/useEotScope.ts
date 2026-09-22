import { useMemo } from 'react';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import type { Scope } from '@/lib/eot';

/* Escopo de acesso ao End-of-Term: o chefe de vendas (admin) vê e controla tudo;
 * o vendedor vê apenas os contratos de que é responsável (owner_email). O código
 * já está preparado para vendedores, embora o tab comece restrito a admin. */
export function useEotScope() {
  const { session } = useAuth();
  const { isAdmin, me } = usePermissions();

  const email = session?.user.email ?? null;
  const nome = me?.nome ?? session?.user.email ?? null;

  const scope = useMemo<Scope>(() => ({ isDirector: isAdmin, email }), [isAdmin, email]);

  return { scope, isDirector: isAdmin, myEmail: email, myNome: nome };
}

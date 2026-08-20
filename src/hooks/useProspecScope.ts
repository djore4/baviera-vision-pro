import { useMemo } from 'react';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import type { Scope } from '@/lib/prospec';

/* Escopo de acesso da Prospeção: o diretor (admin) vê tudo; o vendedor só o seu.
 * Enquanto o tab estiver restrito a admin, isDirector é sempre verdadeiro para
 * quem lá entra — mas o código já está preparado para o dia em que vendedores
 * tiverem acesso. */
export function useProspecScope() {
  const { session } = useAuth();
  const { isAdmin, me } = usePermissions();

  const email = session?.user.email ?? null;
  const nome = me?.nome ?? session?.user.email ?? null;

  const scope = useMemo<Scope>(() => ({ isDirector: isAdmin, email }), [isAdmin, email]);

  return { scope, isDirector: isAdmin, myEmail: email, myNome: nome };
}

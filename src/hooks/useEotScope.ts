import { useMemo } from 'react';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { eotIsDirector, eotIsLocalLead } from '@/lib/eot-access';
import type { Scope } from '@/lib/eot';

/* Escopo de acesso ao End-of-Term:
 *  - administrador e quem tem a permissão 'end-of-term:todos' (ex.: Finance) → veem tudo;
 *  - chefe de equipa local ('end-of-term:local') → os contratos do(s) seu(s) local(is), que a
 *    base de dados já devolve (RLS); por isso não se filtra por owner_email no cliente;
 *  - vendedores → apenas os contratos de que são responsáveis (owner_email).
 * Ver eotIsDirector (regra, com a compatibilidade com a base ainda não migrada). */
export function useEotScope() {
  const { session } = useAuth();
  const { isAdmin, roleName, me, canView, capabilities } = usePermissions();

  const email = session?.user.email ?? null;
  const nome = me?.nome ?? session?.user.email ?? null;

  const isDirector = eotIsDirector({ isAdmin, roleName, capabilities, canView });

  const isLocalLead = eotIsLocalLead({ isAdmin, roleName, capabilities, canView });

  const scope = useMemo<Scope>(() => ({ isDirector, isLocalLead, email }), [isDirector, isLocalLead, email]);

  // Quem pode atribuir contratos e gerir responsáveis (e o mapa de nomes do Excel).
  const canManage = isDirector || isLocalLead;

  return { scope, isDirector, isLocalLead, canManage, isAdmin, myEmail: email, myNome: nome };
}

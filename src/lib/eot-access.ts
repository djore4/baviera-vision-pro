import type { AppCapabilities } from '@/lib/permissions';

/* Visibilidade total no End-of-Term (ver e controlar todos os contratos, e
 * atribuir responsáveis): o administrador e quem tem a permissão 'end-of-term:todos'.
 * Os restantes (vendedores) veem e alteram só os contratos que lhes estão afetos
 * (owner_email) — a base de dados impõe o mesmo (migração eot_isolamento_vendedor).
 *
 * Enquanto a migração não está aplicada (capabilities.eotGranular), mantém-se a
 * regra antiga por NOME de função (Finance), para o deploy do código não tirar
 * visão a ninguém antes de a base de dados ser migrada. Remover o ramo `legacy`
 * (e `EOT_FULL_ACCESS_ROLES`) depois de aplicada a migração em todos os ambientes. */
export const EOT_FULL_ACCESS_ROLES = new Set(['Finance']);

export interface EotDirectorInput {
  isAdmin: boolean;
  roleName: string | null;
  capabilities: AppCapabilities;
  canView: (tab: string) => boolean;
}

export function eotIsDirector(i: EotDirectorInput): boolean {
  if (i.isAdmin) return true;
  if (i.capabilities.eotGranular) return i.canView('end-of-term:todos');
  // legacy: regra por nome de função (ver o comentário acima)
  return !!i.roleName && EOT_FULL_ACCESS_ROLES.has(i.roleName);
}

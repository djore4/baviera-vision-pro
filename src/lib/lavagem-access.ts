import type { AppCapabilities } from '@/lib/permissions';

/* Permissões da página Lavagem.
 *
 * Com a migração `lavagem_permissoes_granulares` aplicada (capabilities
 * .lavagemGranular), cada ação é uma permissão da função na matriz
 * ('lavagem:iniciar', …); o administrador tem todas.
 *
 * Enquanto a migração não está aplicada, mantêm-se as regras antigas por NOME de
 * função, exatamente como eram, para que o deploy do código não tire acesso a
 * ninguém antes de a base de dados ser migrada. Remover o ramo `legacy` (e
 * `roleName`) depois de aplicada a migração em todos os ambientes. */
export interface LavagemAccessInput {
  isAdmin: boolean;
  roleName: string | null;
  capabilities: AppCapabilities;
  canEdit: (tab: string) => boolean;
  canView: (tab: string) => boolean;
}

export interface LavagemAccess {
  canReschedule: boolean;   // editar lavagens existentes (arrastar) e removê-las
  canStartCycle: boolean;   // iniciar uma agendada e "agendar já"
  canCreate: boolean;       // ver o formulário de nova lavagem
  canQC: boolean;           // controlo de qualidade
  canExport: boolean;       // exportar Excel
  canViewRegistos: boolean; // histórico e auditoria
  canDelete: boolean;
}

export function lavagemAccess(i: LavagemAccessInput): LavagemAccess {
  const edit = i.canEdit('lavagem');
  let canReschedule: boolean;
  let canStartCycle: boolean;
  let canQC: boolean;
  let canViewRegistos: boolean;

  if (i.capabilities.lavagemGranular) {
    canReschedule = edit || i.canView('lavagem:reagendar');
    canStartCycle = i.canView('lavagem:iniciar');
    canQC = i.canView('lavagem:qualidade');
    canViewRegistos = i.canView('lavagem:registos');
  } else {
    // legacy: regras por nome de função (ver o comentário acima)
    canReschedule = i.isAdmin || i.roleName === 'Preparador' || edit;
    canStartCycle = i.isAdmin || i.roleName === 'Lavador';
    canQC = i.isAdmin || i.roleName === 'Preparador' || i.roleName === 'Vendedor';
    canViewRegistos = i.isAdmin || i.roleName === 'APV';
  }

  return {
    canReschedule,
    canStartCycle,
    canCreate: canReschedule || canStartCycle,
    canQC,
    canExport: i.isAdmin,
    canViewRegistos,
    canDelete: canReschedule,
  };
}

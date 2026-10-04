import { describe, it, expect } from 'vitest';
import { lavagemAccess } from '@/lib/lavagem-access';

type Perms = Record<string, 'view' | 'edit'>;

/* Quem a "plataforma" diz que é: o administrador tem tudo; os outros só o que a função tem. */
function who(roleName: string | null, perms: Perms, isAdmin = false) {
  const lvl = (tab: string) => (isAdmin ? 'edit' : perms[tab] ?? 'none');
  return {
    isAdmin, roleName,
    canEdit: (tab: string) => lvl(tab) === 'edit',
    canView: (tab: string) => lvl(tab) !== 'none',
  };
}

/* As regras de LavagemPage.tsx ANTES de passarem para permissões por ação (oráculo). */
function oldRules(isAdmin: boolean, roleName: string | null, lavagemEdit: boolean) {
  const canReschedule = isAdmin || roleName === 'Preparador' || lavagemEdit;
  const canStartCycle = isAdmin || roleName === 'Lavador';
  const canCreate = canReschedule || canStartCycle;
  const canQC = isAdmin || roleName === 'Preparador' || roleName === 'Vendedor';
  const canExport = isAdmin;
  const canViewRegistos = isAdmin || roleName === 'APV';
  const canDelete = canReschedule;
  return { canReschedule, canStartCycle, canCreate, canQC, canExport, canViewRegistos, canDelete };
}

const ROLES = ['Preparador', 'Lavador', 'APV', 'Vendedor', 'Vendedor VN', 'Vendedor VU', 'BPS + Motorrad', 'Gestor de Serviço', 'Finance', null];

describe('lavagemAccess — base de dados ainda não migrada (regras antigas por nome)', () => {
  const caps = { lavagemGranular: false, eotGranular: false };

  it.each(ROLES)('%s: igual às regras antigas, com e sem edição do tab, admin ou não', roleName => {
    for (const isAdmin of [false, true]) {
      for (const edit of [false, true]) {
        const perms: Perms = { lavagem: edit ? 'edit' : 'view' };
        const got = lavagemAccess({ ...who(roleName, perms, isAdmin), capabilities: caps });
        expect(got).toEqual(oldRules(isAdmin, roleName, isAdmin || edit));
      }
    }
  });

  it('o que cada função de produção faz hoje (sem alterações)', () => {
    const f = (r: string, lav: 'view' | 'edit') => lavagemAccess({ ...who(r, { lavagem: lav }), capabilities: caps });
    expect(f('Lavador', 'view')).toMatchObject({ canStartCycle: true, canCreate: true, canReschedule: false, canQC: false, canViewRegistos: false });
    expect(f('Preparador', 'edit')).toMatchObject({ canReschedule: true, canQC: true, canStartCycle: false, canViewRegistos: false });
    expect(f('APV', 'edit')).toMatchObject({ canViewRegistos: true, canReschedule: true, canQC: false, canStartCycle: false });
    expect(f('Vendedor VN', 'view')).toMatchObject({ canCreate: false, canQC: false, canReschedule: false, canViewRegistos: false });
    expect(f('Gestor de Serviço', 'edit')).toMatchObject({ canReschedule: true, canDelete: true, canQC: false });
  });
});

describe('lavagemAccess — base de dados migrada (permissões por ação)', () => {
  const caps = { lavagemGranular: true, eotGranular: false };
  const f = (perms: Perms, roleName: string | null = 'x', isAdmin = false) =>
    lavagemAccess({ ...who(roleName, perms, isAdmin), capabilities: caps });

  it('o nome da função deixa de contar', () => {
    expect(f({ lavagem: 'view' }, 'Lavador')).toMatchObject({ canStartCycle: false, canCreate: false });
    expect(f({ lavagem: 'view' }, 'APV')).toMatchObject({ canViewRegistos: false });
    expect(f({ lavagem: 'edit' }, 'Preparador')).toMatchObject({ canQC: false });
  });

  it('cada ação vem da sua permissão', () => {
    expect(f({ lavagem: 'view', 'lavagem:iniciar': 'edit' })).toMatchObject({ canStartCycle: true, canCreate: true, canReschedule: false, canQC: false });
    expect(f({ lavagem: 'view', 'lavagem:reagendar': 'edit' })).toMatchObject({ canReschedule: true, canDelete: true, canCreate: true, canStartCycle: false });
    expect(f({ lavagem: 'view', 'lavagem:qualidade': 'edit' })).toMatchObject({ canQC: true, canCreate: false, canReschedule: false });
    expect(f({ lavagem: 'view', 'lavagem:registos': 'edit' })).toMatchObject({ canViewRegistos: true, canCreate: false });
  });

  it('edição do tab continua a permitir reagendar e apagar', () => {
    expect(f({ lavagem: 'edit' })).toMatchObject({ canReschedule: true, canDelete: true, canCreate: true, canStartCycle: false, canQC: false });
  });

  it('o administrador tem tudo; só ele exporta', () => {
    expect(f({}, 'Administrador', true)).toEqual({
      canReschedule: true, canStartCycle: true, canCreate: true, canQC: true,
      canExport: true, canViewRegistos: true, canDelete: true,
    });
    expect(f({ lavagem: 'edit', 'lavagem:iniciar': 'edit' }).canExport).toBe(false);
  });
});

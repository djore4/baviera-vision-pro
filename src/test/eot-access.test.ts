import { describe, it, expect } from 'vitest';
import { eotIsDirector } from '@/lib/eot-access';

const view = (perms: Record<string, 'view' | 'edit'>, isAdmin = false) =>
  (tab: string) => isAdmin || perms[tab] !== undefined;

/* A regra de useEotScope.ts ANTES de passar a permissão explícita (oráculo). */
const oldRule = (isAdmin: boolean, roleName: string | null) =>
  isAdmin || (!!roleName && new Set(['Finance']).has(roleName));

const ROLES = ['Finance', 'Vendedor VN', 'Vendedor VU', 'APV', 'Secretaria', 'Genius', null];

describe('eotIsDirector — base de dados ainda não migrada (regra antiga por nome)', () => {
  const capabilities = { lavagemGranular: false, eotGranular: false };

  it.each(ROLES)('%s: igual à regra antiga, admin ou não', roleName => {
    for (const isAdmin of [false, true]) {
      expect(eotIsDirector({ isAdmin, roleName, capabilities, canView: view({}, isAdmin) }))
        .toBe(oldRule(isAdmin, roleName));
    }
  });

  it('a permissão nova ainda não conta (a base de dados não a conhece)', () => {
    expect(eotIsDirector({ isAdmin: false, roleName: 'Vendedor VN', capabilities, canView: view({ 'end-of-term:todos': 'edit' }) })).toBe(false);
  });
});

describe('eotIsDirector — base de dados migrada (permissão por função)', () => {
  const capabilities = { lavagemGranular: true, eotGranular: true };

  it('o nome da função deixa de contar: só a permissão "end-of-term:todos"', () => {
    expect(eotIsDirector({ isAdmin: false, roleName: 'Finance', capabilities, canView: view({ 'end-of-term': 'edit' }) })).toBe(false);
    expect(eotIsDirector({ isAdmin: false, roleName: 'Outra', capabilities, canView: view({ 'end-of-term': 'edit', 'end-of-term:todos': 'edit' }) })).toBe(true);
  });

  it('o Finance migrado (com a permissão) continua a ver tudo', () => {
    expect(eotIsDirector({ isAdmin: false, roleName: 'Finance', capabilities, canView: view({ 'end-of-term': 'edit', 'end-of-term:todos': 'edit' }) })).toBe(true);
  });

  it('um vendedor sem a permissão só vê os seus', () => {
    expect(eotIsDirector({ isAdmin: false, roleName: 'Vendedor VN', capabilities, canView: view({ 'end-of-term': 'edit' }) })).toBe(false);
  });

  it('o administrador vê sempre tudo', () => {
    expect(eotIsDirector({ isAdmin: true, roleName: 'Administrador', capabilities, canView: view({}, true) })).toBe(true);
  });
});

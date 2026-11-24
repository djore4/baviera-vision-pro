import { describe, it, expect } from 'vitest';
import { nivelDaFuncao, type AppRole } from '@/lib/permissions';
import { acessoEfetivo } from '@/lib/role-matrix';

describe('acessoEfetivo', () => {
  const role: AppRole = { name: 'M', is_admin: false,
    permissions_matriz: { Aveiro: { 'BMW VN': { retails: 'edit' }, _: { retails: 'view' } }, Porto: { 'BMW VN': { retails: 'view' } }, _: { _: { wip: 'view' } } } };
  it('coincide com nivelDaFuncao em todas as combinações', () => {
    for (const locais of [[], ['Aveiro'], ['Porto'], ['Porto', 'Aveiro'], ['Maia']]) for (const equipa of ['BMW VN', 'BMW VU', null]) for (const tab of ['retails', 'wip']) {
      expect(acessoEfetivo(role, locais, tab, { equipa }).nivel).toBe(nivelDaFuncao(role, locais, tab, { equipa }));
    }
  });
  it('explica de que célula vem o nível', () => {
    expect(acessoEfetivo(role, ['Aveiro'], 'retails', { equipa: 'BMW VN' })).toEqual({ nivel: 'edit', origem: 'Perfil · Aveiro · BMW VN' });
    expect(acessoEfetivo(role, ['Porto'], 'retails', { equipa: null })).toEqual({ nivel: 'none', origem: 'Perfil · Porto · sem equipa' });
    expect(acessoEfetivo(role, [], 'wip', {}).origem).toBe('Perfil · sem local · sem equipa');
    expect(acessoEfetivo(null, [], 'wip').origem).toBe('Sem perfil');
  });
});

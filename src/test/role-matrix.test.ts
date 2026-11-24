import { describe, it, expect } from 'vitest';
import { nivelDaFuncao, type AppRole, type AccessLevel } from '@/lib/permissions';
import { acessoEfetivo } from '@/lib/role-matrix';

describe('acessoEfetivo: igual a nivelDaFuncao, com a origem', () => {
  const role: AppRole = {
    name: 'V', is_admin: false,
    permissions: { retails: 'view', funil: 'view', 'end-of-term': 'edit', lavagem: 'view' },
    permissions_local: { Porto: { retails: 'edit', funil: 'view' }, Maia: {} },
    permissions_equipa: { 'BMW VN': { funil: 'edit', stock: 'none' }, 'BMW VU': {} },
  };
  const tabs = ['retails', 'funil', 'end-of-term', 'lavagem', 'stock', 'demos'];
  const casos: { locais: string[]; equipa: string | null }[] = [
    { locais: [], equipa: null }, { locais: ['Aveiro'], equipa: null }, { locais: ['Porto'], equipa: 'BMW VN' },
    { locais: ['Maia'], equipa: 'BMW VN' }, { locais: ['Feira'], equipa: 'BMW VN' }, { locais: ['Porto', 'Feira'], equipa: 'BMW VU' },
    { locais: ['Aveiro', 'Porto'], equipa: 'Motorrad' }, { locais: [], equipa: 'BMW VN' },
  ];
  it('o nível coincide em todos os casos', () => {
    for (const c of casos) for (const t of tabs) {
      expect(acessoEfetivo(role, c.locais, t, { equipa: c.equipa, tabsPorLocal: ['demos'] }).nivel as AccessLevel, `${c.locais}|${c.equipa}|${t}`)
        .toBe(nivelDaFuncao(role, c.locais, t, { equipa: c.equipa, tabsPorLocal: ['demos'] }));
    }
  });
  it('explica a origem', () => {
    expect(acessoEfetivo(role, ['Porto'], 'funil', { equipa: 'BMW VN' })).toEqual({ nivel: 'edit', origem: 'Equipa BMW VN' });
    expect(acessoEfetivo(role, ['Porto'], 'retails', { equipa: 'BMW VN' }).origem).toBe('Matriz do local Porto');
    expect(acessoEfetivo(role, ['Feira'], 'funil', {}).nivel).toBe('none');
    expect(acessoEfetivo(role, ['Feira'], 'funil', {}).origem).toMatch(/não tem matriz própria/);
    expect(acessoEfetivo(role, ['Aveiro'], 'retails', {}).origem).toMatch(/Aveiro sem matriz própria/);
    expect(acessoEfetivo(null, [], 'funil').origem).toBe('Sem função');
  });
});

describe('matriz', () => {
  const role: AppRole = { name: 'M', is_admin: false, modelo_matriz: true, permissions: {},
    permissions_matriz: { Aveiro: { 'BMW VN': { retails: 'edit' }, _: { retails: 'view' } }, Porto: { 'BMW VN': { retails: 'view' } }, _: { _: { wip: 'view' } } } };
  it('acessoEfetivo coincide com nivelDaFuncao e explica a célula', () => {
    for (const locais of [[], ['Aveiro'], ['Porto'], ['Porto', 'Aveiro'], ['Maia']]) for (const equipa of ['BMW VN', 'BMW VU', null]) for (const tab of ['retails', 'wip']) {
      expect(acessoEfetivo(role, locais, tab, { equipa }).nivel).toBe(nivelDaFuncao(role, locais, tab, { equipa }));
    }
    expect(acessoEfetivo(role, ['Aveiro'], 'retails', { equipa: 'BMW VN' })).toEqual({ nivel: 'edit', origem: 'Perfil · Aveiro · BMW VN' });
    expect(acessoEfetivo(role, ['Porto'], 'retails', { equipa: null })).toEqual({ nivel: 'none', origem: 'Perfil · Porto · sem equipa' });
    expect(acessoEfetivo(role, [], 'wip', {}).origem).toBe('Perfil · sem local · sem equipa');
  });
});

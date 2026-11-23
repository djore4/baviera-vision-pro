import { describe, it, expect } from 'vitest';
import { nivelDaFuncao, type AppRole, type AccessLevel } from '@/lib/permissions';
import { acessoEfetivo, diferentesDoMaioritario, proximoNivel, proximoNivelEquipa, nivelMaioritario } from '@/lib/role-matrix';

describe('ciclos de nível', () => {
  it('local: sem acesso → consulta → edição → sem acesso; permissão fina alterna', () => {
    expect(proximoNivel('none')).toBe('view'); expect(proximoNivel('view')).toBe('edit'); expect(proximoNivel('edit')).toBe('none');
    expect(proximoNivel('none', true)).toBe('edit'); expect(proximoNivel('edit', true)).toBe('none');
  });
  it('equipa: herda (undefined) → sem acesso → consulta → edição → herda', () => {
    expect(proximoNivelEquipa(undefined)).toBe('none'); expect(proximoNivelEquipa('none')).toBe('view');
    expect(proximoNivelEquipa('view')).toBe('edit'); expect(proximoNivelEquipa('edit')).toBeUndefined();
    expect(proximoNivelEquipa(undefined, true)).toBe('none'); expect(proximoNivelEquipa('none', true)).toBe('edit'); expect(proximoNivelEquipa('edit', true)).toBeUndefined();
  });
});

describe('diferenças', () => {
  it('maioritário (empate: o mais alto) e destaque dos que divergem', () => {
    expect(nivelMaioritario(['view', 'view', 'edit'])).toBe('view');
    expect(nivelMaioritario(['view', 'edit'])).toBe('edit');
    expect(diferentesDoMaioritario(['view', 'view', 'none', 'view'])).toEqual([false, false, true, false]);
    expect(diferentesDoMaioritario(['edit', 'edit'])).toEqual([false, false]);
  });
});

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

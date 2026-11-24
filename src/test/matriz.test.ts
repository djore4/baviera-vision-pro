import { describe, it, expect } from 'vitest';
import { definir, copiarLocal, iguais, limpa, proximoNivel, nivelMaximo } from '@/lib/matriz';
import { nivelDaFuncao, nivelMatriz, permissoesDaEquipa, funcaoDaEquipa, EQUIPAS_DA_MATRIZ, type AppRole, type Matriz } from '@/lib/permissions';
import { EQUIPAS } from '@/lib/cartao-go';

describe('operações sobre a matriz', () => {
  it('o clique percorre sem acesso → consulta → edição → sem acesso', () => {
    expect([proximoNivel('none'), proximoNivel('view'), proximoNivel('edit')]).toEqual(['view', 'edit', 'none']);
  });
  it('definir muda só as células pedidas e "none" apaga (sem deixar locais/equipas vazios)', () => {
    let m: Matriz = definir({}, ['Porto', 'Gaia'], ['BMW VN', '_'], ['funil', 'wip'], 'edit');
    expect(m.Porto['BMW VN']).toEqual({ funil: 'edit', wip: 'edit' });
    expect(m.Gaia._).toEqual({ funil: 'edit', wip: 'edit' });
    m = definir(m, ['Porto'], ['BMW VN'], ['funil', 'wip'], 'none');
    expect(m.Porto['BMW VN']).toBeUndefined();
    expect(m.Porto._).toBeDefined();
    m = definir(m, ['Porto'], ['_'], ['funil', 'wip'], 'none');
    expect(m.Porto).toBeUndefined();                 // nada sobra vazio
    expect(m.Gaia['BMW VN']).toBeDefined();
  });
  it('copiar local leva todas as equipas e é independente do original', () => {
    const m = definir({}, ['Porto'], ['BMW VN', 'BMW VU'], ['funil'], 'view');
    const c = copiarLocal(m, 'Porto', 'Maia');
    expect(c.Maia).toEqual(m.Porto);
    expect(c.Maia).not.toBe(m.Porto);
    expect(copiarLocal(c, 'Feira', 'Maia').Maia).toBeUndefined(); // copiar um local vazio esvazia o destino
  });
  it('comparar ignora níveis none e a ordem das chaves', () => {
    expect(iguais({ Porto: { _: { a: 'view', b: 'none' } } }, { Porto: { _: { a: 'view' } } })).toBe(true);
    expect(iguais({ Porto: { _: { a: 'view' } } }, { Porto: { _: { a: 'edit' } } })).toBe(false);
    expect(limpa({ Porto: { _: { a: 'none' } } })).toEqual({});
    expect(nivelMaximo({ Porto: { _: { a: 'view' } }, Gaia: { _: { a: 'edit' } } }, 'a')).toBe('edit');
  });
});

describe('motor da matriz (espelha role_tab_level_matriz)', () => {
  const role: AppRole = { name: 'V', is_admin: false, modelo_matriz: true, permissions: {},
    permissions_matriz: {
      Aveiro: { 'BMW VN': { retails: 'edit', funil: 'edit' }, _: { retails: 'view' } },
      Porto: { 'BMW VN': { retails: 'view' }, 'BMW VU': { stock: 'edit' } },
      _: { _: { wip: 'view' } },
    },
    // lixo do modelo antigo que já não conta
    permissions_local: { Porto: { funil: 'edit' } }, permissions_equipa: { 'BMW VN': { stock: 'edit' } } };
  it('cada célula manda; sem equipa ou equipa desconhecida = coluna "_"; sem local = local "_"', () => {
    expect(nivelMatriz(role, ['Aveiro'], 'BMW VN', 'retails')).toBe('edit');
    expect(nivelMatriz(role, ['Aveiro'], null, 'retails')).toBe('view');
    expect(nivelMatriz(role, ['Aveiro'], 'Outra', 'retails')).toBe('view');
    expect(nivelMatriz(role, ['Porto'], 'BMW VU', 'stock')).toBe('edit');
    expect(nivelMatriz(role, ['Porto'], 'BMW VN', 'funil')).toBe('none');
    expect(nivelMatriz(role, [], 'BMW VN', 'wip')).toBe('none');
    expect(nivelMatriz(role, [], null, 'wip')).toBe('view');
  });
  it('vários locais = o nível mais alto; nivelDaFuncao delega na matriz', () => {
    expect(nivelMatriz(role, ['Porto', 'Aveiro'], 'BMW VN', 'retails')).toBe('edit');
    expect(nivelDaFuncao(role, ['Porto', 'Aveiro'], 'retails', { equipa: 'BMW VN' })).toBe('edit');
    expect(nivelDaFuncao(role, ['Porto'], 'stock', { equipa: 'BMW VN' })).toBe('none');
  });
  it('funcaoDaEquipa devolve os tabs da equipa em qualquer local', () => {
    expect(permissoesDaEquipa(role, 'BMW VN')).toEqual({ retails: 'edit', funil: 'edit' });
    expect(funcaoDaEquipa(role, 'BMW VU')?.permissions).toEqual({ stock: 'edit' });
  });
  it('as equipas da matriz são as da plataforma', () => {
    expect([...EQUIPAS_DA_MATRIZ]).toEqual([...EQUIPAS]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  chavesSpecs, getSerie, modelosDaSerie, motorizacaoValida, ordenarSecoes, pesquisarModelos, seriesPresentes,
  type Modelo, type Opcional,
} from '@/lib/produto';
import { TABS, TAB_BY_PATH } from '@/lib/permissions';

const m = (id: string, nome: string, codigo = id): Modelo => ({ id, nome, codigo });

describe('Produto — séries e pesquisa', () => {
  it('classifica os modelos por série', () => {
    expect(getSerie('BMW Série 3 Touring')).toBe('3');
    expect(getSerie('BMW M135')).toBe('1');
    expect(getSerie('BMW i4')).toBe('4');
    expect(getSerie('BMW iX3')).toBe('X');
    expect(getSerie('BMW Z4')).toBe('Z');
    expect(getSerie('MINI Cooper')).toBe('Outros');
  });

  it('séries presentes saem pela ordem de apresentação e "Todos" mostra tudo', () => {
    const ms = [m('a', 'BMW X5'), m('b', 'BMW Série 1'), m('c', 'MINI Cooper')];
    expect(seriesPresentes(ms)).toEqual(['1', 'X', 'Outros']);
    expect(modelosDaSerie(ms, 'Todos')).toHaveLength(3);
    expect(modelosDaSerie(ms, 'X').map(x => x.id)).toEqual(['a']);
  });

  it('pesquisa por nome ou código, sem distinguir maiúsculas', () => {
    const ms = [m('a', 'BMW X5', 'G05'), m('b', 'BMW X3', 'G45')];
    expect(pesquisarModelos(ms, ' x5 ').map(x => x.id)).toEqual(['a']);
    expect(pesquisarModelos(ms, 'g45').map(x => x.id)).toEqual(['b']);
  });
});

describe('Produto — opcionais e specs', () => {
  it('descarta colunas de preço que não são motorizações', () => {
    expect(motorizacaoValida('xDrive30d')).toBe(true);
    expect(motorizacaoValida('PVP Recomendado')).toBe(false);
    expect(motorizacaoValida('Preço c/ IVA')).toBe(false);
    expect(motorizacaoValida('  ')).toBe(false);
  });

  it('ordena secções pelo número inicial (10 depois de 2)', () => {
    const o = (secao: string) => ({ secao }) as Opcional;
    expect(ordenarSecoes([o('10 Extras'), o('2 Interior'), o('Outros'), o('2 Interior')]))
      .toEqual(['2 Interior', '10 Extras', 'Outros']);
  });

  it('junta as chaves das specs pela ordem em que aparecem', () => {
    const cache = { a: { Peso: '1', Potência: '2' }, b: { Potência: '3', Cor: '4' } };
    expect(chavesSpecs(['a', 'b'], cache)).toEqual(['Peso', 'Potência', 'Cor']);
    expect(chavesSpecs(['x'], cache)).toEqual([]);
  });
});

describe('Produto — tab Transversal', () => {
  it('existe na área Transversal e é atribuível por função', () => {
    const t = TABS.find(x => x.key === 'produto');
    expect(t?.area).toBe('apv');
    expect(TAB_BY_PATH['/produto']?.key).toBe('produto');
  });
});

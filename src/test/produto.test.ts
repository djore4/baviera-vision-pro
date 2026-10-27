import { describe, it, expect } from 'vitest';
import {
  CALC_DEFAULTS, calcular, formatarTempo, linhasOutras, linhasPrincipais, valorLinha,
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

describe('Produto — comparador', () => {
  const a = { 'Potência combinada comunicada, cv': '340', Tração: 'Integral', 'Cilindrada, cm3': '2998' };
  const b = { 'Potência do sistema motor (acumulado), cv': '313', Tração: 'Integral', 'Capacidade líquida da bateria de alta tensão, kWh': '80' };

  it('valorLinha usa a primeira chave com valor', () => {
    expect(valorLinha(b, ['Potência combinada comunicada, cv', 'Potência do sistema motor (acumulado), cv'])).toBe('313');
    expect(valorLinha(a, ['Não existe'])).toBe('—');
  });

  it('linhas principais: só as que têm valor e marcam as diferenças', () => {
    const l = linhasPrincipais([a, b]);
    const get = (n: string) => l.find(x => x.label === n);
    expect(get('Potência (cv)')).toMatchObject({ valores: ['340', '313'], difere: true });
    expect(get('Tração')).toMatchObject({ valores: ['Integral', 'Integral'], difere: false });
    expect(get('Bateria líquida (kWh)')?.valores).toEqual(['—', '80']);
    expect(get('Velocidade Máxima (km/h)')).toBeUndefined();
  });

  it('o que não é linha principal vai para "outras"', () => {
    expect(linhasOutras([a, b]).map(x => x.label)).toEqual(['Cilindrada, cm3']);
  });

  it('variações de carregamento só entram se existirem', () => {
    const e = { 'Variação de carregamento DC 1': 'DC charging with 11 kW', 'Tempo de carregamento DC 1 (10-80%), h': '0.5' };
    const l = linhasPrincipais([e, a]);
    expect(l.find(x => x.label.startsWith('10-80%'))?.valores).toEqual(['0.5', '—']);
  });
});

describe('Produto — calculadora', () => {
  it('75 kWh, 10→100 % a 11 kW', () => {
    const r = calcular(CALC_DEFAULTS);
    expect(r.valido).toBe(true);
    expect(r.energia).toBeCloseTo(67.5);
    expect(r.horas).toBeCloseTo(67.5 / 11);
    expect(r.custoCarga).toBeCloseTo(67.5 * 0.15);
    // autonomia = 75/20*100 = 375 km; custo/100 = custo / 375 * 100
    expect(r.custoPor100km).toBeCloseTo((67.5 * 0.15) / 375 * 100);
    expect(r.energiaViagem).toBeCloseTo(20);
    expect(r.custoViagem).toBeCloseTo(3);
  });

  it('estado final <= inicial é inválido mas a viagem continua a calcular', () => {
    const r = calcular({ ...CALC_DEFAULTS, socIni: 50, socFin: 50 });
    expect(r.valido).toBe(false);
    expect(r.custoViagem).toBeCloseTo(3);
  });

  it('formata o tempo', () => {
    expect(formatarTempo(0)).toBe('—');
    expect(formatarTempo(0.5)).toBe('30 min');
    expect(formatarTempo(2)).toBe('2h');
    expect(formatarTempo(6.1364)).toBe('6h 8min');
    expect(formatarTempo(1.9999)).toBe('2h');
  });
});

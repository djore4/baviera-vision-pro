import { describe, it, expect } from 'vitest';
import { chassisCurto, formatMatricula, matriculaCompacta, parseNum } from '@/lib/viaturaFormat';

describe('chassisCurto', () => {
  it('mostra só os últimos 7 caracteres de um VIN completo', () => {
    expect(chassisCurto('WBA11EF0605A12345')).toBe('5A12345');
  });
  it('mantém chassis já curtos', () => {
    expect(chassisCurto('cw43657')).toBe('CW43657');
    expect(chassisCurto(null)).toBe('');
  });
});

describe('formatMatricula', () => {
  it('insere hífenes em AA00BB', () => {
    expect(formatMatricula('CH59DD')).toBe('CH-59-DD');
    expect(formatMatricula('bz 01 gb')).toBe('BZ-01-GB');
  });
  it('mantém o formato já corrigido', () => {
    expect(formatMatricula('BZ-66-NU')).toBe('BZ-66-NU');
  });
  it('não mexe em formatos desconhecidos', () => {
    expect(formatMatricula('L-12345')).toBe('L-12345');
    expect(formatMatricula(null)).toBe('');
  });
});

describe('parseNum', () => {
  it('aceita formato PT com milhares e vírgula', () => {
    expect(Number(parseNum('76.874,50 €', 'eur'))).toBe(76874.5);
    expect(Number(parseNum('76.874', 'eur'))).toBe(76874);
  });
  it('ponto decimal em percentagens', () => {
    expect(Number(parseNum('2.5', 'pct'))).toBe(2.5);
    expect(Number(parseNum('8 %', 'pct'))).toBe(8);
    expect(Number(parseNum('2,33', 'pct'))).toBe(2.33);
  });
});

describe('matriculaCompacta', () => {
  it('remove hífenes de matrículas PT', () => {
    expect(matriculaCompacta('BZ-66-NU')).toBe('BZ66NU');
    expect(matriculaCompacta('ch59dd')).toBe('CH59DD');
  });
  it('não mexe noutros formatos', () => {
    expect(matriculaCompacta('L-12345')).toBe('L-12345');
  });
});

import { normalizarMatricula } from '@/lib/viaturaFormat';
describe('normalizarMatricula (adicionar viatura)', () => {
  it('normaliza para AA-00-BB e recusa o que não tem 6 caracteres', () => {
    expect(normalizarMatricula('ab12cd')).toBe('AB-12-CD');
    expect(normalizarMatricula(' ab-12-cd ')).toBe('AB-12-CD');
    expect(normalizarMatricula('AB12')).toBeNull();
    expect(normalizarMatricula('')).toBeNull();
    expect(normalizarMatricula(null)).toBeNull();
  });
});

import { pesquisaCorresponde, textoBusca } from '@/lib/viaturaFormat';

describe('pesquisa de viaturas', () => {
  it('a matrícula pesquisa-se igual com ou sem hífenes, espaços e maiúsculas', () => {
    const campos = ['Série 5', 'CH-99-AQ', 'WBA0000FX46063'];
    for (const q of ['CH99AQ', 'CH-99-AQ', 'ch 99 aq', 'ch99', '99-aq', ' CH99AQ ']) expect(pesquisaCorresponde(q, campos), q).toBe(true);
    for (const q of ['CH98AQ', 'zz']) expect(pesquisaCorresponde(q, campos), q).toBe(false);
  });

  it('funciona com a matrícula guardada sem hífenes', () => {
    expect(pesquisaCorresponde('CH-99-AQ', ['CH99AQ'])).toBe(true);
    expect(pesquisaCorresponde('CH99AQ', ['CH99AQ'])).toBe(true);
  });

  it('ignora acentos e pesquisa vazia devolve tudo', () => {
    expect(pesquisaCorresponde('serie 5', ['Série 5'])).toBe(true);
    expect(pesquisaCorresponde('', ['x'])).toBe(true);
    expect(textoBusca('Série-5 / A')).toBe('serie5a');
  });

  it('pontuação sozinha não corresponde a tudo', () => {
    expect(pesquisaCorresponde('-', ['CH99AQ'])).toBe(false);
  });
});

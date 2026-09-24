import { describe, it, expect } from 'vitest';
import { chassisCurto, formatMatricula, parseNum } from '@/lib/viaturaFormat';

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

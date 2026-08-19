import { describe, it, expect } from 'vitest';
import { buildMatriculaRequest, saudacao } from '@/lib/matricula';

describe('saudacao', () => {
  it('usa "Bom dia" antes das 12h', () => {
    expect(saudacao(new Date('2026-08-19T09:00:00'))).toBe('Bom dia');
  });
  it('usa "Boa tarde" entre as 12h e as 20h', () => {
    expect(saudacao(new Date('2026-08-19T15:30:00'))).toBe('Boa tarde');
  });
  it('usa "Boa noite" a partir das 20h', () => {
    expect(saudacao(new Date('2026-08-19T21:00:00'))).toBe('Boa noite');
  });
});

describe('buildMatriculaRequest', () => {
  const rec = {
    cliente: 'Carlos Ferreira de Melo',
    enc: '8282632',
    chas: 'WB10K8108T6N23935',
    biz: '568511',
    fin: 'FS',
  };

  it('inclui todos os campos da viatura', () => {
    const out = buildMatriculaRequest(rec, new Date('2026-08-19T10:00:00'));
    expect(out).toContain('Cliente: Carlos Ferreira de Melo');
    expect(out).toContain('Encomenda: 8282632');
    expect(out).toContain('Chassis: WB10K8108T6N23935');
    expect(out).toContain('Bizagi: 568511');
    expect(out).toContain('Pagamento: FS');
  });

  it('usa o nome do cliente no assunto', () => {
    const out = buildMatriculaRequest(rec, new Date('2026-08-19T10:00:00'));
    expect(out).toContain('Assunto: *Pedido de matrícula* | *Carlos Ferreira de Melo*');
  });

  it('preenche destinatários e CC fixos', () => {
    const out = buildMatriculaRequest(rec, new Date('2026-08-19T10:00:00'));
    expect(out).toContain('Destinatários: sonia.carvalho@caetano.pt; lurdes.aguiar@caetano.pt');
    expect(out).toContain('CC: jose.mesquita@caetano.pt; joaocarlos.duarte@caetano.pt');
  });

  it('ajusta a saudação à hora do copy', () => {
    expect(buildMatriculaRequest(rec, new Date('2026-08-19T09:00:00'))).toContain('Bom dia,');
    expect(buildMatriculaRequest(rec, new Date('2026-08-19T16:00:00'))).toContain('Boa tarde,');
  });

  it('deixa o campo vazio quando não há valor', () => {
    const out = buildMatriculaRequest({ cliente: 'X', enc: null, chas: '', biz: undefined });
    expect(out).toContain('Encomenda: ');
    expect(out).toContain('Chassis: ');
    expect(out).toContain('Bizagi: ');
  });
});

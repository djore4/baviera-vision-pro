import { describe, it, expect } from 'vitest';
import {
  casar, ehMatriculaPedida, extrairMatricula, extrairReferencias, parteNova, processar,
  type Mensagem, type RegistoVN,
} from '../../supabase/functions/_shared/matriculas-email';

const reg = (id: string, over: Partial<RegistoVN> = {}): RegistoVN => ({
  id, cliente: `Cliente ${id}`, enc: `ENC${id}`, chas: `WBA0000000000000${id}`, mat: null, status: 'Carteira', mat_pedida_em: null, ...over,
});

const pedido = (r: RegistoVN) =>
  `Solicito que avancem com o seguinte pedido de matrícula:\n\nCliente: ${r.cliente}\nEncomenda: ${r.enc}\nChassis: ${r.chas}\nBizagi: 1\n`;
const resposta = (nova: string, r: RegistoVN) =>
  `${nova}\n\nDe: Ana <ana@x.pt>\nEnviado: segunda-feira\nPara: stand\nAssunto: Pedido de matrícula | ${r.cliente}\n\n${pedido(r)}`;
const msg = (id: string, r: RegistoVN, nova: string, quando: string): Mensagem => ({
  id, assunto: `RE: Pedido de matrícula | ${r.cliente}`, corpo: resposta(nova, r), recebidaEm: quando,
});

describe('leitura das respostas ao pedido de matrícula', () => {
  it('parteNova corta na conversa citada', () => {
    expect(parteNova('Matrícula pedida.\n\nDe: Ana\nOlá')).toBe('Matrícula pedida.');
    expect(parteNova('Ok\n> citado\nmais')).toBe('Ok');
  });

  it('ehMatriculaPedida ignora acentos e maiúsculas, e não apanha o texto do pedido', () => {
    expect(ehMatriculaPedida('Matricula pedida')).toBe(true);
    expect(ehMatriculaPedida('MATRÍCULA  PEDIDA!')).toBe(true);
    expect(ehMatriculaPedida('Solicito pedido de matrícula')).toBe(false);
  });

  it('extrairMatricula: formatos PT, com e sem hífens; recusa falsos positivos', () => {
    expect(extrairMatricula('A matrícula é AB-12-CD.')).toBe('AB-12-CD');
    expect(extrairMatricula('12-AB-34')).toBe('12-AB-34');
    expect(extrairMatricula('12-34-AB')).toBe('12-34-AB');
    expect(extrairMatricula('AB12CD')).toBe('AB-12-CD');
    expect(extrairMatricula('Data 12-11-24')).toBeNull();           // só números
    expect(extrairMatricula('Olá, tudo bem')).toBeNull();
  });

  it('extrairReferencias lê chassis, encomenda e cliente do assunto', () => {
    const r = reg('1');
    const ref = extrairReferencias(`RE: Pedido de matrícula | ${r.cliente}`, pedido(r));
    expect(ref).toEqual({ chassis: r.chas, encomenda: r.enc, cliente: r.cliente });
  });

  it('casar: chassis > encomenda > cliente único; ambiguidade não casa', () => {
    const a = reg('1'), b = reg('2');
    expect(casar({ chassis: a.chas, encomenda: null, cliente: null }, [a, b])).toMatchObject({ por: 'chassis', registo: a });
    expect(casar({ chassis: null, encomenda: b.enc, cliente: null }, [a, b])).toMatchObject({ por: 'encomenda', registo: b });
    expect(casar({ chassis: null, encomenda: null, cliente: 'cliente 1' }, [a, b])).toMatchObject({ por: 'cliente', registo: a });
    const dup = [reg('1'), reg('3', { cliente: 'Cliente 1' })];
    expect(casar({ chassis: null, encomenda: null, cliente: 'Cliente 1' }, dup).registo).toBeNull();
    expect(casar({ chassis: null, encomenda: null, cliente: 'Zé' }, [a]).registo).toBeNull();
  });

  it('o pedido sem resposta não conta; "matrícula pedida" conta', () => {
    const r = reg('1');
    const so = processar([{ id: 'm0', assunto: `Pedido de matrícula | ${r.cliente}`, corpo: pedido(r), recebidaEm: '2026-11-01T09:00:00Z' }], [r]);
    expect(so.alteracoes).toEqual([]);
    const ok = processar([msg('m1', r, 'Matrícula pedida.', '2026-11-02T09:00:00Z')], [r]);
    expect(ok.pedidas).toBe(1);
    expect(ok.alteracoes).toEqual([{ id: '1', mat_pedida_em: '2026-11-02T09:00:00Z' }]);
  });

  it('a matrícula só é preenchida depois de "matrícula pedida" (mesmo sync ou anterior)', () => {
    const r = reg('1');
    const sem = processar([msg('m1', r, 'A matrícula é AB-12-CD', '2026-11-03T09:00:00Z')], [r]);
    expect(sem.alteracoes).toEqual([]);
    expect(sem.ignoradas[0].motivo).toMatch(/sem resposta/);

    const mesmoSync = processar([
      msg('m1', r, 'Matrícula pedida', '2026-11-02T09:00:00Z'),
      msg('m2', r, 'Matrícula: AB-12-CD', '2026-11-03T09:00:00Z'),
    ], [r]);
    expect(mesmoSync.alteracoes).toEqual([{ id: '1', mat_pedida_em: '2026-11-02T09:00:00Z', mat: 'AB-12-CD' }]);

    const jaPedida = reg('1', { mat_pedida_em: '2026-11-02T09:00:00Z' });
    const depois = processar([msg('m2', jaPedida, 'Matrícula: AB-12-CD', '2026-11-03T09:00:00Z')], [jaPedida]);
    expect(depois.alteracoes).toEqual([{ id: '1', mat: 'AB-12-CD' }]);
  });

  it('é idempotente e não sobrescreve uma matrícula diferente', () => {
    const feito = reg('1', { mat_pedida_em: '2026-11-02T09:00:00Z', mat: 'AB-12-CD' });
    const msgs = [msg('m1', feito, 'Matrícula pedida', '2026-11-02T09:00:00Z'), msg('m2', feito, 'AB-12-CD', '2026-11-03T09:00:00Z')];
    expect(processar(msgs, [feito]).alteracoes).toEqual([]);
    const outra = processar([msg('m3', feito, 'Afinal é XY-98-ZW', '2026-11-04T09:00:00Z')], [feito]);
    expect(outra.alteracoes).toEqual([]);
    expect(outra.ignoradas[0].motivo).toMatch(/já tem matrícula/);
  });

  it('mensagens sem negócio correspondente ficam por tratar', () => {
    const r = reg('1');
    const out = processar([msg('m1', r, 'Matrícula pedida', '2026-11-02T09:00:00Z')], [reg('9')]);
    expect(out.alteracoes).toEqual([]);
    expect(out.ignoradas).toHaveLength(1);
  });
});

import { describe, it, expect } from 'vitest';
import {
  aplicarAlteracoes, casar, chassisCompativeis, detalhar, ehEmailDiario, ehMatriculaPedida, extrairMatricula, extrairReferencias,
  juntarAlteracoes, lerTabelaDiaria, normEnc, parteNova, processar, processarDiarios,
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

/* ── Email diário "Matriculas - Aveiro" (formato do Outlook, dados inventados) ── */
const cel = (v: string) => `<td style="padding:0"><p class="MsoNormal">${v}</p></td>`;
const lin = (...v: string[]) => `<tr style="height:14.4pt">${v.map(cel).join('')}</tr>`;
const DIARIO = `<div class="WordSection1"><table class="MsoNormalTable"><tbody>
  ${lin('Ponto de Venda', '52894-Caetano Aveiro')}
  ${lin('Data:03/11/2026')}
  ${lin('Nº Encomenda', 'NºChassis', 'Line', 'Matrícula', 'Data Matrícula', '&nbsp;', '&nbsp;')}
  ${lin('9710001', 'WBA71BX0X07W88199', '220i Active Tourer', 'AA26BB', '02/11/2026', 'Cliente Um, Lda &amp; Filhos', 'NC')}
  ${lin('9710002', 'WBY11HM0805841446', 'iX1 eDrive20', 'CC20DD', '02/11/2026', 'Cliente Dois', 'FS')}
  ${lin('0014762', 'WBA81HV0009555384', 'X5 40d xDrive', 'EE60FF', '30/10/2026', 'DEMO')}
</tbody></table><p>Obrigado,</p><table><tbody><tr><td>Secretaria Comercial</td></tr></tbody></table></div>`;

const regD = (id: string, over: Partial<RegistoVN> = {}): RegistoVN => ({
  id, cliente: `Cliente ${id}`, enc: '', chas: '', mat: null, status: 'Carteira', mat_pedida_em: null, dmat: null, ...over,
});
const diario = (html = DIARIO, recebidaEm = '2026-11-03T08:40:00Z') => ({ id: 'd', recebidaEm, html });

describe('email diário de matrículas', () => {
  it('reconhece o assunto', () => {
    expect(ehEmailDiario('Matriculas - Aveiro')).toBe(true);
    expect(ehEmailDiario('  Matrículas – Aveiro'.replace('–', '-'))).toBe(true);
    expect(ehEmailDiario('RE: Pedido de matrícula | X')).toBe(false);
  });

  it('lerTabelaDiaria lê só as linhas de dados (cabeçalho e assinatura ignorados) e decodifica entidades', () => {
    const l = lerTabelaDiaria(DIARIO);
    expect(l.map(x => x.enc)).toEqual(['9710001', '9710002', '0014762']);
    expect(l[0]).toEqual({ enc: '9710001', chas: 'WBA71BX0X07W88199', mat: 'AA-26-BB', dmat: '2026-11-02', nota: 'Cliente Um, Lda & Filhos' });
    expect(l[2]).toMatchObject({ mat: 'EE-60-FF', dmat: '2026-10-30', nota: 'DEMO' });
    expect(lerTabelaDiaria('<p>Bom dia</p>')).toEqual([]);
    expect(lerTabelaDiaria(DIARIO.replace('02/11/2026', '31/02/2026')).map(x => x.enc)).toEqual(['9710002', '0014762']);
  });

  it('encomendas e chassis comparam-se sem zeros à esquerda / pelo final', () => {
    expect(normEnc('0230244')).toBe('230244');
    expect(chassisCompativeis('WBA31HR010DA63287', 'DA63287')).toBe(true);
    expect(chassisCompativeis('WBA31HR010DA63287', 'DA63288')).toBe(false);
  });

  it('preenche matrícula, chassis completo e DMAT, sem mexer no estado', () => {
    const r = processarDiarios([diario()], [regD('1', { enc: '9710001', chas: '7W88199' })]);
    expect(r.alteracoes).toEqual([{ id: '1', mat: 'AA-26-BB', chas: 'WBA71BX0X07W88199', dmat: '2026-11-02' }]);
    expect(r).toMatchObject({ matriculas: 1, chassis: 1, datas: 1 });
  });

  it('a encomenda com zeros à esquerda emparelha com a registada sem eles; sem encomenda, vai pelo chassis', () => {
    expect(processarDiarios([diario()], [regD('d', { enc: '14762' })]).alteracoes[0]).toMatchObject({ id: 'd', mat: 'EE-60-FF' });
    expect(processarDiarios([diario()], [regD('c', { enc: 'OUTRA', chas: 'WBY11HM0805841446' })]).alteracoes[0]).toMatchObject({ id: 'c', mat: 'CC-20-DD' });
  });

  it('é idempotente: depois de aplicado não há nada a fazer', () => {
    const r1 = processarDiarios([diario()], [regD('1', { enc: '9710001' })]);
    const feito = aplicarAlteracoes([regD('1', { enc: '9710001' })], r1.alteracoes);
    expect(processarDiarios([diario()], feito).alteracoes).toEqual([]);
  });

  it('nunca sobrescreve matrícula ou chassis diferentes, nem toca em negócios ambíguos ou desconhecidos', () => {
    const mat = processarDiarios([diario()], [regD('1', { enc: '9710001', mat: 'ZZ-99-ZZ' })]);
    expect(mat.alteracoes).toEqual([]);
    expect(mat.ignoradas[0].motivo).toMatch(/já tem matrícula/);
    const chas = processarDiarios([diario()], [regD('1', { enc: '9710001', chas: 'WBA00000000000000' })]);
    expect(chas.alteracoes).toEqual([]);
    expect(chas.ignoradas[0].motivo).toMatch(/chassis diferente/);
    const dup = processarDiarios([diario()], [regD('a', { enc: '9710001' }), regD('b', { enc: '09710001' })]);
    expect(dup.alteracoes).toEqual([]);
    expect(dup.ignoradas.some(i => /vários/.test(i.motivo))).toBe(true);
    expect(processarDiarios([diario()], []).ignoradas).toHaveLength(3);
  });

  it('encadeia com as respostas ao pedido e descreve o que muda', () => {
    const r = regD('1', { enc: '9710001', cliente: 'Cliente Um', mat_pedida_em: null });
    const pedido = [{ id: '1', mat_pedida_em: '2026-11-02T17:00:00Z' }];
    const diarios = processarDiarios([diario()], aplicarAlteracoes([r], pedido));
    const todas = juntarAlteracoes(pedido, diarios.alteracoes);
    expect(todas).toEqual([{ id: '1', mat_pedida_em: '2026-11-02T17:00:00Z', mat: 'AA-26-BB', chas: 'WBA71BX0X07W88199', dmat: '2026-11-02' }]);
    const d = detalhar(todas, [r]);
    expect(d[0]).toMatchObject({ enc: '9710001', cliente: 'Cliente Um' });
    expect(d[0].campos).toEqual([
      { campo: 'Pedido de matrícula', de: '—', para: '02/11/2026' },
      { campo: 'Matrícula', de: '—', para: 'AA-26-BB' },
      { campo: 'Chassis', de: '—', para: 'WBA71BX0X07W88199' },
      { campo: 'DMAT', de: '—', para: '02/11/2026' },
    ]);
  });
});

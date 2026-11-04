import { describe, it, expect } from 'vitest';
import {
  chassisCompativeis, dataPt, dedupePlates, diaLisboa, isMatriculaPedida, normEnc, parsePedido, parsePlatesHtml,
  pedidosConfirmados, planSync, type PedidoMsg, type SyncRecord,
} from '@/lib/email-sync';

/* Email diário no formato real (tabela do Outlook), com dados inventados. A linha DEMO
 * não tem a última coluna e há uma linha de cabeçalho/assinatura à volta. */
const cell = (v: string) => `<td><p class="MsoNormal">${v}</p></td>`;
const linha = (...v: string[]) => `<tr>${v.map(cell).join('')}</tr>`;
const EMAIL_DIARIO = `
<div class="WordSection1"><table class="MsoNormalTable"><tbody>
  ${linha('Ponto de Venda', '52894-Caetano Aveiro')}
  ${linha('Data:03/11/2026')}
  ${linha('Nº Encomenda', 'NºChassis', 'Line', 'Matrícula', 'Data Matrícula', '&nbsp;', '&nbsp;')}
  ${linha('9710001', 'WBA71BX0X07W88199', '220i Active Tourer', 'AA26BB', '02/11/2026', 'Cliente Um, Lda', 'NC')}
  ${linha('9710002', 'WBY11HM0805841446', 'iX1 eDrive20', 'CC20DD', '02/11/2026', 'Cliente Dois', 'FS')}
  ${linha('0014762', 'WBA81HV0009555384', 'X5 40d xDrive', 'EE60FF', '30/10/2026', 'DEMO')}
</tbody></table>
<table><tbody><tr><td>Obrigado,</td></tr><tr><td>Secretaria Comercial</td></tr></tbody></table></div>`;

const reg = (o: Partial<SyncRecord> = {}): SyncRecord => ({
  id: 'r1', status: 'Carteira', enc: '9710001', chas: '', mat: '', biz: '', cliente: 'Cliente Um', dmat: null, ...o,
});

describe('normalização', () => {
  it('encomendas: zeros à esquerda não contam; texto fica em maiúsculas', () => {
    expect(normEnc('0230244')).toBe('230244');
    expect(normEnc(' 230244 ')).toBe('230244');
    expect(normEnc('e123')).toBe('E123');
    expect(normEnc(null)).toBe('');
  });
  it('chassis: o final de 7 caracteres é compatível com o VIN inteiro', () => {
    expect(chassisCompativeis('WBA31HR010DA63287', 'DA63287')).toBe(true);
    expect(chassisCompativeis('wba31hr010da63287', 'WBA31HR010DA63287')).toBe(true);
    expect(chassisCompativeis('WBA31HR010DA63287', 'DA63288')).toBe(false);
    expect(chassisCompativeis('', 'DA63287')).toBe(false);
  });
  it('datas pt e dia em Lisboa', () => {
    expect(dataPt('02/11/2026')).toBe('2026-11-02');
    expect(dataPt('31/02/2026')).toBeNull();
    // 23:30 UTC de agosto já é o dia seguinte em Lisboa (UTC+1).
    expect(diaLisboa('2026-08-10T23:30:00Z')).toBe('2026-08-11');
    expect(diaLisboa('2026-11-03T12:11:15Z')).toBe('2026-11-03');
  });
});

describe('parsePlatesHtml', () => {
  const rows = parsePlatesHtml(EMAIL_DIARIO, '2026-11-03T08:40:00Z');
  it('lê só as linhas de dados, ignorando cabeçalho, data e assinatura', () => {
    expect(rows.map(r => r.enc)).toEqual(['9710001', '9710002', '0014762']);
  });
  it('normaliza matrícula e data; cliente/DEMO e iniciais são opcionais', () => {
    expect(rows[0]).toMatchObject({ chas: 'WBA71BX0X07W88199', mat: 'AA-26-BB', dmat: '2026-11-02', nota: 'Cliente Um, Lda', resp: 'NC' });
    expect(rows[2]).toMatchObject({ mat: 'EE-60-FF', dmat: '2026-10-30', nota: 'DEMO', resp: '' });
  });
  it('HTML sem tabela de matrículas dá lista vazia', () => {
    expect(parsePlatesHtml('<p>Bom dia</p>')).toEqual([]);
  });
  it('a mais recente ganha quando a encomenda se repete', () => {
    const a = parsePlatesHtml(EMAIL_DIARIO, '2026-11-03T08:00:00Z');
    const b = parsePlatesHtml(EMAIL_DIARIO.replace('AA26BB', 'AA27BB'), '2026-11-04T08:00:00Z');
    const d = dedupePlates([...a, ...b]);
    expect(d).toHaveLength(3);
    expect(d.find(r => r.enc === '9710001')?.mat).toBe('AA-27-BB');
  });
});

describe('pedido de matrícula', () => {
  const CORPO = 'Boa tarde,\nSolicito que avancem com o seguinte pedido de matrícula:\nCliente: Cliente Um, Lda\nEncomenda: 9710001\nChassis: W88199X\nBizagi: 559094\nPagamento: PP\nRetoma: N';
  it('lê os campos', () => {
    expect(parsePedido(CORPO)).toEqual({ cliente: 'Cliente Um, Lda', enc: '9710001', chas: 'W88199X', biz: '559094' });
  });
  it('reconhece a confirmação e rejeita negações', () => {
    expect(isMatriculaPedida('Matrícula pedida.')).toBe(true);
    expect(isMatriculaPedida('Bom dia, matriculas pedidas')).toBe(true);
    expect(isMatriculaPedida('Matrícula já pedida!')).toBe(true);
    expect(isMatriculaPedida('Ainda não foi pedida a matrícula pedida pelo cliente.')).toBe(false);
    expect(isMatriculaPedida('Recebido, vamos tratar.')).toBe(false);
  });

  const SEC = 'secretaria@exemplo.pt';
  const msg = (o: Partial<PedidoMsg>): PedidoMsg => ({
    id: 'm', conversationId: 'c1', subject: 'Pedido de matrícula | Cliente Um', from: 'consultor@exemplo.pt',
    sentAt: '2026-11-02T17:29:00Z', text: CORPO, ...o,
  });

  it('só conta depois de a secretaria responder "matrícula pedida"', () => {
    const so = [msg({ id: 'a' })];
    expect(pedidosConfirmados(so, [SEC])).toEqual([]);
    // Resposta que não confirma.
    const naoConfirma = [...so, msg({ id: 'b', subject: 'RE: Pedido de matrícula | Cliente Um', from: SEC, sentAt: '2026-11-02T18:13:00Z', text: 'Recebido.' })];
    expect(pedidosConfirmados(naoConfirma, [SEC])).toEqual([]);
    // Confirmação por quem não é da secretaria: ignorada.
    const intruso = [...so, msg({ id: 'c', subject: 'RE: Pedido de matrícula | Cliente Um', from: 'outro@exemplo.pt', sentAt: '2026-11-03T09:00:00Z', text: 'Matrícula pedida' })];
    expect(pedidosConfirmados(intruso, [SEC])).toEqual([]);
    // Confirmação válida: a data é a da resposta, em Lisboa.
    const ok = [...so, msg({ id: 'd', subject: 'RE: Pedido de matrícula | Cliente Um', from: SEC, sentAt: '2026-11-03T12:11:00Z', text: 'Matrícula pedida' })];
    expect(pedidosConfirmados(ok, [SEC])).toEqual([
      { cliente: 'Cliente Um, Lda', enc: '9710001', chas: 'W88199X', biz: '559094', confirmadoEm: '2026-11-03', conversationId: 'c1' },
    ]);
  });

  it('uma confirmação anterior ao pedido não vale; a primeira posterior é que conta', () => {
    const msgs = [
      msg({ id: 'x', subject: 'RE: Pedido de matrícula | Cliente Um', from: SEC, sentAt: '2026-11-01T09:00:00Z', text: 'Matrícula pedida' }),
      msg({ id: 'a' }),
      msg({ id: 'y', subject: 'RE: Pedido de matrícula | Cliente Um', from: SEC, sentAt: '2026-11-03T09:00:00Z', text: 'Matrícula pedida' }),
      msg({ id: 'z', subject: 'RE: Pedido de matrícula | Cliente Um', from: SEC, sentAt: '2026-11-04T09:00:00Z', text: 'Matrícula pedida' }),
    ];
    expect(pedidosConfirmados(msgs, [SEC]).map(p => p.confirmadoEm)).toEqual(['2026-11-03']);
  });
});

describe('planSync — matrículas atribuídas', () => {
  const plates = parsePlatesHtml(EMAIL_DIARIO, '2026-11-03T08:40:00Z');

  it('preenche MAT, CHAS e DMAT e passa Carteira a Matricula', () => {
    const p = planSync([reg()], plates, []);
    expect(p.issues.filter(i => i.ref === '9710001')).toEqual([]);
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0].patch).toEqual({ status: 'Matricula', mat: 'AA-26-BB', chas: 'WBA71BX0X07W88199', dmat: '2026-11-02' });
  });

  it('encomenda com zeros à esquerda emparelha com a registada sem eles', () => {
    const p = planSync([reg({ id: 'd', enc: '14762', cliente: 'Demo' })], plates, []);
    expect(p.changes[0].recordId).toBe('d');
    expect(p.changes[0].patch.mat).toBe('EE-60-FF');
  });

  it('completa um chassis parcial e é idempotente (2.ª vez não há nada a fazer)', () => {
    const r = reg({ chas: 'W88199X'.replace('W88199X', '7W88199') });
    const p1 = planSync([r], plates, []);
    expect(p1.changes[0].patch.chas).toBe('WBA71BX0X07W88199');
    const feito = reg({ status: 'Matricula', chas: 'WBA71BX0X07W88199', mat: 'AA-26-BB', dmat: '2026-11-02' });
    const p2 = planSync([feito], plates, []);
    expect(p2.changes).toEqual([]);
    expect(p2.jaAtualizados).toBe(1);
  });

  it('nunca sobrescreve uma matrícula ou um chassis diferentes: fica por tratar', () => {
    const mat = planSync([reg({ mat: 'ZZ-99-ZZ' })], plates, []);
    expect(mat.changes).toEqual([]);
    expect(mat.issues[0]).toMatchObject({ kind: 'conflito', origem: 'matriculas', ref: '9710001' });
    const chas = planSync([reg({ chas: 'WBA00000000000000' })], plates, []);
    expect(chas.changes).toEqual([]);
    expect(chas.issues[0].kind).toBe('conflito');
  });

  it('encomenda desconhecida, duplicada ou em estado errado não altera nada', () => {
    expect(planSync([], plates, []).issues.filter(i => i.kind === 'sem_registo')).toHaveLength(3);
    const dup = planSync([reg({ id: 'a' }), reg({ id: 'b' })], plates, []);
    expect(dup.changes).toEqual([]);
    expect(dup.issues.some(i => i.kind === 'ambiguo')).toBe(true);
    const frio = planSync([reg({ status: 'Frio' })], plates, []);
    expect(frio.changes).toEqual([]);
    expect(frio.issues[0].kind).toBe('estado');
  });

  it('um registo já em Retail só ganha o que lhe falta, sem mudar de estado', () => {
    const p = planSync([reg({ status: 'Retail', dmat: '2026-10-15' })], plates, []);
    expect(p.changes[0].patch).toEqual({ mat: 'AA-26-BB', chas: 'WBA71BX0X07W88199' });
  });

  it('a mesma matrícula pode chegar por outro caminho: encontra pelo chassis se a encomenda mudou', () => {
    const r = reg({ enc: '9999999', chas: 'WBA71BX0X07W88199' });
    const p = planSync([r], plates.filter(x => x.enc === '9710001'), []);
    expect(p.changes[0].patch.mat).toBe('AA-26-BB');
  });
});

describe('planSync — pedidos confirmados', () => {
  const pedido = { cliente: 'Cliente Um', enc: '9710001', chas: 'W88199X', biz: '559094', confirmadoEm: '2026-11-03', conversationId: 'c1' };

  it('Carteira passa a Matricula com a data da confirmação', () => {
    const p = planSync([reg()], [], [pedido]);
    expect(p.changes[0]).toMatchObject({ origem: ['pedido'], patch: { status: 'Matricula', dmat: '2026-11-03' } });
  });
  it('não mexe numa DMAT já preenchida nem em registos que já passaram', () => {
    expect(planSync([reg({ dmat: '2026-11-01' })], [], [pedido]).changes[0].patch).toEqual({ status: 'Matricula' });
    const jaPassou = planSync([reg({ status: 'Matricula' })], [], [pedido]);
    expect(jaPassou.changes).toEqual([]);
    expect(jaPassou.jaAtualizados).toBe(1);
  });
  it('Bizagi diferente é conflito', () => {
    const p = planSync([reg({ biz: '111111' })], [], [pedido]);
    expect(p.changes).toEqual([]);
    expect(p.issues[0]).toMatchObject({ kind: 'conflito', origem: 'pedido' });
  });
  it('pedido e matrícula do mesmo registo juntam-se numa só alteração; a data real da matrícula prevalece', () => {
    const plates = parsePlatesHtml(EMAIL_DIARIO, '2026-11-03T08:40:00Z');
    const p = planSync([reg()], plates, [pedido]);
    expect(p.changes).toHaveLength(1);
    expect(p.changes[0].origem).toEqual(['pedido', 'matriculas']);
    expect(p.changes[0].patch).toEqual({ status: 'Matricula', dmat: '2026-11-02', mat: 'AA-26-BB', chas: 'WBA71BX0X07W88199' });
  });
});

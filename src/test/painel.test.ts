import { describe, it, expect } from 'vitest';
import type { ControlRecord } from '@/types/data';
import type { Notification } from '@/lib/notifications';
import {
  calcAlertas, calcDetalheDia, calcResumoDia, chaveBaixa, diasDesde, mensagensDoPainel, meuResp, nomeCurto, principaisTarefas, PRAZOS,
  type AlertaGrupo, type EventoPainel, type RegraId,
} from '@/lib/painel';

/* Hoje fixo: 17/11/2026 (terça). Todas as datas dos casos são relativas a ele. */
const HOJE = new Date(2026, 10, 17, 10, 0, 0);
const dia = (atras: number) => new Date(2026, 10, 17 - atras);

const rec = (over: Partial<ControlRecord> = {}): ControlRecord => ({
  id: `id-${Math.random().toString(36).slice(2)}`, status: 'Carteira', neg: dia(1), mes1: '2026/12', resp: 'AB',
  cliente: 'Cliente', type: 'VN', biz: 'B1', enc: '', chas: 'WBA0001', mat: '', model: 'X1', version: '20e',
  gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, ret: 0, fin: 'FS', week198: '', dmat: null, date298: null,
  dfat: null, obs: '', matPedidaEm: null, ...over,
});

const grupo = (gs: AlertaGrupo[], id: RegraId) => gs.find(g => g.regra.id === id)!;
const calc = (control: ControlRecord[], extra: Partial<Parameters<typeof calcAlertas>[1]> = {}) =>
  calcAlertas(control, { hoje: HOJE, entradas: new Map(), eventos: [], resp: null, ...extra });

describe('diasDesde', () => {
  it('conta dias de calendário, 0 hoje, nunca negativo', () => {
    expect(diasDesde(HOJE, HOJE)).toBe(0);
    expect(diasDesde(dia(3), HOJE)).toBe(3);
    expect(diasDesde(new Date(2026, 10, 20), HOJE)).toBe(0);
    expect(diasDesde(null, HOJE)).toBeNull();
  });
});

describe('1. em parque sem matrícula pedida', () => {
  it('assinala a viatura em parque sem matrícula nem pedido, com o contador de dias desde a entrada', () => {
    const r = rec({ week198: '45P', chas: 'abc123' });
    const g = grupo(calc([r], { entradas: new Map([['ABC123', dia(4)]]) }), 'parque-sem-matricula');
    expect(g.itens).toHaveLength(1);
    expect(g.itens[0].dias).toBe(4);
    expect(g.itens[0].severidade).toBe('alta');
  });
  it('sem data de entrada fica com dias=null (não se inventa)', () => {
    const g = grupo(calc([rec({ week198: '45P' })]), 'parque-sem-matricula');
    expect(g.itens[0].dias).toBeNull();
  });
  it('não assinala se a matrícula já foi pedida (email recebido) ou já existe', () => {
    const pedida = rec({ week198: '45P', matPedidaEm: dia(1) });
    const matriculada = rec({ week198: '45P', mat: '12-AB-34' });
    expect(grupo(calc([pedida, matriculada]), 'parque-sem-matricula').itens).toHaveLength(0);
  });
  it('não assinala o que não está em parque nem o que já é Retail', () => {
    const fora = rec({ week198: '45' });
    const retail = rec({ week198: '45P', status: 'Retail' });
    expect(grupo(calc([fora, retail]), 'parque-sem-matricula').itens).toHaveLength(0);
  });
  it('em parque há pouco tempo é "a tratar", não urgente', () => {
    const r = rec({ week198: 'P', chas: 'X1' });
    const g = grupo(calc([r], { entradas: new Map([['X1', dia(1)]]) }), 'parque-sem-matricula');
    expect(g.itens[0].severidade).toBe('media');
  });
});

describe('2. matriculada em parque sem certificado de entrega há mais de 2 dias', () => {
  const entradas = (d: Date) => new Map([['WBA0001', d]]);
  it('assinala quando passaram mais de 2 dias desde o mais recente entre matrícula e entrada em parque', () => {
    const r = rec({ week198: 'P', mat: '12-AB-34', dmat: dia(5) });
    const g = grupo(calc([r], { entradas: entradas(dia(3)) }), 'matriculado-sem-certificado');
    expect(g.itens).toHaveLength(1);
    expect(g.itens[0].dias).toBe(3);   // o relógio começa quando as duas coisas se verificam
  });
  it('2 dias exatos ainda não (é "mais de dois")', () => {
    const r = rec({ week198: 'P', mat: '12-AB-34', dmat: dia(2) });
    expect(grupo(calc([r], { entradas: entradas(dia(9)) }), 'matriculado-sem-certificado').itens).toHaveLength(0);
    expect(PRAZOS.certificadoDias).toBe(2);
  });
  it('não assinala com certificado (retail), sem matrícula, ou fora de parque', () => {
    const entregue = rec({ week198: 'P', mat: 'X', status: 'Retail', date298: dia(1), dmat: dia(9) });
    const semMat = rec({ week198: 'P', dmat: dia(9) });
    const fora = rec({ week198: '', mat: 'X', dmat: dia(9) });
    expect(grupo(calc([entregue, semMat, fora]), 'matriculado-sem-certificado').itens).toHaveLength(0);
  });
  it('sem nenhuma data conhecida assinala mesmo assim, sem contador', () => {
    const r = rec({ week198: 'P', mat: '12-AB-34' });
    const g = grupo(calc([r]), 'matriculado-sem-certificado');
    expect(g.itens[0].dias).toBeNull();
  });
});

describe('3. financiamento BMW (PP ou sem informação)', () => {
  it('assinala carteira com PP ou sem fin; ignora FS/Fext/Fint e o que já é retail', () => {
    const control = [
      rec({ fin: 'PP' }), rec({ fin: '' }), rec({ fin: 'FS' }), rec({ fin: 'Fext' }),
      rec({ fin: 'PP', status: 'Retail' }), rec({ fin: 'PP', status: 'Frio' }), rec({ fin: 'PP', type: 'VP' }),
    ];
    const g = grupo(calc(control), 'financiamento-bmw');
    expect(g.itens.map(i => i.nota).sort()).toEqual(['PP', 'sem info']);
    expect(g.itens.every(i => i.severidade === 'info')).toBe(true);
  });
});

describe('4. negócio fechado há 15+ dias sem Bizagi', () => {
  it('assinala a partir de 15 dias e só sem número', () => {
    const control = [
      rec({ biz: '', neg: dia(15) }), rec({ biz: '', neg: dia(14) }), rec({ biz: 'B9', neg: dia(40) }),
      rec({ biz: '', neg: dia(40), status: 'Frio' }),
    ];
    const g = grupo(calc(control), 'sem-bizagi');
    expect(g.itens).toHaveLength(1);
    expect(g.itens[0].dias).toBe(15);
  });
  it('segue o tab Pendentes: só 2026 em diante e sem o comercial JD', () => {
    const control = [
      rec({ biz: '', neg: new Date(2025, 11, 20) }),
      rec({ biz: '', neg: dia(30), resp: 'JD' }),
    ];
    expect(grupo(calc(control), 'sem-bizagi').itens).toHaveLength(0);
  });
  it('ordena do mais antigo para o mais recente', () => {
    const g = grupo(calc([rec({ biz: '', neg: dia(20) }), rec({ biz: '', neg: dia(60) })]), 'sem-bizagi');
    expect(g.itens.map(i => i.dias)).toEqual([60, 20]);
  });
});

describe('5. BEV há 30+ dias sem chassis → Lead CME', () => {
  it('assinala só BEV em carteira, sem chassis e com 30+ dias', () => {
    const control = [
      rec({ bev: 1, chas: '', neg: dia(30) }),
      rec({ bev: 1, chas: '', neg: dia(29) }),
      rec({ bev: 1, chas: 'WBA9', neg: dia(60) }),
      rec({ bev: 0, chas: '', neg: dia(60) }),
    ];
    const g = grupo(calc(control), 'bev-lead-cme');
    expect(g.itens).toHaveLength(1);
    expect(g.itens[0].dias).toBe(30);
  });
});

describe('6 e 7. eventos de preço e prémios', () => {
  const ev = (over: Partial<EventoPainel>): EventoPainel => ({
    id: 1, tipo: 'preco_reducao', origem: 'demo', chave: 'C', descricao: 'Série 3 · 12-AB-34',
    valor_antes: 50000, valor_depois: 48500, created_at: new Date(2026, 10, 16, 9).toISOString(), ...over,
  });
  it('a redução de preço fica em destaque 3 dias (hoje, ontem, anteontem) e sai ao 3.º', () => {
    const eventos = [
      ev({ id: 1, created_at: new Date(2026, 10, 15, 9).toISOString() }),   // há 2 dias → vê-se
      ev({ id: 2, created_at: new Date(2026, 10, 14, 23).toISOString() }),  // há 3 dias → já não
    ];
    const g = grupo(calc([], { eventos }), 'reducao-preco');
    expect(g.itens.map(i => i.id)).toEqual(['preco:1']);
    expect(g.itens[0].nota).toMatch(/^−1\D?500 €$/);   // separador de milhares depende do locale
  });
  it('distingue Demo de Stock e vale para toda a equipa, mesmo com filtro por comercial', () => {
    const eventos = [ev({ id: 1, origem: 'stock' }), ev({ id: 2, origem: 'demo' })];
    const g = grupo(calc([], { eventos, resp: 'AB' }), 'reducao-preco');
    expect(g.itens).toHaveLength(2);
    expect(g.itens.some(i => i.detalhe.startsWith('Stock'))).toBe(true);
  });
  it('prémio novo fica 7 dias', () => {
    const eventos = [
      ev({ id: 1, tipo: 'premio', valor_antes: null, valor_depois: 300, created_at: new Date(2026, 10, 11, 9).toISOString() }), // 6 dias
      ev({ id: 2, tipo: 'premio', valor_antes: null, valor_depois: 300, created_at: new Date(2026, 10, 10, 9).toISOString() }), // 7 dias
    ];
    expect(grupo(calc([], { eventos }), 'premio-venda').itens.map(i => i.id)).toEqual(['premio:1']);
  });
});

describe('filtro por comercial e prioridades', () => {
  it('"os meus" limita as regras de control_records ao comercial', () => {
    const control = [rec({ fin: 'PP', resp: 'AB' }), rec({ fin: 'PP', resp: 'CD' })];
    expect(grupo(calc(control, { resp: 'AB' }), 'financiamento-bmw').itens).toHaveLength(1);
    expect(grupo(calc(control), 'financiamento-bmw').itens).toHaveLength(2);
  });
  it('as principais tarefas excluem o informativo e põem o urgente primeiro', () => {
    const control = [
      rec({ fin: 'PP' }),
      rec({ biz: '', neg: dia(16) }),                       // média
      rec({ week198: 'P', chas: 'U1' }),                    // alta (sem data)
    ];
    const t = principaisTarefas(calc(control));
    expect(t.map(i => i.regra)).toEqual(['parque-sem-matricula', 'sem-bizagi']);
  });
});

describe('resumo do dia', () => {
  it('conta negócios, matrículas e entregas de hoje e os totais em parque/carteira', () => {
    const control = [
      rec({ neg: HOJE }),
      rec({ neg: dia(3), dmat: HOJE, status: 'Matricula' }),
      rec({ status: 'Retail', date298: HOJE, neg: dia(20) }),
      rec({ week198: 'P' }),
    ];
    expect(calcResumoDia(control, HOJE, null)).toEqual({
      negociosHoje: 1, matriculasHoje: 1, entregasHoje: 1, emParque: 1, carteira: 3,
    });
  });
});

describe('meuResp', () => {
  it('liga o nome às iniciais só se existirem nos dados', () => {
    expect(meuResp('João Duarte', ['AB', 'JD'])).toBe('JD');
    expect(meuResp('João Manuel Duarte', ['JD'])).toBe('JD');
    expect(meuResp('Maria Silva', ['AB', 'JD'])).toBeNull();
    expect(meuResp(null, ['JD'])).toBeNull();
  });
});

describe('mensagensDoPainel', () => {
  const n = (over: Partial<Notification>): Notification => ({
    id: 'n', title: 't', body: null, audience: 'all', created_by: null, created_by_nome: null,
    created_at: HOJE.toISOString(), painel: true, ...over,
  });
  const todas = () => true;
  it('só as marcadas para o painel, por expirar e visíveis para a pessoa', () => {
    const lista = [
      n({ id: 'a' }),
      n({ id: 'b', painel: false }),
      n({ id: 'c', expira_em: new Date(2026, 10, 16).toISOString() }),
      n({ id: 'd', expira_em: new Date(2026, 10, 20).toISOString() }),
      n({ id: 'e', audience: 'demos' }),
    ];
    expect(mensagensDoPainel(lista, 'x@y.pt', todas, HOJE).map(m => m.id)).toEqual(['a', 'd', 'e']);
    expect(mensagensDoPainel(lista, 'x@y.pt', t => t !== 'demos', HOJE).map(m => m.id)).toEqual(['a', 'd']);
  });
});

describe('nomeCurto', () => {
  it('primeiro e último nome; sem nome deduz-se do email', () => {
    expect(nomeCurto('João Manuel Duarte', 'x@y.pt')).toBe('João Duarte');
    expect(nomeCurto('Ana', null)).toBe('Ana');
    expect(nomeCurto(null, 'joao.duarte@caetano.pt')).toBe('Joao Duarte');
    expect(nomeCurto('  ', 'maria@caetano.pt')).toBe('Maria');
    expect(nomeCurto(null, null)).toBe('');
  });
});

describe('baixas', () => {
  it('um aviso com baixa sai da lista (por regra e registo); outras regras do mesmo registo mantêm-se', () => {
    const r = rec({ bev: 1, chas: '', neg: dia(40), fin: 'PP' });
    const sem = calc([r]);
    expect(grupo(sem, 'bev-lead-cme').itens).toHaveLength(1);
    const com = calc([r], { baixas: new Set([chaveBaixa('bev-lead-cme', r.id)]) });
    expect(grupo(com, 'bev-lead-cme').itens).toHaveLength(0);
    expect(grupo(com, 'financiamento-bmw').itens).toHaveLength(1);
  });
});

describe('entregas por confirmar (mês previsto)', () => {
  it('em atraso: mês previsto já passou e ainda não foi entregue', () => {
    const control = [
      rec({ mes1: '2026/10' }), rec({ mes1: '2026/11' }), rec({ mes1: '2026/10', status: 'Retail', date298: dia(5) }),
      rec({ mes1: '' }),
    ];
    const g = grupo(calc(control), 'entrega-atrasada');
    expect(g.itens).toHaveLength(1);
    expect(g.itens[0].dias).toBe(17);            // desde 31/10
    expect(g.itens[0].severidade).toBe('media');
  });
  it('mais de 30 dias de atraso é urgente', () => {
    const g = grupo(calc([rec({ mes1: '2026/09' })]), 'entrega-atrasada');
    expect(g.itens[0].severidade).toBe('alta');
  });
  it('este mês, a 7 dias ou menos do fim, sem matrícula pedida', () => {
    // 17/11: faltam 13 dias para 30/11 → ainda não; com HOJE a 25/11 faltam 5.
    const r = rec({ mes1: '2026/11' });
    expect(grupo(calc([r]), 'entrega-fim-mes').itens).toHaveLength(0);
    const g = grupo(calc([r], { hoje: new Date(2026, 10, 25) }), 'entrega-fim-mes');
    expect(g.itens).toHaveLength(1);
    expect(g.itens[0].restam).toBe(5);
    expect(g.itens[0].chip).toBe('faltam 5 d');
  });
  it('não repete o que já está noutra regra nem o que já tem matrícula pedida', () => {
    const h = { hoje: new Date(2026, 10, 28) };
    const emParque = rec({ mes1: '2026/11', week198: 'P' });
    const pedida = rec({ mes1: '2026/11', matPedidaEm: dia(1) });
    const matriculada = rec({ mes1: '2026/11', mat: '12-AB-34' });
    expect(grupo(calc([emParque, pedida, matriculada], h), 'entrega-fim-mes').itens).toHaveLength(0);
  });
  it('ordena pelo prazo mais curto', () => {
    const h = { hoje: new Date(2026, 10, 27) };
    const g = grupo(calc([rec({ mes1: '2026/11' }), rec({ mes1: '2026/11', cliente: 'B' })], h), 'entrega-fim-mes');
    expect(g.itens.map(i => i.restam)).toEqual([3, 3]);
  });
});

describe('detalhe do dia', () => {
  it('as listas por trás dos quadrados batem com os totais', () => {
    const control = [rec({ neg: HOJE }), rec({ neg: dia(3), dmat: HOJE, status: 'Matricula' }), rec({ week198: 'P' }), rec({ type: 'VP', neg: HOJE })];
    const d = calcDetalheDia(control, HOJE, null);
    const r = calcResumoDia(control, HOJE, null);
    expect(d.negocios).toHaveLength(r.negociosHoje);
    expect(d.parque).toHaveLength(r.emParque);
    expect(d.carteira).toHaveLength(r.carteira);
    expect(d.negocios.every(x => x.type !== 'VP')).toBe(true);
  });
});

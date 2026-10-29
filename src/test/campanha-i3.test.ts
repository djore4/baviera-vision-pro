import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  distribuir, filtrar, isAtrasada, isParada, kpis, leadKey, parseDia, parseLeadsText, phoneDigits, planImport,
  resumoPorVendedor, rowsToLeads, splitTable, telHref, whatsappHref, historicoLabel,
  type Lead,
} from '@/lib/campanha-i3';

/* A tabela real da campanha, como o Excel a copia (tabulações). */
const TABELA = [
  'Nome Entidade\tE-mail Entidade\tContacto Entidade\tData Contacto\tPolo',
  'Tiago Gonçalves\timperyal@gmail.com\t925344820\t29/10/2026\tDCC - Aveiro',
  'Germano Santos\tgermano.santos@gmail.com\t966357533\t28/10/2026\tDCC - Aveiro',
  'João Miguel Santos\tj.santos@pjf.pt\t932776550\t28/10/2026\tDCC - Aveiro',
  'Paulo  Tavares\tpaltavares@gmail.com\t969290521\t28/10/2026\tDCC - Aveiro',
  'Ricardo  Martins\tricardovieiramartins@gmail.com\t938469271\t28/10/2026\tDCC - Aveiro',
  'sergio figueiredo\tsergio.figueiredo@silfergomes.pt\t939791915\t28/10/2026\tDCC - Aveiro',
].join('\n');

const mk = (id: string, over: Partial<Lead> = {}): Lead => ({
  id, nome: `Lead ${id}`, email: `${id}@x.pt`, contacto: '912345678', data_contacto: '2026-10-28', polo: 'DCC - Aveiro',
  chave: `${id}@x.pt`, owner_email: null, owner_nome: null, atribuido_em: null, atribuido_por: null, estado: 'novo',
  ponto_situacao: null, observacoes: null, proximo_contacto: null, ultima_atualizacao: null, importado_por: null,
  created_at: '2026-10-28T10:00:00Z', updated_at: '2026-10-28T10:00:00Z', ...over,
});

describe('leitura da tabela da campanha', () => {
  it('lê as 6 linhas reais, com datas dd/mm/aaaa e espaços duplicados limpos', () => {
    const r = parseLeadsText(TABELA);
    expect(r.erros).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0]).toEqual({
      nome: 'Tiago Gonçalves', email: 'imperyal@gmail.com', contacto: '925344820', data_contacto: '2026-10-29', polo: 'DCC - Aveiro',
    });
    expect(r.rows[3].nome).toBe('Paulo Tavares');
    expect(r.rows[5].nome).toBe('sergio figueiredo');
    expect(r.rows.every(x => x.data_contacto === '2026-10-28' || x.nome === 'Tiago Gonçalves')).toBe(true);
  });

  it('aceita a tabela sem cabeçalho (mesma ordem) e colunas noutra ordem com cabeçalho', () => {
    const semCab = parseLeadsText(TABELA.split('\n').slice(1).join('\n'));
    expect(semCab.rows).toHaveLength(6);
    expect(semCab.rows[1].email).toBe('germano.santos@gmail.com');

    const outra = parseLeadsText('Polo\tNome Entidade\tContacto Entidade\nDCC - Aveiro\tAna\t912 345 678');
    expect(outra.rows).toEqual([{ nome: 'Ana', email: null, contacto: '912345678', data_contacto: null, polo: 'DCC - Aveiro' }]);
  });

  it('aceita ; e , como separador, e aspas com quebras de linha', () => {
    expect(parseLeadsText('Nome;E-mail;Contacto\nAna;a@x.pt;912345678').rows[0].email).toBe('a@x.pt');
    const q = splitTable('Nome,Obs\n"Rui, o Grande","linha 1\nlinha 2"\n');
    expect(q).toEqual([['Nome', 'Obs'], ['Rui, o Grande', 'linha 1\nlinha 2']]);
  });

  it('ignora linhas vazias e sem nome; avisa de email e data inválidos mas mantém a oportunidade', () => {
    const r = parseLeadsText([
      'Nome Entidade\tE-mail Entidade\tContacto Entidade\tData Contacto\tPolo',
      '\t\t\t\t',
      '\tsemnome@x.pt\t912345678\t28/10/2026\tAveiro',
      'Rui\tnao-e-email\t912345678\t31/02/2026\tAveiro',
    ].join('\n'));
    expect(r.erros).toHaveLength(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ nome: 'Rui', email: null, data_contacto: null });
    expect(r.avisos).toHaveLength(2);
  });

  it('lê células do Excel: datas, números de série e telefones numéricos', () => {
    const r = rowsToLeads([
      ['Nome Entidade', 'E-mail Entidade', 'Contacto Entidade', 'Data Contacto', 'Polo'],
      ['Ana', 'a@x.pt', 912345678, new Date(Date.UTC(2026, 9, 28)), 'Aveiro'],
      ['Rui', '', 912345679, 46324, 'Aveiro'],            // 46324 = 29/10/2026
    ]);
    expect(r.rows[0]).toMatchObject({ contacto: '912345678', data_contacto: '2026-10-28' });
    expect(r.rows[1]).toMatchObject({ contacto: '912345679', data_contacto: '2026-10-29' });
  });

  it('datas: dd/mm/aaaa, d/m/aa, aaaa-mm-dd; inválidas dão null', () => {
    expect(parseDia('29/10/2026')).toBe('2026-10-29');
    expect(parseDia('1/2/26')).toBe('2026-02-01');
    expect(parseDia('2026-10-28')).toBe('2026-10-28');
    expect(parseDia('2026-10-28T10:00:00')).toBe('2026-10-28');
    expect(parseDia('31/02/2026')).toBeNull();
    expect(parseDia('amanhã')).toBeNull();
    expect(parseDia('')).toBeNull();
  });
});

describe('duplicados', () => {
  const novas = parseLeadsText(TABELA).rows;

  it('a chave espelha a da base de dados: email, senão telefone, senão nome', () => {
    expect(leadKey({ nome: 'Ana', email: ' A@X.pt ', contacto: '912' })).toBe('a@x.pt');
    expect(leadKey({ nome: 'Ana', email: null, contacto: '+351 912 345 678' })).toBe('351912345678');
    expect(leadKey({ nome: ' Ana Silva ', email: null, contacto: null })).toBe('ana silva');
  });

  it('colar outra vez a lista acumulada só deixa entrar as novas', () => {
    const existentes = novas.slice(0, 4).map((l, i) => mk(String(i), { ...l, chave: leadKey(l) }));
    const plano = planImport(novas, existentes);
    expect(plano.novas.map(l => l.nome)).toEqual(['Ricardo Martins', 'sergio figueiredo']);
    expect(plano.duplicadas).toHaveLength(4);
  });

  it('o mesmo telefone com outro email (ou com +351) também é duplicado; e repetidas na própria importação', () => {
    const existentes = [mk('1', { email: 'a@x.pt', contacto: '912345678', chave: 'a@x.pt' })];
    const plano = planImport([
      { nome: 'Outra', email: 'b@x.pt', contacto: '+351 912 345 678', data_contacto: null, polo: null },
      { nome: 'Nova', email: 'n@x.pt', contacto: '911111111', data_contacto: null, polo: null },
      { nome: 'Nova outra vez', email: 'N@x.pt', contacto: null, data_contacto: null, polo: null },
    ], existentes);
    expect(plano.novas.map(l => l.nome)).toEqual(['Nova']);
    expect(plano.duplicadas.map(d => d.lead.nome)).toEqual(['Outra', 'Nova outra vez']);
    expect(phoneDigits('+351 912 345 678')).toBe('912345678');
  });
});

describe('distribuir', () => {
  const v = [{ email: 'a@x.pt', nome: 'A' }, { email: 'b@x.pt', nome: 'B' }, { email: 'c@x.pt', nome: 'C' }];

  it('reparte por igual (diferença máxima de 1) e sem perder nenhuma', () => {
    const r = distribuir(['1', '2', '3', '4', '5', '6', '7'], v);
    const sizes = [...r.values()].map(x => x.length).sort();
    expect(sizes).toEqual([2, 2, 3]);
    expect([...r.values()].flat().sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('quem já tem mais recebe menos (equilibra o total)', () => {
    const r = distribuir(['1', '2', '3', '4'], v, { 'a@x.pt': 3 });
    expect(r.get('a@x.pt')).toEqual([]);
    expect(r.get('b@x.pt')!.length + r.get('c@x.pt')!.length).toBe(4);
  });

  it('sem vendedores não distribui', () => {
    expect(distribuir(['1'], []).size).toBe(0);
  });
});

describe('indicadores e filtros', () => {
  const agora = new Date('2026-10-29T12:00:00');
  const lista: Lead[] = [
    mk('1'),                                                                                           // por delegar
    mk('2', { owner_email: 'a@x.pt', owner_nome: 'Ana', atribuido_em: '2026-10-26T10:00:00' }),       // parada (3 d)
    mk('3', { owner_email: 'a@x.pt', owner_nome: 'Ana', estado: 'em_contacto', proximo_contacto: '2026-10-28', ultima_atualizacao: '2026-10-29T09:00:00', atribuido_em: '2026-10-26T10:00:00' }), // atrasada
    mk('4', { owner_email: 'b@x.pt', owner_nome: 'Rui', estado: 'agendado', ultima_atualizacao: '2026-10-29T09:00:00', atribuido_em: '2026-10-28T10:00:00' }),
    mk('5', { owner_email: 'b@x.pt', owner_nome: 'Rui', estado: 'ganho', proximo_contacto: '2026-10-01' }),                // fechada: nunca atrasada
    mk('6', { owner_email: 'b@x.pt', owner_nome: 'Rui', estado: 'perdido' }),
  ];

  it('conta por estado, por delegar, atrasadas e paradas (ganhas/perdidas nunca)', () => {
    expect(kpis(lista, agora)).toEqual({
      total: 6, porDelegar: 1, porContactar: 2, emCurso: 4, agendados: 1, ganhos: 1, atrasadas: 1, paradas: 1,
    });
    expect(isAtrasada(lista[4], '2026-10-29')).toBe(false);
    expect(isParada(lista[0], agora)).toBe(false); // sem responsável não é "parada"
    expect(isParada(lista[1], agora)).toBe(true);
  });

  it('resumo por vendedor', () => {
    const r = resumoPorVendedor(lista, agora);
    expect(r.map(x => [x.nome, x.delegadas, x.emCurso, x.ganhos, x.atrasadas, x.paradas])).toEqual([
      ['Ana', 2, 2, 0, 1, 1],
      ['Rui', 3, 1, 1, 0, 0],
    ]);
  });

  it('filtra por estado, responsável, polo, pesquisa (nome, email, telefone) e atalhos', () => {
    const ids = (f: Parameters<typeof filtrar>[1]) => filtrar(lista, f, agora).map(l => l.id).sort();
    expect(ids({})).toEqual(['1', '2', '3', '4']);                       // por omissão: em curso
    expect(ids({ estado: 'all' })).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(ids({ estado: 'ganho' })).toEqual(['5']);
    expect(ids({ owner: 'none' })).toEqual(['1']);
    expect(ids({ owner: 'a@x.pt', estado: 'all' })).toEqual(['2', '3']);
    expect(ids({ quick: 'atrasadas' })).toEqual(['3']);
    expect(ids({ quick: 'paradas' })).toEqual(['2']);
    expect(ids({ q: 'LEAD 4' })).toEqual(['4']);
    expect(ids({ q: '912 345 678', estado: 'all' })).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(ids({ polo: 'Outro', estado: 'all' })).toEqual([]);
  });

  it('as atrasadas aparecem primeiro; as fechadas por último', () => {
    const r = filtrar(lista, { estado: 'all' }, agora).map(l => l.id);
    expect(r[0]).toBe('3');
    expect(r.slice(-2).sort()).toEqual(['5', '6']);
  });
});

describe('ligações de contacto e histórico', () => {
  it('tel e WhatsApp: 9 algarismos assumem Portugal; com indicativo mantém-no; curtos não geram ligação', () => {
    expect(telHref('925344820')).toBe('tel:925344820');
    expect(telHref('+351 925 344 820')).toBe('tel:+351925344820');
    expect(whatsappHref('925344820')).toBe('https://wa.me/351925344820');
    expect(whatsappHref('+44 7911 123456')).toBe('https://wa.me/447911123456');
    expect(whatsappHref('00351925344820')).toBe('https://wa.me/351925344820');
    expect(telHref('123')).toBeNull();
    expect(whatsappHref(null)).toBeNull();
  });

  it('descreve cada tipo de histórico', () => {
    expect(historicoLabel({ tipo: 'importada', de: null, para: null })).toBe('Oportunidade importada');
    expect(historicoLabel({ tipo: 'atribuida', de: null, para: 'Ana' })).toBe('Delegada a Ana');
    expect(historicoLabel({ tipo: 'atribuida', de: 'Ana', para: 'Rui' })).toBe('Delegada a Rui (antes: Ana)');
    expect(historicoLabel({ tipo: 'atribuida', de: 'Ana', para: null })).toBe('Delegação retirada (era Ana)');
    expect(historicoLabel({ tipo: 'estado', de: 'novo', para: 'agendado' })).toBe('Estado: Novo → Agendado');
    expect(historicoLabel({ tipo: 'ponto', de: null, para: 'Ligou' })).toBe('Ponto de situação: Ligou');
  });
});

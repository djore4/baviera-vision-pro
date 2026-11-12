import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  alertas, cobreHoje, dadosEmFalta, historicoLabel, mensagemCancelamento, textoVenda, validarUpgrade, vendaDe, parqueSemMatricula, custoPorArea, emptyForm, estadoSeguro, filtrar, kpis, normMatricula, parqueSemSeguro,
  parseEuro, validarForm, type Seguro,
} from '@/lib/seguros';
import { ADMIN_ONLY_TAB_KEYS, ARCHIVED_TAB_KEYS, PERMISSION_TABS, TABS } from '@/lib/permissions';

const HOJE = '2026-11-12';

const mk = (id: string, over: Partial<Seguro> = {}): Seguro => ({
  id, matricula: '00-AA-00', matricula_norm: '00AA00', chassis: null, viatura: 'BMW iX1', area: 'bmw_vn',
  solicitante: 'Rui', responsavel_info: null, cancelamento_pedido_em: null, dp_desde: null, cliente: null, data_pedido: '2026-10-01', inicio: '2026-10-01', fim: '2027-10-01',
  cobertura: 'terceiros', capital_seguro: null, premio: 100, seguradora: null, apolice: null, obs: null,
  arquivado: false, arquivado_em: null, motivo_arquivo: null, criado_por: null, created_at: '', updated_at: '', ...over,
});

describe('tab Seguros: acesso', () => {
  it('está na secção Transversal e é atribuível na matriz de funções', () => {
    expect(TABS.find(t => t.key === 'seguros')).toMatchObject({ area: 'apv', path: '/seguros' });
    expect(ADMIN_ONLY_TAB_KEYS).not.toContain('seguros');
    expect(ARCHIVED_TAB_KEYS).not.toContain('seguros');
    expect(PERMISSION_TABS.some(t => t.key === 'seguros')).toBe(true);
  });
});

describe('normMatricula', () => {
  it('ignora hífens, espaços e maiúsculas', () => {
    expect(normMatricula('00-aa-00')).toBe('00AA00');
    expect(normMatricula(' 00 AA 00 ')).toBe('00AA00');
    expect(normMatricula(null)).toBe('');
  });
});

describe('estadoSeguro', () => {
  it('o último dia ainda cobre', () => {
    expect(cobreHoje(mk('a', { fim: HOJE }), HOJE)).toBe(true);
    expect(estadoSeguro(mk('a', { fim: '2026-11-11' }), HOJE)).toBe('expirado');
  });
  it('a expirar a 30 dias, ativo a 31', () => {
    expect(estadoSeguro(mk('a', { fim: '2026-12-12' }), HOJE)).toBe('a_expirar');
    expect(estadoSeguro(mk('a', { fim: '2026-12-13' }), HOJE)).toBe('ativo');
  });
  it('por iniciar e arquivado', () => {
    expect(estadoSeguro(mk('a', { inicio: '2026-11-13' }), HOJE)).toBe('futuro');
    expect(estadoSeguro(mk('a', { arquivado: true, fim: '2020-01-01' }), HOJE)).toBe('arquivado');
  });
});

describe('alertas', () => {
  it('expirado por arquivar é risco de circular sem seguro; arquivado não', () => {
    const a = alertas([mk('a', { fim: '2026-11-01' }), mk('b', { fim: '2026-11-01', arquivado: true })], [], HOJE);
    expect(a.expirados.map(s => s.id)).toEqual(['a']);
  });
  it('seguro por arquivar de viatura vendida (mesma matrícula, outro formato)', () => {
    const vendidas = [{ matricula: '00aa00', origem: 'retail' as const, data_venda: '2026-11-05' }];
    const a = alertas([mk('a'), mk('b', { matricula: '11-BB-11', matricula_norm: '11BB11' })], vendidas, HOJE);
    expect(a.vendidosAtivos.map(s => s.id)).toEqual(['a']);
  });
  it('deteta seguros sobrepostos na mesma matrícula, mas não consecutivos', () => {
    const sobrep = alertas([mk('a', { fim: '2027-01-31' }), mk('b', { inicio: '2027-01-01', fim: '2027-12-31' })], [], HOJE);
    expect(sobrep.sobrepostos).toHaveLength(1);
    const seguidos = alertas([mk('a', { fim: '2026-12-31' }), mk('b', { inicio: '2027-01-01', fim: '2027-12-31' })], [], HOJE);
    expect(seguidos.sobrepostos).toHaveLength(0);
  });
});

describe('sem termo (fim nulo)', () => {
  it('apólice de frota sem fim cobre sempre, nunca expira nem alerta', () => {
    const s = mk('a', { fim: null });
    expect(estadoSeguro(s, HOJE)).toBe('ativo');
    expect(cobreHoje(s, HOJE)).toBe(true);
    expect(alertas([s], [], HOJE).expirados).toHaveLength(0);
    expect(estadoSeguro(mk('b', { fim: null, inicio: '2026-12-01' }), HOJE)).toBe('futuro');
  });
  it('sobrepõe-se a qualquer seguro posterior da mesma matrícula', () => {
    expect(alertas([mk('a', { fim: null }), mk('b', { inicio: '2027-05-01', fim: '2027-12-31' })], [], HOJE).sobrepostos).toHaveLength(1);
  });
  it('danos próprios exigem fim e responsável pela informação', () => {
    const dp = { ...emptyForm(HOJE), matricula: '00-AA-00', viatura: 'BMW X1', solicitante: 'Rui', cobertura: 'danos_proprios' as const, capital_seguro: '30000' };
    expect(validarForm(dp)).toMatch(/fim/);
    expect(validarForm({ ...dp, fim: '2027-01-01' })).toMatch(/responsável/);
    expect(validarForm({ ...dp, fim: '2027-01-01', responsavel_info: 'Ana' })).toBeNull();
  });
  it('o formulário aceita fim vazio', () => {
    expect(validarForm({ ...emptyForm(HOJE), matricula: '00-AA-00', viatura: 'BMW X1', solicitante: 'Rui' })).toBeNull();
  });
});

describe('kpis e custo', () => {
  it('só somam prémios dos que cobrem hoje', () => {
    const list = [
      mk('a', { premio: 100, area: 'bmw_vn' }),
      mk('b', { premio: 50, area: 'apv', matricula_norm: 'X' }),
      mk('c', { premio: 999, arquivado: true }),
      mk('d', { premio: 999, fim: '2026-01-01', matricula_norm: 'Y' }),
      mk('e', { premio: 20, cobertura: 'danos_proprios', capital_seguro: 30000, inicio: '2026-11-12', matricula_norm: 'Z' }),
    ];
    const k = kpis(list, [], HOJE);
    expect(k).toMatchObject({ ativos: 3, premioAtivo: 170, capitalAtivo: 30000, expirados: 1 });
    expect(custoPorArea(list, HOJE)).toEqual([{ area: 'bmw_vn', seguros: 2, premio: 120 }, { area: 'apv', seguros: 1, premio: 50 }]);
  });
});

describe('parqueSemSeguro', () => {
  it('lista só viaturas com matrícula e sem seguro a cobrir hoje', () => {
    const parque = [
      { origem: 'demos' as const, ref: '1', chassis: '1', matricula: '00-AA-00', modelo: null, versao: null, marca: null, area: 'bmw_vn' as const },
      { origem: 'stock_vu' as const, ref: '2', chassis: '2', matricula: '22-CC-22', modelo: null, versao: null, marca: null, area: 'bmw_vu' as const },
      { origem: 'stock_vu' as const, ref: '3', chassis: null, matricula: null, modelo: null, versao: null, marca: null, area: 'bmw_vu' as const },
    ];
    expect(parqueSemMatricula(parque).map(v => v.ref)).toEqual(['3']);
    expect(parqueSemSeguro(parque, [mk('a')], HOJE).map(v => v.chassis)).toEqual(['2']);
    expect(parqueSemSeguro(parque, [mk('a', { fim: '2026-01-01' })], HOJE).map(v => v.chassis)).toEqual(['1', '2']);
  });
});

describe('filtrar', () => {
  const list = [mk('a'), mk('b', { arquivado: true, arquivado_em: '2026-10-10', matricula: '22-BB-22', matricula_norm: '22BB22', area: 'apv' })];
  const base = { separador: 'ativos' as const, area: 'all' as const, cobertura: 'all' as const, estado: 'all' as const, q: '' };
  it('separa ativos de arquivados', () => {
    expect(filtrar(list, base, HOJE).map(s => s.id)).toEqual(['a']);
    expect(filtrar(list, { ...base, separador: 'arquivados' }, HOJE).map(s => s.id)).toEqual(['b']);
  });
  it('pesquisa por matrícula sem hífens', () => {
    expect(filtrar(list, { ...base, q: '00aa' }, HOJE).map(s => s.id)).toEqual(['a']);
  });
});

describe('formulário', () => {
  const ok = { ...emptyForm(HOJE), matricula: '00-AA-00', viatura: 'BMW X1', solicitante: 'Rui', fim: '2027-01-01' };
  it('válido contra terceiros', () => expect(validarForm(ok)).toBeNull());
  it('danos próprios exigem valor seguro', () => {
    expect(validarForm({ ...ok, cobertura: 'danos_proprios' })).toMatch(/valor seguro/);
    expect(validarForm({ ...ok, cobertura: 'danos_proprios', capital_seguro: '35.000,50', responsavel_info: 'Ana' })).toBeNull();
  });
  it('fim anterior ao início é inválido', () => expect(validarForm({ ...ok, fim: '2026-01-01' })).toMatch(/fim/));
  it('parseEuro aceita formato PT e simples', () => {
    expect(parseEuro('1.234,50 €')).toBe(1234.5);
    expect(parseEuro('1234.5')).toBe(1234.5);
    expect(parseEuro('abc')).toBeNull();
  });
});

describe('venda detetada e dados em falta', () => {
  const vend = [{ matricula: '00aa00', origem: 'retail' as const, data_venda: '2026-11-05' }];
  it('liga o seguro à venda pela matrícula e descreve-a', () => {
    const v = vendaDe(mk('a'), vend);
    expect(v?.origem).toBe('retail');
    expect(textoVenda(v!)).toBe('passou a Retail em 05-11-2026');
    expect(vendaDe(mk('b', { matricula_norm: '11BB11', matricula: '11-BB-11' }), vend)).toBeNull();
  });
  it('assinala danos próprios sem fim ou sem responsável; terceiros e arquivados nunca', () => {
    expect(dadosEmFalta(mk('a', { cobertura: 'danos_proprios', capital_seguro: 1000, fim: null }))).toEqual(['data de fim', 'responsável pela informação']);
    expect(dadosEmFalta(mk('a', { cobertura: 'danos_proprios', capital_seguro: 1000, responsavel_info: 'Ana', fim: null }))).toEqual(['data de fim']);
    expect(dadosEmFalta(mk('a'))).toEqual([]);
    expect(dadosEmFalta(mk('a', { cobertura: 'danos_proprios', capital_seguro: 1, arquivado: true }))).toEqual([]);
    expect(kpis([mk('a', { cobertura: 'danos_proprios', capital_seguro: 1000, fim: null })], [], HOJE).dadosEmFalta).toBe(1);
  });
});

describe('cancelar seguro e upgrade', () => {
  it('a mensagem traz matrícula, apólice, efeito e motivo', () => {
    const t = mensagemCancelamento(mk('a', { apolice: '8671602', seguradora: 'Seg SA', fim: null }),
      { efeito: '2026-11-12', motivo: 'Viatura vendida', now: new Date(2026, 10, 12, 9) });
    expect(t).toContain('Assunto: Cancelamento de seguro | 00-AA-00 | Apólice 8671602');
    expect(t).toContain('Bom dia,');
    expect(t).toContain('com efeito a 12-11-2026');
    expect(t).toContain('Seguradora: Seg SA');
    expect(t).toContain('Motivo: Viatura vendida');
    expect(t).toContain('sem termo');
  });
  it('o upgrade valida os campos obrigatórios e as datas', () => {
    const s = { inicio: '2026-10-01' };
    const ok = { capital_seguro: '35000', dp_desde: '2026-11-12', fim: '2027-10-01', responsavel_info: 'Ana' };
    expect(validarUpgrade(ok, s)).toBeNull();
    expect(validarUpgrade({ ...ok, capital_seguro: '' }, s)).toMatch(/valor seguro/);
    expect(validarUpgrade({ ...ok, fim: '' }, s)).toMatch(/fim/);
    expect(validarUpgrade({ ...ok, responsavel_info: ' ' }, s)).toMatch(/responsável/);
    expect(validarUpgrade({ ...ok, dp_desde: '2026-09-01' }, s)).toMatch(/anterior/);
    expect(validarUpgrade({ ...ok, fim: '2026-11-01' }, s)).toMatch(/anterior/);
  });
  it('descreve o histórico', () => {
    expect(historicoLabel({ tipo: 'cobertura', de: 'terceiros', para: 'danos_proprios' })).toBe('Cobertura: Contra terceiros → Danos próprios');
    expect(historicoLabel({ tipo: 'arquivado', de: null, para: 'viatura_vendida' })).toBe('Arquivado — Viatura vendida');
  });
});

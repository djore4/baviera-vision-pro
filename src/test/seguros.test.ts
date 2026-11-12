import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  alertas, cobreHoje, custoPorArea, emptyForm, estadoSeguro, filtrar, kpis, normMatricula, parqueSemSeguro,
  parseEuro, validarForm, type Seguro,
} from '@/lib/seguros';
import { ADMIN_ONLY_TAB_KEYS, ARCHIVED_TAB_KEYS, PERMISSION_TABS, TABS } from '@/lib/permissions';

const HOJE = '2026-11-12';

const mk = (id: string, over: Partial<Seguro> = {}): Seguro => ({
  id, matricula: '00-AA-00', matricula_norm: '00AA00', chassis: null, viatura: 'BMW iX1', area: 'bmw_vn',
  solicitante: 'Rui', cliente: null, data_pedido: '2026-10-01', inicio: '2026-10-01', fim: '2027-10-01',
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
    const a = alertas([mk('a'), mk('b', { matricula: '11-BB-11', matricula_norm: '11BB11' })], [{ matricula: '00aa00' }], HOJE);
    expect(a.vendidosAtivos.map(s => s.id)).toEqual(['a']);
  });
  it('deteta seguros sobrepostos na mesma matrícula, mas não consecutivos', () => {
    const sobrep = alertas([mk('a', { fim: '2027-01-31' }), mk('b', { inicio: '2027-01-01', fim: '2027-12-31' })], [], HOJE);
    expect(sobrep.sobrepostos).toHaveLength(1);
    const seguidos = alertas([mk('a', { fim: '2026-12-31' }), mk('b', { inicio: '2027-01-01', fim: '2027-12-31' })], [], HOJE);
    expect(seguidos.sobrepostos).toHaveLength(0);
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
      { chassis: '1', matricula: '00-AA-00', modelo: null, versao: null, marca: null },
      { chassis: '2', matricula: '22-CC-22', modelo: null, versao: null, marca: null },
      { chassis: '3', matricula: null, modelo: null, versao: null, marca: null },
    ];
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
    expect(validarForm({ ...ok, cobertura: 'danos_proprios', capital_seguro: '35.000,50' })).toBeNull();
  });
  it('fim anterior ao início é inválido', () => expect(validarForm({ ...ok, fim: '2026-01-01' })).toMatch(/fim/));
  it('parseEuro aceita formato PT e simples', () => {
    expect(parseEuro('1.234,50 €')).toBe(1234.5);
    expect(parseEuro('1234.5')).toBe(1234.5);
    expect(parseEuro('abc')).toBeNull();
  });
});

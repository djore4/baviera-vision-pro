import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { equipaDe, equipaDeduzida, objetivoDe, progresso, OBJETIVO_MENSAL } from '@/lib/cartao-go';
import { TABS, PERMISSION_TABS } from '@/lib/permissions';

describe('CCGo — equipa', () => {
  it('a equipa definida manda sobre a deduzida', () => {
    expect(equipaDe({ equipa: 'APV', negocio: ['VU'] })).toBe('APV');
  });
  it('deduz de negocio/marca enquanto não houver equipa', () => {
    expect(equipaDeduzida({ negocio: ['VD'], marca: ['BMW'] })).toBe('BMW VN');
    expect(equipaDeduzida({ negocio: 'VU' })).toBe('BMW VU');
    expect(equipaDeduzida({ negocio: ['VD'], marca: ['BMW Motorrad'] })).toBe('Motorrad');
  });
  it('o APV nunca se deduz e sem dados fica por tipificar', () => {
    expect(equipaDe({ negocio: null, marca: null })).toBeNull();
    expect(equipaDe({ equipa: 'lixo', negocio: null })).toBeNull();
  });
});

describe('CCGo — objetivo e progresso', () => {
  it('equipa sem objetivo usa o padrão; com objetivo (incl. 0) usa o definido', () => {
    expect(objetivoDe('APV', {})).toBe(OBJETIVO_MENSAL);
    expect(objetivoDe('APV', { APV: 5 })).toBe(5);
    expect(objetivoDe(null, { APV: 5 })).toBe(OBJETIVO_MENSAL);
  });
  it('progresso', () => {
    expect(progresso(1, 2)).toEqual({ feitos: 1, objetivo: 2, cumprido: false, falta: 1 });
    expect(progresso(3, 2)).toMatchObject({ cumprido: true, falta: 0 });
  });
});

describe('CCGo — tab', () => {
  it('está em Transversal e é atribuível na matriz', () => {
    expect(TABS.find(t => t.key === 'ccgo')).toMatchObject({ area: 'apv', path: '/ccgo' });
    expect(PERMISSION_TABS.some(t => t.key === 'ccgo')).toBe(true);
  });
});

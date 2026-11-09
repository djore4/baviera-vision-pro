import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  getMyAccessExceptions, getAppCapabilities, SUB_PERMISSIONS, TABS, PERMISSION_TABS, ARCHIVED_TAB_KEYS, restritoPeloLocal, tabLivreForaDoLocal,
} from '@/lib/permissions';

beforeEach(() => { rpc.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('getMyAccessExceptions', () => {
  it('lê as exceções do utilizador atual da base de dados', async () => {
    rpc.mockResolvedValue({ data: { stock: 'edit', funil: 'view' }, error: null });
    expect(await getMyAccessExceptions()).toEqual({ stock: 'edit', funil: 'view' });
    expect(rpc).toHaveBeenCalledWith('my_access_exceptions');
  });

  it('ignora níveis inválidos: nunca eleva acesso por engano', async () => {
    rpc.mockResolvedValue({ data: { stock: 'edit', x: 'admin', y: 'none', z: 1 }, error: null });
    expect(await getMyAccessExceptions()).toEqual({ stock: 'edit' });
  });

  it('sem exceções (null/{}) devolve {}', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getMyAccessExceptions()).toEqual({});
  });

  it('erro que não é "função em falta" → {} e aviso, sem rebentar (nunca eleva acesso)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    expect(await getMyAccessExceptions('tiago.santos@caetano.pt')).toEqual({});
    expect(console.warn).toHaveBeenCalled();
  });

  describe('função em falta (migração por aplicar)', () => {
    const MISSING = { code: 'PGRST202', message: 'Could not find the function' };

    it('usa a cópia legada do config, para ninguém perder a edição entre o deploy e a migração', async () => {
      rpc.mockResolvedValue({ data: null, error: MISSING });
      expect(await getMyAccessExceptions('tiago.santos@caetano.pt')).toEqual({ stock: 'edit' });
      expect(await getMyAccessExceptions('Tiago.Santos@Caetano.pt')).toEqual({ stock: 'edit' });   // sem distinguir maiúsculas
    });

    it('quem não tem exceção legada, ou sem email, não ganha nada', async () => {
      rpc.mockResolvedValue({ data: null, error: MISSING });
      expect(await getMyAccessExceptions('outro@caetano.pt')).toEqual({});
      expect(await getMyAccessExceptions(null)).toEqual({});
      expect(await getMyAccessExceptions()).toEqual({});
    });

    it('com a função presente, a cópia legada é ignorada', async () => {
      rpc.mockResolvedValue({ data: {}, error: null });
      expect(await getMyAccessExceptions('tiago.santos@caetano.pt')).toEqual({});
    });
  });
});

describe('permissões finas (SUB_PERMISSIONS)', () => {
  it('cada uma pertence a um tab que existe e tem a chave "<tab>:<ação>"', () => {
    expect(SUB_PERMISSIONS.length).toBeGreaterThan(0);
    for (const sp of SUB_PERMISSIONS) {
      expect(TABS.some(t => t.key === sp.parent)).toBe(true);
      expect(sp.key.startsWith(`${sp.parent}:`)).toBe(true);
      expect(sp.label).toBeTruthy();
    }
  });

  it('não colidem com chaves de tabs nem entre si', () => {
    const keys = SUB_PERMISSIONS.map(sp => sp.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(PERMISSION_TABS.some(t => t.key === k)).toBe(false);
  });

  it('as Multas estão em Vendas VN, atribuíveis na matriz e fora do Arquivo', () => {
    const multas = TABS.find(t => t.key === 'multas');
    expect(multas?.area).toBe('vn');
    expect(multas?.adminOnly).toBeFalsy();
    expect(ARCHIVED_TAB_KEYS).not.toContain('multas');
    expect(PERMISSION_TABS.some(t => t.key === 'multas')).toBe(true);
  });

  it('o Diário está arquivado: fora da matriz, só admin, no Arquivo', () => {
    const diario = TABS.find(t => t.key === 'prospecao');
    expect(diario?.adminOnly).toBe(true);
    expect(diario?.area).toBe('admin');
    expect(PERMISSION_TABS.some(t => t.key === 'prospecao')).toBe(false);
  });

  it('cada uma depende de uma capacidade que existe, para só aparecer com a migração aplicada', () => {
    const known = ['lavagemGranular', 'eotGranular', 'eotResponsaveis', 'viaturasLocal', 'demosPrecos'];
    for (const sp of SUB_PERMISSIONS) expect(known).toContain(sp.capability);
  });

  it('o End-of-Term tem as permissões "todos" e "local", ligadas às suas capacidades', () => {
    const eot = SUB_PERMISSIONS.filter(sp => sp.parent === 'end-of-term');
    expect(eot.map(sp => sp.key)).toEqual(['end-of-term:todos', 'end-of-term:local']);
    expect(eot.map(sp => sp.capability)).toEqual(['eotGranular', 'eotResponsaveis']);
  });

  it('Demos tem a permissão de inserir viaturas do seu local, livre fora de Aveiro', () => {
    const v = SUB_PERMISSIONS.filter(sp => sp.parent === 'demos');
    expect(v.map(sp => sp.key)).toEqual(['demos:inserir-viaturas', 'demos:precos']);
    expect(v.map(sp => sp.capability)).toEqual(['viaturasLocal', 'demosPrecos']);
    expect(tabLivreForaDoLocal('demos:inserir-viaturas')).toBe(true);
    expect(tabLivreForaDoLocal('demos:precos', ['demos'])).toBe(true);
    expect(tabLivreForaDoLocal('demos')).toBe(false);
  });

  it('a Lavagem tem as quatro ações que a RLS conhece', () => {
    const lav = SUB_PERMISSIONS.filter(sp => sp.parent === 'lavagem').map(sp => sp.key).sort();
    expect(lav).toEqual(['lavagem:iniciar', 'lavagem:qualidade', 'lavagem:reagendar', 'lavagem:registos']);
  });
});

describe('getAppCapabilities', () => {
  it('lê as capacidades da base de dados', async () => {
    rpc.mockResolvedValue({ data: { lavagem_granular: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: true, eotGranular: false, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false, demosGestao: false });
    expect(rpc).toHaveBeenCalledWith('app_capabilities');
  });

  it('lê cada capacidade por separado', async () => {
    rpc.mockResolvedValue({ data: { lavagem_granular: true, eot_granular: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: true, eotGranular: true, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false, demosGestao: false });
    rpc.mockResolvedValue({ data: { eot_granular: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: true, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false, demosGestao: false });
    rpc.mockResolvedValue({ data: { eot_responsaveis: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false, eotResponsaveis: true, viaturasLocal: false, demosPrecos: false, demosGestao: false });
  });

  it('sem a função (migração por aplicar) ou com erro: nenhuma capacidade', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false, demosGestao: false });
  });

  it('só um true explícito conta', async () => {
    rpc.mockResolvedValue({ data: { lavagem_granular: 'true' }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false, demosGestao: false });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false, demosGestao: false });
  });
});


describe('restrição por local', () => {
  it('só Aveiro (canónico, em lista, texto ou alias) escapa à restrição', () => {
    expect(restritoPeloLocal({ local: ['Aveiro'] })).toBe(false);
    expect(restritoPeloLocal({ local: ['Porto', 'Aveiro'] })).toBe(false);
    expect(restritoPeloLocal({ local: 'Caetano Aveiro 2' })).toBe(false);
    expect(restritoPeloLocal({ local: ['Porto'] })).toBe(true);
    expect(restritoPeloLocal({ local: ['Gaia', 'Feira'] })).toBe(true);
    // sem local (ou sem nenhum reconhecido) não há restrição: segue-se a função
    expect(restritoPeloLocal({ local: ['Todas'] })).toBe(false);
    expect(restritoPeloLocal({ local: [] })).toBe(false);
    expect(restritoPeloLocal({ local: null })).toBe(false);
    expect(restritoPeloLocal(null)).toBe(false);
  });

  it('o End-of-Term e as suas permissões escapam; o resto não', () => {
    expect(tabLivreForaDoLocal('end-of-term')).toBe(true);
    expect(tabLivreForaDoLocal('end-of-term:todos')).toBe(true);
    expect(tabLivreForaDoLocal('end-of-term-x')).toBe(false);
    expect(tabLivreForaDoLocal('retails')).toBe(false);
    expect(tabLivreForaDoLocal('lavagem:reagendar')).toBe(false);
    // Tabs por local (app_tabs_por_local): o tab e as suas ações, só quando configurados.
    expect(tabLivreForaDoLocal('demos')).toBe(false);
    expect(tabLivreForaDoLocal('demos', ['demos'])).toBe(true);
    expect(tabLivreForaDoLocal('demos:inserir-viaturas', [])).toBe(true);
    expect(tabLivreForaDoLocal('retails', ['demos'])).toBe(false);
    expect(tabLivreForaDoLocal('demosx', ['demos'])).toBe(false);
  });
});

describe('Comparativo', () => {
  it('é um tab de VN só para administradores: fora da matriz e fora do Arquivo', () => {
    const t = TABS.find(x => x.key === 'comparativo');
    expect(t?.area).toBe('vn');
    expect(t?.adminOnly).toBe(true);
    expect(PERMISSION_TABS.some(x => x.key === 'comparativo')).toBe(false);
    expect(ARCHIVED_TAB_KEYS).not.toContain('comparativo');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getMyAccessExceptions, getAppCapabilities, SUB_PERMISSIONS, TABS, PERMISSION_TABS } from '@/lib/permissions';

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

  it('cada uma depende de uma capacidade que existe, para só aparecer com a migração aplicada', () => {
    const known = ['lavagemGranular', 'eotGranular'];
    for (const sp of SUB_PERMISSIONS) expect(known).toContain(sp.capability);
  });

  it('o End-of-Term tem a permissão "todos", ligada à sua capacidade', () => {
    const eot = SUB_PERMISSIONS.filter(sp => sp.parent === 'end-of-term');
    expect(eot.map(sp => sp.key)).toEqual(['end-of-term:todos']);
    expect(eot[0].capability).toBe('eotGranular');
  });

  it('a Lavagem tem as quatro ações que a RLS conhece', () => {
    const lav = SUB_PERMISSIONS.filter(sp => sp.parent === 'lavagem').map(sp => sp.key).sort();
    expect(lav).toEqual(['lavagem:iniciar', 'lavagem:qualidade', 'lavagem:reagendar', 'lavagem:registos']);
  });
});

describe('getAppCapabilities', () => {
  it('lê as capacidades da base de dados', async () => {
    rpc.mockResolvedValue({ data: { lavagem_granular: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: true, eotGranular: false });
    expect(rpc).toHaveBeenCalledWith('app_capabilities');
  });

  it('lê cada capacidade por separado', async () => {
    rpc.mockResolvedValue({ data: { lavagem_granular: true, eot_granular: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: true, eotGranular: true });
    rpc.mockResolvedValue({ data: { eot_granular: true }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: true });
  });

  it('sem a função (migração por aplicar) ou com erro: nenhuma capacidade', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false });
  });

  it('só um true explícito conta', async () => {
    rpc.mockResolvedValue({ data: { lavagem_granular: 'true' }, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getAppCapabilities()).toEqual({ lavagemGranular: false, eotGranular: false });
  });
});

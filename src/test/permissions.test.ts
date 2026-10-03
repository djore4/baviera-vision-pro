import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getMyAccessExceptions, SUB_PERMISSIONS, TABS, PERMISSION_TABS } from '@/lib/permissions';

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

  it('erro (ex.: migração por aplicar) → {} e aviso, sem rebentar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    expect(await getMyAccessExceptions()).toEqual({});
    expect(console.warn).toHaveBeenCalled();
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

  it('a Lavagem tem as quatro ações que a RLS conhece', () => {
    const lav = SUB_PERMISSIONS.filter(sp => sp.parent === 'lavagem').map(sp => sp.key).sort();
    expect(lav).toEqual(['lavagem:iniciar', 'lavagem:qualidade', 'lavagem:reagendar', 'lavagem:registos']);
  });
});

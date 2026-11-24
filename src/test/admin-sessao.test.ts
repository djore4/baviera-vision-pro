import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const refreshSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { refreshSession: () => refreshSession() } },
}));

import { deleteRole, AdminError, SESSAO_TERMINADA } from '@/lib/permissions';

const resp401 = () => ({ message: 'Edge Function returned a non-2xx status code', context: { status: 401, json: async () => ({ error: 'Não autenticado.' }) } });

beforeEach(() => { invoke.mockReset(); refreshSession.mockReset(); });

describe('operações de administração com a sessão terminada (401)', () => {
  it('sessão já terminada: não repete e explica o que fazer (em vez de um erro genérico)', async () => {
    invoke.mockResolvedValue({ data: null, error: resp401() });
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh_token_not_found' } });
    const err = await deleteRole('Vendedor VN').catch(e => e);
    expect(err).toBeInstanceOf(AdminError);
    expect(err.message).toBe(SESSAO_TERMINADA);
    expect(err.code).toBe('session_expired');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('token apenas expirado: renova a sessão e repete uma vez, com sucesso', async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: resp401() })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } }, error: null });
    await deleteRole('Vendedor VN');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('se depois de renovar continua a dar 401, desiste (sem ciclos)', async () => {
    invoke.mockResolvedValue({ data: null, error: resp401() });
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'novo' } }, error: null });
    await expect(deleteRole('X')).rejects.toMatchObject({ code: 'session_expired' });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('outros erros (ex. 403 sem permissão) mantêm a mensagem da função e não renovam a sessão', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'x', context: { status: 403, json: async () => ({ error: 'Sem permissão de administrador.' }) } } });
    await expect(deleteRole('X')).rejects.toMatchObject({ message: 'Sem permissão de administrador.' });
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

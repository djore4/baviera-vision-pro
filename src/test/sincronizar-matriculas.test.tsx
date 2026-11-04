import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn();
const refresh = vi.fn(async () => {});
let ADMIN = true;
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ refresh }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ isAdmin: ADMIN }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SincronizarMatriculasButton, { resumoSync } from '@/components/SincronizarMatriculasButton';
import { toast } from 'sonner';

beforeEach(() => { invoke.mockReset(); refresh.mockClear(); ADMIN = true; });

describe('Sincronizar matrículas', () => {
  it('só o administrador vê o botão', () => {
    ADMIN = false;
    const { container } = render(<SincronizarMatriculasButton />);
    expect(container.textContent).toBe('');
  });

  it('chama a função, mostra o resumo e recarrega os dados', async () => {
    invoke.mockResolvedValue({ data: { mensagens: 12, pedidas: 2, matriculas: 1, totalIgnoradas: 0, ignoradas: [] }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('sync-matriculas', { body: { dias: 30 } });
    expect(toast.success).toHaveBeenCalled();
  });

  it('mostra o erro (ex.: não configurado) sem recarregar', async () => {
    invoke.mockResolvedValue({ data: { error: 'Sincronização não configurada' }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('resumoSync faz o plural certo', () => {
    expect(resumoSync({ pedidas: 1, matriculas: 1, totalIgnoradas: 0, mensagens: 3 })).toBe('1 pedido confirmado · 1 matrícula preenchida (3 emails lidos).');
    expect(resumoSync({ pedidas: 2, matriculas: 0, totalIgnoradas: 4, mensagens: 9 })).toMatch(/2 pedidos confirmados · 0 matrículas preenchidas · 4 por tratar/);
  });
});

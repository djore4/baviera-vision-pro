import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const perms = { isAdmin: true };
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => perms }));
const refresh = vi.fn().mockResolvedValue(undefined);
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ data: { control: [] }, refresh }) }));
vi.mock('@/components/RecordEditor', () => ({ RECORDS_CHANGED_EVENT: 'control-records-changed' }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const planear = vi.fn();
const aplicar = vi.fn();
vi.mock('@/lib/email-sync-client', async orig => ({
  ...(await orig<typeof import('@/lib/email-sync-client')>()),
  planearSincronizacao: (...a: unknown[]) => planear(...a),
  aplicarPlano: (...a: unknown[]) => aplicar(...a),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import SincronizarEmailButton from '@/components/SincronizarEmailButton';
import { EmailSyncError } from '@/lib/email-sync-client';
import { toast } from 'sonner';

const plano = {
  desde: '2026-10-20', jaAtualizados: 0,
  changes: [{
    recordId: 'r1', enc: '9710001', cliente: 'Cliente Um', origem: ['matriculas'] as const,
    antes: { status: 'Carteira', mat: '', chas: '', dmat: null },
    patch: { status: 'Matricula', mat: 'AA-26-BB', dmat: '2026-11-02' },
  }],
  issues: [{ kind: 'conflito' as const, origem: 'matriculas' as const, ref: '9710002', detalhe: 'Matrícula do email ≠ do registo.' }],
};

beforeEach(() => { vi.clearAllMocks(); perms.isAdmin = true; });

describe('botão Sincronizar', () => {
  it('só o administrador o vê', () => {
    perms.isAdmin = false;
    const { container } = render(<SincronizarEmailButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra o que mudaria e só grava depois de confirmar', async () => {
    planear.mockResolvedValue(plano);
    aplicar.mockResolvedValue({ aplicadas: 1, falhadas: [] });
    render(<SincronizarEmailButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await screen.findByText('Sincronizar com o email');
    expect(screen.getByText('9710001')).toBeInTheDocument();
    expect(screen.getByText(/Matrícula do email ≠ do registo/)).toBeInTheDocument();
    expect(aplicar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Gravar 1 alteração/ }));
    await waitFor(() => expect(aplicar).toHaveBeenCalledWith(plano.changes));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it('cancelar não grava nada', async () => {
    planear.mockResolvedValue(plano);
    render(<SincronizarEmailButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await screen.findByText('Sincronizar com o email');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(aplicar).not.toHaveBeenCalled();
  });

  it('sem nada novo avisa e não abre o diálogo', async () => {
    planear.mockResolvedValue({ desde: '2026-10-20', changes: [], issues: [], jaAtualizados: 3 });
    render(<SincronizarEmailButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Tudo em dia', expect.anything()));
    expect(screen.queryByText('Sincronizar com o email')).toBeNull();
  });

  it('explica o erro quando o acesso ao email não está configurado', async () => {
    planear.mockRejectedValue(new EmailSyncError('Falta configurar o acesso ao email (MS_TENANT_ID).'));
    render(<SincronizarEmailButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falta configurar o acesso ao email (MS_TENANT_ID).'));
  });
});

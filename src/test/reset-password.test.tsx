import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppUser } from '@/lib/permissions';

/* Repor a password: num login partilhado com a Caetano Sales Force a edge function recusa até o
 * administrador confirmar (allow_shared), porque a password muda nas duas aplicações. */

const updateUser = vi.fn();
vi.mock('@/lib/permissions', async orig => ({
  ...(await orig<typeof import('@/lib/permissions')>()),
  updateUser: (...a: unknown[]) => updateUser(...a),
}));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ me: { email: 'admin@x.pt' }, setViewAs: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UsersPanel } from '@/components/users/UsersPanel';
import { AdminError } from '@/lib/permissions';
import { toast } from 'sonner';

const users: AppUser[] = [
  { id: '1', nome: 'José Tavares', email: 'jose@x.pt', perfil: 'Supervisor EoT', local: null, negocio: null, marca: null },
];
const abrir = async () => {
  render(<MemoryRouter><UsersPanel users={users} loading={false} roleNames={['Supervisor EoT']} onChanged={async () => {}} /></MemoryRouter>);
  fireEvent.click(screen.getByTitle('Repor password'));
  const input = await screen.findByLabelText('Nova password');
  fireEvent.change(input, { target: { value: 'Nova-pass-1' } });
};
const repor = () => fireEvent.click(screen.getByRole('button', { name: /^Repor/ }));

beforeEach(() => { updateUser.mockReset(); vi.clearAllMocks(); });

describe('Repor password', () => {
  it('login só desta plataforma: repõe à primeira, sem confirmação', async () => {
    updateUser.mockResolvedValue(users[0]);
    await abrir();
    repor();
    await waitFor(() => expect(screen.getByText(/Reposta\. Copia a password/)).toBeTruthy());
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith('1', {}, 'Nova-pass-1', false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('login partilhado: avisa, pede confirmação e só depois repõe (allowShared)', async () => {
    updateUser
      .mockRejectedValueOnce(new AdminError('partilhado', 'shared_login'))
      .mockResolvedValueOnce(users[0]);
    await abrir();
    repor();

    // 1.ª tentativa recusada: aviso visível, sem erro genérico e sem dar como feito
    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toMatch(/partilhado com a Caetano Sales Force/);
    expect(aviso.textContent).toMatch(/nas duas aplicações/);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(/Reposta\. Copia a password/)).toBeNull();
    expect(updateUser).toHaveBeenLastCalledWith('1', {}, 'Nova-pass-1', false);

    // confirma: repete com allowShared = true
    fireEvent.click(screen.getByRole('button', { name: 'Repor nas duas aplicações' }));
    await waitFor(() => expect(screen.getByText(/Reposta\. Copia a password/)).toBeTruthy());
    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenLastCalledWith('1', {}, 'Nova-pass-1', true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mudar a password depois do aviso anula a confirmação (tem de confirmar de novo)', async () => {
    updateUser.mockRejectedValue(new AdminError('partilhado', 'shared_login'));
    await abrir();
    repor();
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Nova password'), { target: { value: 'Outra-pass-2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Repor' })).toBeTruthy();
  });

  it('outros erros continuam a mostrar-se como erro, sem pedir confirmação', async () => {
    updateUser.mockRejectedValue(new AdminError('Erro ao alterar a password: x'));
    await abrir();
    repor();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao alterar a password: x'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

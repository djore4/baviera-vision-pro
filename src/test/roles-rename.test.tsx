import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppRole, AppUser } from '@/lib/permissions';

const renameRole = vi.fn();
vi.mock('@/lib/permissions', async orig => ({
  ...(await orig<typeof import('@/lib/permissions')>()),
  renameRole: (...a: unknown[]) => renameRole(...a),
}));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RolesPanel } from '@/components/users/RolesPanel';
import { toast } from 'sonner';

const roles: AppRole[] = [
  { name: 'Admin', is_admin: true, permissions: {} },
  { name: 'Comercial', is_admin: false, permissions: { retails: 'view' } },
  { name: 'Lavador', is_admin: false, permissions: { lavagem: 'view' } },
];
const users: AppUser[] = [
  { id: '1', nome: 'Ana', email: 'ana@x.pt', perfil: 'Comercial', local: null, negocio: null, marca: null },
  { id: '2', nome: 'Rui', email: 'rui@x.pt', perfil: 'Comercial', local: null, negocio: null, marca: null },
];

const mount = (onSaved = vi.fn(async () => {})) =>
  render(<RolesPanel roles={roles} users={users} loading={false} onSaved={onSaved} />);

beforeEach(() => { renameRole.mockReset(); vi.clearAllMocks(); });

describe('Renomear função', () => {
  it('renomeia a função escolhida e recarrega', async () => {
    renameRole.mockResolvedValue({ name: 'Vendas', permissions: {}, is_admin: false });
    const onSaved = vi.fn(async () => {});
    mount(onSaved);
    fireEvent.click(screen.getAllByText('Comercial')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear função' }));
    expect(screen.getByText(/Os 2 utilizadores com esta função passam/)).toBeTruthy();
    const input = screen.getByLabelText('Novo nome') as HTMLInputElement;
    expect(input.value).toBe('Comercial');
    expect((screen.getByRole('button', { name: /^Renomear$/ }) as HTMLButtonElement).disabled).toBe(true); // igual ao atual
    fireEvent.change(input, { target: { value: '  Vendas ' } });
    fireEvent.click(screen.getByRole('button', { name: /^Renomear$/ }));
    await waitFor(() => expect(renameRole).toHaveBeenCalledWith('Comercial', 'Vendas'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('recusa um nome que já existe (sem distinguir maiúsculas)', async () => {
    mount();
    fireEvent.click(screen.getAllByText('Comercial')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear função' }));
    fireEvent.change(screen.getByLabelText('Novo nome'), { target: { value: 'lavador' } });
    fireEvent.click(screen.getByRole('button', { name: /^Renomear$/ }));
    expect(renameRole).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Já existe uma função com esse nome.');
  });

  it('avisa quando o nome tem uma regra antiga ligada', () => {
    mount();
    fireEvent.click(screen.getAllByText('Lavador')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear função' }));
    expect(screen.getByText(/ainda tem uma regra antiga ligada ao nome/)).toBeTruthy();
  });

  it('mostra o erro do servidor', async () => {
    renameRole.mockRejectedValue(new Error('Falta publicar a versão nova da função admin-users'));
    mount();
    fireEvent.click(screen.getAllByText('Comercial')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear função' }));
    fireEvent.change(screen.getByLabelText('Novo nome'), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: /^Renomear$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falta publicar a versão nova da função admin-users'));
  });
});

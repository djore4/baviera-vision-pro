/* Painel Funções com a matriz por local: o seletor de local edita a matriz desse local
 * e só envia permissions_local quando algo mudou nos locais. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { AppRole } from '@/lib/permissions';

const ctx = { capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true, viaturasLocal: true, demosPrecos: true, demosGestao: true, demosReservas: true }, tabsPorLocal: ['demos'] };
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ctx }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const saveRole = vi.fn().mockResolvedValue({});
vi.mock('@/lib/permissions', async orig => ({ ...(await orig<typeof import('@/lib/permissions')>()), saveRole: (...a: unknown[]) => saveRole(...a) }));

import { RolesPanel } from '@/components/users/RolesPanel';

const roles: AppRole[] = [{
  name: 'Comercial', is_admin: false,
  permissions: { retails: 'view', 'end-of-term': 'view' },
  permissions_local: { Porto: { lavagem: 'view' } },
}];

const linha = (label: string) => screen.getAllByText(label)[0].closest('li') as HTMLElement;

beforeEach(() => saveRole.mockClear());

describe('Funções: matriz por local', () => {
  it('mostra um seletor com os locais e "Sem local"', () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    for (const l of ['Maia', 'Porto', 'Gaia', 'Feira', 'Aveiro', 'Sem local']) {
      expect(screen.getByRole('radio', { name: l })).toBeTruthy();
    }
  });

  it('cada local mostra a sua matriz (Porto: guardada; Aveiro: regra anterior = matriz base)', () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Porto' }));
    expect(within(linha('Lavagem')).getByRole('radio', { name: 'Consulta', checked: true })).toBeTruthy();
    expect(within(linha('WIP')).getByRole('radio', { name: 'Sem acesso', checked: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Aveiro' }));
    expect(within(linha('WIP')).getByRole('radio', { name: 'Consulta', checked: true })).toBeTruthy();
  });

  it('editar um local grava a matriz de todos os locais; editar só "Sem local" não envia permissions_local', async () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Porto' }));
    fireEvent.click(within(linha('WIP')).getByRole('radio', { name: 'Edição' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRole).toHaveBeenCalledTimes(1));
    const [nome, base, admin, locais] = saveRole.mock.calls[0];
    expect(nome).toBe('Comercial'); expect(admin).toBe(false);
    expect(base).toEqual({ retails: 'view', 'end-of-term': 'view' });
    expect(Object.keys(locais).sort()).toEqual(['Aveiro', 'Feira', 'Gaia', 'Maia', 'Porto']);
    expect(locais.Porto).toEqual({ lavagem: 'view', retails: 'edit' });
    expect(locais.Aveiro).toEqual({ retails: 'view', 'end-of-term': 'view' });
    expect(locais.Feira).toEqual({ 'end-of-term': 'view' });
  });

  it('só a matriz base alterada: permissions_local não é enviado', async () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sem local' }));
    fireEvent.click(within(linha('WIP')).getByRole('radio', { name: 'Edição' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRole).toHaveBeenCalledTimes(1));
    expect(saveRole.mock.calls[0][3]).toBeUndefined();
    expect(saveRole.mock.calls[0][1]).toEqual({ retails: 'edit', 'end-of-term': 'view' });
  });
});

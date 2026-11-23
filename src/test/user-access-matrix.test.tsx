/* Contas: cada conta mostra os seus acessos com todos os locais lado a lado. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AppRole, AppUser } from '@/lib/permissions';

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ me: null, setViewAs: vi.fn(), tabsPorLocal: [], capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true, viaturasLocal: true, demosPrecos: true, demosGestao: true, demosReservas: true } }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UsersPanel } from '@/components/users/UsersPanel';

const roles: AppRole[] = [{
  name: 'Vendedor', is_admin: false,
  permissions: { retails: 'view', 'end-of-term': 'edit' },
  permissions_local: { Porto: { retails: 'edit', 'end-of-term': 'edit' }, Maia: { 'end-of-term': 'edit' } },
  permissions_equipa: { 'BMW VN': { funil: 'edit' } },
}];
const users: AppUser[] = [
  { id: 1, nome: 'Joana Lopes', email: 'jl@x.pt', perfil: 'Vendedor', local: ['Porto'], negocio: null, marca: null, equipa: 'BMW VN' },
  { id: 2, nome: 'Rui Duarte', email: 'rd@x.pt', perfil: 'Vendedor', local: ['Maia'], negocio: null, marca: null, equipa: null },
];

const montar = () => render(<UsersPanel users={users} loading={false} roleNames={['Vendedor']} roles={roles} onChanged={async () => {}} />);
const nivel = (tab: string, col: string) => screen.getByLabelText(new RegExp(`^${tab} · ${col}:`)).textContent;

describe('Contas: acessos por local da conta', () => {
  it('abre os acessos da conta com todos os locais lado a lado e o acesso final', () => {
    montar();
    expect(screen.queryByText('Acesso da conta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ver os acessos de Joana Lopes/ }));
    for (const l of ['Maia', 'Porto', 'Gaia', 'Feira', 'Aveiro']) expect(screen.getByRole('columnheader', { name: new RegExp(l) })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Porto.*conta/ })).toBeTruthy();
    expect(nivel('WIP', 'Porto')).toBe('Editar');
    expect(nivel('WIP', 'Maia')).toBe('—');
    expect(nivel('WIP', 'Aveiro')).toBe('Ver');
    // a equipa BMW VN dá edição no Funil em todos os locais
    expect(nivel('Funil', 'Maia')).toBe('Editar');
    const linha = screen.getByText('WIP').closest('tr') as HTMLElement;
    expect(within(linha).getByText('Edição')).toBeTruthy();
    expect(within(linha).getByText('Matriz do local Porto')).toBeTruthy();
  });

  it('o acesso final segue os locais da própria conta (Rui, em Maia, fica sem WIP embora outros locais o tenham)', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Ver os acessos de Rui Duarte/ }));
    const linha = screen.getByText('WIP').closest('tr') as HTMLElement;
    expect(within(linha).getByText('Sem acesso')).toBeTruthy();
    expect(nivel('WIP', 'Porto')).toBe('Editar');
  });

  it('mostra que o Funil da equipa não chega a locais sem matriz própria (Gaia, Feira)', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Ver os acessos de Joana Lopes/ }));
    expect(nivel('Funil', 'Maia')).toBe('Editar');
    expect(nivel('Funil', 'Gaia')).toBe('—');
    expect(nivel('Funil', 'Feira')).toBe('—');
  });

  it('"Só diferenças entre locais" esconde os tabs iguais em todos os locais', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Ver os acessos de Joana Lopes/ }));
    expect(screen.getAllByText('End-of-Term').length).toBeGreaterThan(0);    // igual em todos os locais
    fireEvent.click(screen.getByRole('checkbox', { name: /Só diferenças entre locais/ }));
    expect(screen.queryByText('End-of-Term')).toBeNull();
    expect(screen.getAllByText('WIP').length).toBeGreaterThan(0);            // varia entre locais
  });
});

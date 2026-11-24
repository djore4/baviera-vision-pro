/* Contas: cada conta abre uma lista do que pode fazer, com a origem de cada nível. */
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
  name: 'Vendedor', is_admin: false, modelo_simples: true,
  permissions: { retails: 'edit', funil: 'view', 'end-of-term': 'edit' },
  permissions_outros: { retails: 'view', 'end-of-term': 'edit' },
}];
const users: AppUser[] = [
  { id: 1, nome: 'Joana Lopes', email: 'jl@x.pt', perfil: 'Vendedor', local: ['Porto'], negocio: null, marca: null, equipa: null },
  { id: 2, nome: 'Rui Duarte', email: 'rd@x.pt', perfil: 'Vendedor', local: ['Aveiro'], negocio: null, marca: null, equipa: null },
];

const montar = () => render(<UsersPanel users={users} loading={false} roleNames={['Vendedor']} roles={roles} onChanged={async () => {}} />);
const linha = (tab: string) => screen.getAllByText(tab)[0].closest('li') as HTMLElement;

describe('Contas: o que cada conta pode fazer', () => {
  it('abre a lista da conta com o nível final e a origem', () => {
    montar();
    expect(screen.queryByText(/Mostrar também sem acesso/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ver os acessos de Joana Lopes/ }));
    expect(within(linha('WIP')).getByText('Consulta')).toBeTruthy();
    expect(within(linha('WIP')).getByText(/outros locais \(Porto\)/)).toBeTruthy();
    expect(screen.queryByText('Funil')).toBeNull();                 // sem acesso fora de Aveiro e escondido por defeito
    fireEvent.click(screen.getByRole('checkbox', { name: /Mostrar também sem acesso/ }));
    expect(within(linha('Funil')).getByText('Sem acesso')).toBeTruthy();
  });

  it('em Aveiro segue a matriz completa', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Ver os acessos de Rui Duarte/ }));
    expect(within(linha('WIP')).getByText('Edição')).toBeTruthy();
    expect(within(linha('Funil')).getByText('Consulta')).toBeTruthy();
    expect(within(linha('WIP')).getByText('Perfil · Aveiro')).toBeTruthy();
  });
});

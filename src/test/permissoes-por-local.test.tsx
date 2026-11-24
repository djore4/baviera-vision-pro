/* Permissões por perfil (modelo simples): um perfil de cada vez, uma lista de tabs com nível e "onde". */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { AppRole, AppUser } from '@/lib/permissions';

const ctx = { capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true, viaturasLocal: true, demosPrecos: true, demosGestao: true, demosReservas: true }, tabsPorLocal: ['demos'] };
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ctx }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const saveRoleSimples = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/permissions', async orig => ({ ...(await orig<typeof import('@/lib/permissions')>()), saveRoleSimples: (...a: unknown[]) => saveRoleSimples(...a) }));

import { RolesPanel } from '@/components/users/RolesPanel';

const roles: AppRole[] = [
  { name: 'Comercial', is_admin: false, modelo_simples: true, permissions: { retails: 'view', funil: 'edit', 'end-of-term': 'view' }, permissions_outros: { funil: 'edit', 'end-of-term': 'view' } },
  { name: 'Lavador', is_admin: false, modelo_simples: true, permissions: { lavagem: 'view' }, permissions_outros: {} },
  { name: 'Chefe', is_admin: true, permissions: {} },
];
const gente: AppUser[] = [
  { id: '1', nome: 'Ana', email: 'ana@x.pt', perfil: 'Comercial', local: ['Porto'], negocio: null, marca: null },
  { id: '2', nome: 'Rui', email: 'rui@x.pt', perfil: 'Comercial', local: null, negocio: null, marca: null },
];

const montar = (r = roles) => render(<RolesPanel roles={r} users={gente} loading={false} onSaved={async () => {}} />);
const seletor = (tab: string) => screen.getAllByRole('radiogroup', { name: tab })[0];
const nivel = (tab: string, n: string) => within(seletor(tab)).getByRole('radio', { name: n });
const onde = (tab: string) => screen.getByLabelText(`${tab}: onde`) as HTMLSelectElement;

beforeEach(() => saveRoleSimples.mockClear());

describe('Permissões de um perfil', () => {
  it('abre o primeiro perfil editável (o de administrador não aparece) com o nível e o "onde" de cada tab', () => {
    montar();
    expect(screen.getByRole('combobox', { name: 'Perfil' })).toHaveTextContent('Comercial');
    expect(nivel('WIP', 'Consulta')).toHaveAttribute('aria-checked', 'true');
    expect(onde('WIP').value).toBe('aveiro');          // retails só em Aveiro
    expect(nivel('Funil', 'Edição')).toHaveAttribute('aria-checked', 'true');
    expect(onde('Funil').value).toBe('todos');
    expect(nivel('Produção', 'Sem acesso')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText('Produção: onde')).toBeNull();
  });

  it('mudar o nível mantém o onde; dar acesso a um tab sem acesso fica em todos os locais', async () => {
    montar();
    fireEvent.click(nivel('WIP', 'Edição'));
    expect(onde('WIP').value).toBe('aveiro');
    fireEvent.click(nivel('Produção', 'Consulta'));
    expect(onde('Produção').value).toBe('todos');
    fireEvent.change(onde('Produção'), { target: { value: 'outros' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRoleSimples).toHaveBeenCalledTimes(1));
    const [nome, completo, outros] = saveRoleSimples.mock.calls[0];
    expect(nome).toBe('Comercial');
    expect(completo).toEqual({ retails: 'edit', funil: 'edit', 'end-of-term': 'view' });
    expect(outros).toEqual({ funil: 'edit', 'end-of-term': 'view', producao: 'view' });
  });

  it('o que não se toca grava-se exatamente como estava', async () => {
    montar();
    fireEvent.click(nivel('Funil', 'Consulta'));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRoleSimples).toHaveBeenCalled());
    expect(saveRoleSimples.mock.calls[0][1]).toEqual({ retails: 'view', funil: 'view', 'end-of-term': 'view' });
    expect(saveRoleSimples.mock.calls[0][2]).toEqual({ funil: 'view', 'end-of-term': 'view' });
  });

  it('"Todos" define o nível de uma área inteira', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Vendas VU: Edição em todos os tabs' }));
    expect(nivel('Stock', 'Edição')).toHaveAttribute('aria-checked', 'true');
    expect(nivel('WIP', 'Consulta')).toHaveAttribute('aria-checked', 'true'); // WIP VN (outra área) não muda
  });

  it('escolher outro perfil mostra as permissões desse perfil; alterações por guardar sinalizam-se', () => {
    montar();
    fireEvent.click(nivel('WIP', 'Edição'));
    fireEvent.click(screen.getByRole('combobox', { name: 'Perfil' }));
    fireEvent.click(screen.getByRole('option', { name: /Lavador/ }));
    expect(nivel('Lavagem', 'Consulta')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/perfil com alterações/)).toBeTruthy();
  });

  it('com perfis ainda no modelo antigo pede a migração e não deixa editar', () => {
    montar([roles[0], { name: 'Velho', is_admin: false, permissions: { retails: 'view' } }]);
    expect(screen.getByText(/Falta aplicar a migração das permissões/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

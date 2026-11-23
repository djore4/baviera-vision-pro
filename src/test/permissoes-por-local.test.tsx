/* Matriz única (modelo simples): todos os perfis lado a lado, cada um com "Aveiro" (completo) e
 * "Outros locais". Cada célula edita uma das duas matrizes; guardar envia as duas por perfil. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppRole, AppUser } from '@/lib/permissions';

const ctx = { capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true, viaturasLocal: true, demosPrecos: true, demosGestao: true, demosReservas: true }, tabsPorLocal: ['demos'] };
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ctx }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const saveRoleSimples = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/permissions', async orig => ({ ...(await orig<typeof import('@/lib/permissions')>()), saveRoleSimples: (...a: unknown[]) => saveRoleSimples(...a) }));

import { RolesPanel } from '@/components/users/RolesPanel';

const roles: AppRole[] = [
  { name: 'Comercial', is_admin: false, modelo_simples: true, permissions: { retails: 'view', funil: 'edit', 'end-of-term': 'view' }, permissions_outros: { 'end-of-term': 'view' } },
  { name: 'Lavador', is_admin: false, modelo_simples: true, permissions: { lavagem: 'view' }, permissions_outros: {} },
  { name: 'Chefe', is_admin: true, permissions: {} },
];
const gente: AppUser[] = [
  { id: '1', nome: 'Ana', email: 'ana@x.pt', perfil: 'Comercial', local: ['Porto'], negocio: null, marca: null },
  { id: '2', nome: 'Rui', email: 'rui@x.pt', perfil: 'Comercial', local: null, negocio: null, marca: null },
  { id: '3', nome: 'Leo', email: 'leo@x.pt', perfil: 'Lavador', local: ['Aveiro'], negocio: null, marca: null },
];

const cel = (tab: string, col: string, perfil = 'Comercial') => screen.getAllByRole('button', { name: new RegExp(`^${tab} · ${perfil} · ${col}:`) })[0];
const montar = (r = roles) => render(<RolesPanel roles={r} users={gente} loading={false} onSaved={async () => {}} />);

beforeEach(() => saveRoleSimples.mockClear());

describe('Matriz única: perfil × tab (Aveiro / Outros locais)', () => {
  it('mostra os perfis editáveis lado a lado (o de administrador não) com as contas afetadas por coluna', () => {
    montar();
    expect(screen.getByText('2 utilizadores')).toBeTruthy();
    expect(screen.getByText('1 utilizador')).toBeTruthy();
    expect(cel('Lavagem', 'Aveiro', 'Lavador')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /· Chefe ·/ })).toBeNull();
    expect(cel('WIP', 'Aveiro')).toHaveAccessibleName(/Consulta/);
    expect(cel('WIP', 'Outros locais')).toHaveAccessibleName(/Sem acesso/);
  });

  it('o clique percorre sem acesso → consulta → edição → sem acesso', () => {
    montar();
    fireEvent.click(cel('Lavagem', 'Outros locais', 'Lavador')); expect(cel('Lavagem', 'Outros locais', 'Lavador')).toHaveAccessibleName(/Consulta/);
    fireEvent.click(cel('Lavagem', 'Outros locais', 'Lavador')); expect(cel('Lavagem', 'Outros locais', 'Lavador')).toHaveAccessibleName(/Edição/);
    fireEvent.click(cel('Lavagem', 'Outros locais', 'Lavador')); expect(cel('Lavagem', 'Outros locais', 'Lavador')).toHaveAccessibleName(/Sem acesso/);
  });

  it('edita vários perfis e grava cada um com as suas duas matrizes', async () => {
    montar();
    fireEvent.click(cel('Lavagem', 'Aveiro', 'Lavador'));        // consulta → edição
    fireEvent.click(cel('WIP', 'Outros locais', 'Comercial'));   // retails (WIP VN): sem acesso → consulta
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRoleSimples).toHaveBeenCalledTimes(2));
    const porNome = Object.fromEntries(saveRoleSimples.mock.calls.map(c => [c[0], c]));
    expect(porNome.Lavador[1]).toEqual({ lavagem: 'edit' });
    expect(porNome.Lavador[2]).toEqual({});
    expect(porNome.Comercial[1]).toEqual({ retails: 'view', funil: 'edit', 'end-of-term': 'view' });
    expect(porNome.Comercial[2]).toEqual({ retails: 'view', 'end-of-term': 'view' });
  });

  it('destaca os tabs em que "Outros locais" difere de Aveiro e filtra por diferenças', () => {
    montar();
    expect(cel('Funil', 'Outros locais').className).toMatch(/outline-amber/);
    expect(cel('End-of-Term', 'Outros locais').className).not.toMatch(/outline-amber/);
    fireEvent.click(screen.getByRole('checkbox', { name: /Só linhas com diferenças/ }));
    expect(screen.queryByText('End-of-Term')).toBeNull();
    expect(screen.getAllByText('Funil').length).toBeGreaterThan(0);
  });

  it('esconder um perfil não altera dados', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Lavador', pressed: true }));
    expect(screen.queryByRole('button', { name: /· Lavador ·/ })).toBeNull();
    expect(saveRoleSimples).not.toHaveBeenCalled();
  });

  it('"Área" define um perfil nas duas colunas', () => {
    montar();
    fireEvent.click(screen.getAllByRole('button', { name: /Transversal · Lavador: Edição nas duas colunas/ })[0]);
    for (const c of ['Aveiro', 'Outros locais']) expect(cel('Lavagem', c, 'Lavador')).toHaveAccessibleName(/Edição/);
    expect(cel('Lavagem', 'Aveiro', 'Comercial')).toHaveAccessibleName(/Sem acesso/);
  });

  it('com perfis ainda no modelo antigo pede a migração e não deixa editar', () => {
    montar([...roles.slice(0, 1), { name: 'Velho', is_admin: false, permissions: { retails: 'view' } }]);
    expect(screen.getByText(/Falta aplicar a migração das permissões/)).toBeTruthy();
    expect(screen.getByText('Velho')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /· Comercial ·/ })).toBeNull();
  });
});

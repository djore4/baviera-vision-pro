/* Permissões de um perfil: tabela com os locais e, dentro de cada local, as suas equipas. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppRole, AppUser } from '@/lib/permissions';

const ctx = { capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true, viaturasLocal: true, demosPrecos: true, demosGestao: true, demosReservas: true }, tabsPorLocal: ['demos'] };
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ctx }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const saveRoleMatriz = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/permissions', async orig => ({ ...(await orig<typeof import('@/lib/permissions')>()), saveRoleMatriz: (...a: unknown[]) => saveRoleMatriz(...a) }));

import { RolesPanel } from '@/components/users/RolesPanel';

const roles: AppRole[] = [
  { name: 'Comercial', is_admin: false, modelo_matriz: true, permissions: {},
    permissions_matriz: { Aveiro: { 'BMW VN': { retails: 'view', funil: 'edit' }, _: { retails: 'view' } }, Porto: { 'BMW VN': { funil: 'view' } } } },
  { name: 'Lavador', is_admin: false, modelo_matriz: true, permissions: {}, permissions_matriz: { Aveiro: { _: { lavagem: 'view', 'lavagem:iniciar': 'edit' } } } },
  { name: 'Chefe', is_admin: true, permissions: {} },
];
const gente: AppUser[] = [
  { id: '1', nome: 'Ana', email: 'ana@x.pt', perfil: 'Comercial', local: ['Porto'], negocio: null, marca: null, equipa: 'BMW VN' },
  { id: '2', nome: 'Rui', email: 'rui@x.pt', perfil: 'Comercial', local: null, negocio: null, marca: null, equipa: null },
];

const montar = (r = roles) => render(<RolesPanel roles={r} users={gente} loading={false} onSaved={async () => {}} />);
const cel = (tab: string, local: string, equipa: string) => screen.getAllByRole('button', { name: new RegExp(`^${tab} · ${local} · ${equipa}:`) })[0];

beforeEach(() => saveRoleMatriz.mockClear());

describe('Matriz de um perfil: Local → Equipa → Tabs', () => {
  it('abre o primeiro perfil editável (o de administrador não aparece) com os locais e, dentro de cada um, as equipas', () => {
    montar();
    expect(screen.getByRole('combobox', { name: 'Perfil' })).toHaveTextContent('Comercial');
    for (const l of ['Maia', 'Porto', 'Gaia', 'Feira', 'Aveiro', 'Sem local']) expect(screen.getAllByRole('columnheader', { name: l }).length, l).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'VN' })).toHaveLength(6);   // as equipas repetem-se dentro de cada local
    expect(cel('WIP', 'Aveiro', 'BMW VN')).toHaveAccessibleName(/Consulta/);
    expect(cel('WIP', 'Aveiro', 'Sem equipa')).toHaveAccessibleName(/Consulta/);
    expect(cel('WIP', 'Porto', 'BMW VN')).toHaveAccessibleName(/Sem acesso/);
    expect(cel('Funil', 'Porto', 'BMW VN')).toHaveAccessibleName(/Consulta/);
  });

  it('o clique percorre sem acesso → consulta → edição → sem acesso numa só célula', () => {
    montar();
    for (const n of ['Consulta', 'Edição', 'Sem acesso']) { fireEvent.click(cel('Produção', 'Gaia', 'BMW VU')); expect(cel('Produção', 'Gaia', 'BMW VU')).toHaveAccessibleName(new RegExp(n)); }
    expect(cel('Produção', 'Gaia', 'BMW VN')).toHaveAccessibleName(/Sem acesso/);   // as outras não mexem
  });

  it('grava a matriz inteira do perfil só com o que mudou', async () => {
    montar();
    fireEvent.click(cel('Produção', 'Gaia', 'BMW VU'));            // → consulta
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRoleMatriz).toHaveBeenCalledTimes(1));
    const [nome, m] = saveRoleMatriz.mock.calls[0];
    expect(nome).toBe('Comercial');
    expect(m).toEqual({ Aveiro: { 'BMW VN': { retails: 'view', funil: 'edit' }, _: { retails: 'view' } }, Porto: { 'BMW VN': { funil: 'view' } }, Gaia: { 'BMW VU': { producao: 'view' } } });
  });

  it('clicar no nome do tab aplica o próximo nível a toda a linha', () => {
    montar();
    fireEvent.click(screen.getAllByRole('button', { name: 'Carteira' })[0]);
    expect(cel('Carteira', 'Maia', 'APV')).toHaveAccessibleName(/Consulta/);
    expect(cel('Carteira', 'Sem local', 'Sem equipa')).toHaveAccessibleName(/Consulta/);
  });

  it('"Copiar local" leva as equipas de um local para outro', () => {
    montar();
    fireEvent.click(screen.getByRole('combobox', { name: 'Copiar do local' })); fireEvent.click(screen.getByRole('option', { name: 'Aveiro' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Copiar para o local' })); fireEvent.click(screen.getByRole('option', { name: 'Maia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(cel('Funil', 'Maia', 'BMW VN')).toHaveAccessibleName(/Edição/);
    expect(cel('WIP', 'Maia', 'Sem equipa')).toHaveAccessibleName(/Consulta/);
  });

  it('"Só colunas com contas" mostra apenas as combinações local/equipa que têm contas do perfil', () => {
    montar();
    fireEvent.click(screen.getByRole('checkbox', { name: /Só colunas com contas/ }));
    expect(screen.queryByRole('button', { name: /^WIP · Aveiro · BMW VN:/ })).toBeNull();
    expect(cel('WIP', 'Porto', 'BMW VN')).toBeTruthy();
    expect(cel('WIP', 'Sem local', 'Sem equipa')).toBeTruthy();
  });

  it('as permissões finas só aparecem com o interruptor ligado', () => {
    montar();
    fireEvent.click(screen.getByRole('combobox', { name: 'Perfil' })); fireEvent.click(screen.getByRole('option', { name: /Lavador/ }));
    expect(screen.queryByRole('button', { name: /Criar e iniciar · Aveiro/ })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Permissões finas/ }));
    expect(screen.getAllByRole('button', { name: /Criar e iniciar · Aveiro · Sem equipa: Edição/ }).length).toBe(1);
  });

  it('com perfis ainda no modelo antigo pede a migração e não deixa editar', () => {
    montar([roles[0], { name: 'Velho', is_admin: false, permissions: { retails: 'view' } }]);
    expect(screen.getByText(/Falta aplicar a migração das permissões/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Perfil' })).toBeNull();
  });
});

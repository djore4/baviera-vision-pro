/* Matriz única: todos os perfis, com locais e equipas lado a lado. Cada célula edita um local/equipa;
 * só se envia permissions_local quando algo mudou nos locais (ou nas equipas) e permissions_equipa
 * quando mudou a camada das equipas. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  permissions_equipa: { 'BMW VN': { funil: 'view' } },
}];

const cel = (tab: string, col: string, perfil = 'Comercial') => screen.getAllByRole('button', { name: new RegExp(`^${tab} · ${perfil} · ${col}:`) })[0];

beforeEach(() => saveRole.mockClear());

describe('Funções: matriz por local e equipa', () => {
  it('cada célula mostra o nível do seu local (Porto: guardado; Aveiro: regra anterior = base) e a equipa herda ou sobrepõe', () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    expect(cel('Lavagem', 'Porto')).toHaveAccessibleName(/Consulta/);
    expect(cel('WIP', 'Porto')).toHaveAccessibleName(/Sem acesso/);
    expect(cel('WIP', 'Aveiro')).toHaveAccessibleName(/Consulta/); // regra anterior = base
    expect(cel('Funil', 'BMW VN')).toHaveAccessibleName(/Consulta/);
    expect(cel('Funil', 'BMW VU')).toHaveAccessibleName(/herda do local/);
  });

  it('o clique percorre sem acesso → consulta → edição; na equipa, herda → sem acesso → consulta → edição → herda', () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(cel('Lavagem', 'Gaia'));
    expect(cel('Lavagem', 'Gaia')).toHaveAccessibleName(/Consulta/);
    fireEvent.click(cel('Lavagem', 'Gaia'));
    expect(cel('Lavagem', 'Gaia')).toHaveAccessibleName(/Edição/);
    const passos = ['Sem acesso', 'Consulta', 'Edição', 'herda do local'];
    for (const p of passos) { fireEvent.click(cel('Produto', 'BMW VU')); expect(cel('Produto', 'BMW VU')).toHaveAccessibleName(new RegExp(p)); }
  });

  it('editar um local grava a matriz de todos os locais e NÃO envia a camada de equipas', async () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(cel('WIP', 'Porto')); fireEvent.click(cel('WIP', 'Porto')); // WIP VN = retails: sem acesso → consulta → edição
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRole).toHaveBeenCalledTimes(1));
    const [nome, base, admin, locais, equipas] = saveRole.mock.calls[0];
    expect(nome).toBe('Comercial'); expect(admin).toBe(false);
    expect(base).toEqual({ retails: 'view', 'end-of-term': 'view' });
    expect(Object.keys(locais).sort()).toEqual(['Aveiro', 'Feira', 'Gaia', 'Maia', 'Porto']);
    expect(locais.Porto).toEqual({ lavagem: 'view', retails: 'edit' });
    expect(locais.Aveiro).toEqual({ retails: 'view', 'end-of-term': 'view' });
    expect(equipas).toBeUndefined();
  });

  it('só a coluna "Sem local" alterada: nem locais nem equipas são enviados', async () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(cel('WIP', 'Sem local')); // WIP VN = retails: consulta → edição
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRole).toHaveBeenCalledTimes(1));
    expect(saveRole.mock.calls[0][3]).toBeUndefined();
    expect(saveRole.mock.calls[0][4]).toBeUndefined();
    expect(saveRole.mock.calls[0][1]).toEqual({ retails: 'edit', 'end-of-term': 'view' });
  });

  it('alterar a equipa envia a camada (com "sem acesso" explícito) e congela os locais', async () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(cel('Funil', 'BMW VN'));                                          // consulta → edição
    fireEvent.click(cel('Stock', 'BMW VN'));                                          // herda → sem acesso (explícito)
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRole).toHaveBeenCalledTimes(1));
    const [, , , locais, equipas] = saveRole.mock.calls[0];
    expect(equipas).toEqual({ 'BMW VN': { funil: 'edit', stock: 'none' } });
    expect(Object.keys(locais).sort()).toEqual(['Aveiro', 'Feira', 'Gaia', 'Maia', 'Porto']);
  });

  it('"Só linhas com diferenças" esconde os tabs iguais em todos os locais e sem equipas', () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    expect(screen.getAllByText('Produto').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: /Só linhas com diferenças/ }));
    expect(screen.queryByText('Produto')).toBeNull();     // igual em todos os locais
    expect(screen.getAllByText('Funil').length).toBeGreaterThan(0); // tem equipa a sobrepor-se
  });
});

const dois: AppRole[] = [
  ...roles,
  { name: 'Lavador', is_admin: false, permissions: { lavagem: 'view' } },
  { name: 'Chefe', is_admin: true, permissions: {} },
];
const gente = [
  { id: '1', nome: 'Ana', email: 'ana@x.pt', perfil: 'Comercial', local: ['Porto'], negocio: null, marca: null, equipa: 'BMW VN' },
  { id: '2', nome: 'Rui', email: 'rui@x.pt', perfil: 'Comercial', local: null, negocio: null, marca: null },
  { id: '3', nome: 'Leo', email: 'leo@x.pt', perfil: 'Lavador', local: ['Maia'], negocio: null, marca: null },
];

describe('Matriz única: vários perfis', () => {
  it('mostra todos os perfis editáveis lado a lado (o de administrador não) com os utilizadores afetados', () => {
    render(<RolesPanel roles={dois} users={gente} loading={false} onSaved={async () => {}} />);
    expect(screen.getByText('2 utilizadores')).toBeTruthy();
    expect(screen.getByText('1 utilizador')).toBeTruthy();
    expect(cel('Lavagem', 'Maia', 'Lavador')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /· Chefe ·/ })).toBeNull();
  });

  it('edita vários perfis de uma vez e grava cada um', async () => {
    render(<RolesPanel roles={dois} users={gente} loading={false} onSaved={async () => {}} />);
    fireEvent.click(cel('Lavagem', 'Sem local', 'Lavador'));          // consulta → edição
    fireEvent.click(cel('WIP', 'Sem local', 'Comercial'));            // retails: consulta → edição
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(saveRole).toHaveBeenCalledTimes(2));
    const porNome = Object.fromEntries(saveRole.mock.calls.map(c => [c[0], c]));
    expect(porNome.Lavador[1]).toEqual({ lavagem: 'edit' });
    expect(porNome.Comercial[1]).toEqual({ retails: 'edit', 'end-of-term': 'view' });
    expect(porNome.Lavador[3]).toBeUndefined();
  });

  it('os filtros escondem perfis, locais e equipas sem alterar dados', () => {
    render(<RolesPanel roles={dois} users={gente} loading={false} onSaved={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lavador', pressed: true }));
    expect(screen.queryByRole('button', { name: /· Lavador ·/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gaia', pressed: true }));
    expect(screen.queryByRole('button', { name: /· Comercial · Gaia:/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BMW VU', pressed: true }));
    expect(screen.queryByRole('button', { name: /· Comercial · BMW VU:/ })).toBeNull();
    expect(cel('Lavagem', 'Porto')).toBeTruthy();
    expect(saveRole).not.toHaveBeenCalled();
  });

  it('"Área toda" define o nível de um perfil em todos os locais visíveis', () => {
    render(<RolesPanel roles={dois} users={gente} loading={false} onSaved={async () => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Transversal · Lavador: Edição em todos os locais/ })[0]);
    for (const l of ['Maia', 'Porto', 'Gaia', 'Feira', 'Aveiro', 'Sem local']) expect(cel('Lavagem', l, 'Lavador')).toHaveAccessibleName(/Edição/);
    expect(cel('Lavagem', 'Maia', 'Comercial')).toHaveAccessibleName(/Sem acesso/);
  });
});

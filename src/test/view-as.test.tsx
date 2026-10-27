import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppRole, AppUser } from '@/lib/permissions';

/* Modo "ver como": o administrador simula as permissões de outro utilizador. */

const ROLES: AppRole[] = [
  { name: 'Admin', is_admin: true, permissions: {} },
  { name: 'Vendedor', is_admin: false, permissions: { retails: 'view', funil: 'edit', produto: 'view' } },
  { name: 'Outro admin', is_admin: true, permissions: {} },
];
const user = (email: string, perfil: string | null, local: unknown = null): AppUser => ({
  id: email, nome: email.split('@')[0], email, perfil, local, negocio: null, marca: null,
});
const USERS = [
  user('admin@x.pt', 'Admin'), user('vend@x.pt', 'Vendedor', ['Porto']),
  user('semperfil@x.pt', null), user('chefe@x.pt', 'Outro admin'),
];

let SESSION_EMAIL = 'admin@x.pt';
vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: SESSION_EMAIL } } }) }));
vi.mock('@/lib/permissions', async orig => ({
  ...(await orig<typeof import('@/lib/permissions')>()),
  listRoles: vi.fn(async () => ROLES),
  listUsers: vi.fn(async () => USERS),
  isPlatformAdmin: vi.fn(async () => false),
  getMyAccessExceptions: vi.fn(async () => ({ utilizadores: 'edit' as const })), // exceção do admin real
  getAppCapabilities: vi.fn(async () => ({ lavagemGranular: false, eotGranular: false, eotResponsaveis: false })),
}));

import { PermissionsProvider, usePermissions } from '@/contexts/PermissionsContext';
import { ViewAsBanner } from '@/components/ViewAsBanner';

let ctx: ReturnType<typeof usePermissions>;
const Probe = () => { ctx = usePermissions(); return <span data-testid="role">{ctx.roleName}</span>; };
const mount = () => render(<PermissionsProvider><Probe /></PermissionsProvider>);

beforeEach(() => { sessionStorage.clear(); SESSION_EMAIL = 'admin@x.pt'; });

describe('Ver como', () => {
  it('sem simulação, o administrador vê e edita tudo', async () => {
    mount();
    await waitFor(() => expect(ctx?.isAdmin).toBe(true));
    expect(ctx.viewingAs).toBeNull();
    expect(ctx.canEdit('retails')).toBe(true);
    expect(ctx.canView('utilizadores')).toBe(true);
    expect(ctx.allUsers).toHaveLength(4);
  });

  it('simula um vendedor: só o que a função dá, sem exceções do admin', async () => {
    mount();
    await waitFor(() => expect(ctx?.realIsAdmin).toBe(true));
    act(() => ctx.setViewAs('Vend@x.pt'));
    await waitFor(() => expect(ctx.viewingAs?.email).toBe('vend@x.pt'));
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.realIsAdmin).toBe(true);
    expect(ctx.roleName).toBe('Vendedor');
    expect(ctx.canView('retails')).toBe(true);
    expect(ctx.canEdit('retails')).toBe(false);
    expect(ctx.canEdit('funil')).toBe(true);
    expect(ctx.canView('lavagem')).toBe(false);
    expect(ctx.canView('utilizadores')).toBe(false); // adminOnly/exceção do admin real não se herdam
    expect(ctx.canView('dados')).toBe(false);
    expect(ctx.me?.email).toBe('vend@x.pt');
    expect(ctx.effectiveEmail).toBe('vend@x.pt');
  });

  it('utilizador sem função não tem acesso a nada; simular um admin dá acesso total', async () => {
    mount();
    await waitFor(() => expect(ctx?.realIsAdmin).toBe(true));
    act(() => ctx.setViewAs('semperfil@x.pt'));
    await waitFor(() => expect(ctx.viewingAs?.email).toBe('semperfil@x.pt'));
    expect(ctx.canView('retails')).toBe(false);
    act(() => ctx.setViewAs('chefe@x.pt'));
    await waitFor(() => expect(ctx.isAdmin).toBe(true));
    expect(ctx.canEdit('dados')).toBe(true);
  });

  it('sair do modo repõe o acesso do administrador', async () => {
    mount();
    await waitFor(() => expect(ctx?.realIsAdmin).toBe(true));
    act(() => ctx.setViewAs('vend@x.pt'));
    await waitFor(() => expect(ctx.isAdmin).toBe(false));
    act(() => ctx.setViewAs(null));
    await waitFor(() => expect(ctx.isAdmin).toBe(true));
    expect(ctx.viewingAs).toBeNull();
    expect(ctx.effectiveEmail).toBe('admin@x.pt');
  });

  it('sobrevive a recarregar a página (sessão), mas só para o administrador que o ativou', async () => {
    sessionStorage.setItem('view-as', JSON.stringify({ by: 'admin@x.pt', as: 'vend@x.pt' }));
    const a = mount();
    await waitFor(() => expect(ctx?.viewingAs?.email).toBe('vend@x.pt'));
    a.unmount();

    sessionStorage.setItem('view-as', JSON.stringify({ by: 'outro@x.pt', as: 'vend@x.pt' }));
    mount();
    await waitFor(() => expect(ctx?.realIsAdmin).toBe(true));
    expect(ctx.viewingAs).toBeNull();
  });

  it('um utilizador que não é administrador não consegue simular ninguém', async () => {
    SESSION_EMAIL = 'vend@x.pt';
    sessionStorage.setItem('view-as', JSON.stringify({ by: 'vend@x.pt', as: 'admin@x.pt' }));
    mount();
    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('Vendedor'));
    act(() => ctx.setViewAs('admin@x.pt'));
    expect(ctx.viewingAs).toBeNull();
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.canView('dados')).toBe(false);
    expect(ctx.allUsers).toEqual([]);
  });

  it('a faixa mostra quem se simula (função e locais) e permite sair', async () => {
    sessionStorage.setItem('view-as', JSON.stringify({ by: 'admin@x.pt', as: 'vend@x.pt' }));
    render(<MemoryRouter><PermissionsProvider><Probe /><ViewAsBanner /></PermissionsProvider></MemoryRouter>);
    const faixa = await screen.findByRole('status');
    expect(faixa.textContent).toContain('A ver como');
    expect(faixa.textContent).toContain('Vendedor · Porto');
    expect(faixa.textContent).toContain('gravações continuam a ser os do administrador');
    fireEvent.click(screen.getByRole('button', { name: /Sair do modo/ }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(ctx.isAdmin).toBe(true);
    expect(sessionStorage.getItem('view-as')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signOut = vi.fn(async () => ({}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signOut: () => signOut() } } }));
vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: 'ana.silva@x.pt' } } }) }));
let PERMS: Record<string, unknown> = {};
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => PERMS }));

import { UserMenu } from '@/components/UserMenu';
import { capturarPedidoInstalacao } from '@/lib/install-prompt';

const ua = (s: string) => Object.defineProperty(navigator, 'userAgent', { value: s, configurable: true });
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';

let capturado = false;
beforeEach(() => {
  localStorage.clear(); signOut.mockClear();
  PERMS = { me: { nome: 'Ana Silva' }, viewingAs: null, realIsAdmin: false, roleName: 'Comercial' };
  ua(ANDROID);
  if (!capturado) { capturarPedidoInstalacao(); capturado = true; }
});

const abrir = () => {
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  const t = screen.getByRole('button', { name: 'Menu do utilizador' });
  fireEvent.keyDown(t, { key: 'Enter' });
};

describe('Menu do utilizador', () => {
  it('mostra o perfil, Definições, instalar e terminar sessão', async () => {
    abrir();
    expect(await screen.findByText('Ana Silva')).toBeTruthy();
    expect(screen.getByText('ana.silva@x.pt')).toBeTruthy();
    expect(screen.getByText('Comercial')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Definições/ }).getAttribute('href')).toBe('/definicoes');
    expect(screen.getByRole('menuitem', { name: /Instalar a app/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Sugerir melhoria/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Terminar sessão/ }));
    expect(signOut).toHaveBeenCalled();
  });

  it('as iniciais vêm do nome', () => {
    render(<MemoryRouter><UserMenu /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Menu do utilizador' }).textContent).toBe('AS');
  });

  it('sem o evento do browser, "Instalar a app" abre as instruções', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Instalar a app/ }));
    expect(await screen.findByText(/Instalar aplicação/)).toBeTruthy();
  });

  it('com o evento do browser, "Instalar a app" abre o diálogo nativo', async () => {
    abrir();
    let abriu = false;
    act(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => { abriu = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Instalar a app/ }));
    await act(async () => { await Promise.resolve(); });
    expect(abriu).toBe(true);
    expect(screen.queryByText(/Instalar aplicação/)).toBeNull();
  });

  it('"Sugerir melhoria" abre o formulário de sugestão', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('menuitem', { name: /Sugerir melhoria/ }));
    expect(await screen.findByText('Sugerir uma melhoria')).toBeTruthy();
  });

  it('em "ver como" mostra a identidade real (email e Administrador), não a simulada', async () => {
    PERMS = { me: { nome: 'Rui Vendedor' }, viewingAs: { email: 'rui@x.pt' }, realIsAdmin: true, roleName: 'Vendedor' };
    abrir();
    expect(await screen.findByText('Administrador')).toBeTruthy();
    expect(screen.queryByText('Rui Vendedor')).toBeNull();
    expect(screen.getAllByText('ana.silva@x.pt').length).toBeGreaterThan(0);
  });
});

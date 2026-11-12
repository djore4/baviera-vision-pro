import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const setTheme = vi.fn();
let THEME = 'light';
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: THEME, setTheme }) }));

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
  localStorage.clear(); signOut.mockClear(); setTheme.mockClear(); THEME = 'light';
  PERMS = { me: { nome: 'Ana Silva' }, viewingAs: null, realIsAdmin: false, roleName: 'Comercial' };
  ua(ANDROID);
  if (!capturado) { capturarPedidoInstalacao(); capturado = true; }
});

const abrir = () => {
  render(<MemoryRouter><UserMenu /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Menu do utilizador' }));
};

describe('Menu do utilizador', () => {
  it('mostra o perfil, Definições, instalar e terminar sessão', async () => {
    abrir();
    expect(await screen.findByText('Ana Silva')).toBeTruthy();
    expect(screen.getByText('ana.silva@x.pt')).toBeTruthy();
    expect(screen.getByText('Comercial')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Definições/ }).getAttribute('href')).toBe('/definicoes');
    expect(screen.getByRole('button', { name: /Instalar a app/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sugerir melhoria/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Terminar sessão/ }));
    expect(signOut).toHaveBeenCalled();
  });

  it('escolher um tema aplica-o e marca a opção ativa', async () => {
    THEME = 'dark';
    abrir();
    expect((await screen.findByRole('radio', { name: /Escuro/ })).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Claro/ }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: /Sistema/ }));
    expect(setTheme).toHaveBeenCalledWith('system');
  });

  it('as iniciais vêm do nome', () => {
    render(<MemoryRouter><UserMenu /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Menu do utilizador' }).textContent).toBe('AS');
  });

  it('sem o evento do browser, "Instalar a app" abre as instruções', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Instalar a app/ }));
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
    fireEvent.click(await screen.findByRole('button', { name: /Instalar a app/ }));
    await act(async () => { await Promise.resolve(); });
    expect(abriu).toBe(true);
    expect(screen.queryByText(/Instalar aplicação/)).toBeNull();
  });

  it('"Sugerir melhoria" abre o formulário de sugestão', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: /Sugerir melhoria/ }));
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

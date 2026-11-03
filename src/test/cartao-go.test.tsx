import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { CartaoGoRegisto } from '@/lib/cartao-go';

/* Cartão Caetano Go: o aviso do 'Vendedor VN' insiste (a cada entrada, página e regresso ao
 * separador) até o administrador registar o objetivo do mês. */

const reg = (n: number): CartaoGoRegisto[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, vendedor_email: 'ana@x.pt', data: '2026-11-02', registado_por: 'admin@x.pt', created_at: '2026-11-02T10:00:00Z',
  }));

const listarRegistosDoMes = vi.fn();
vi.mock('@/lib/cartao-go', async orig => ({
  ...(await orig<typeof import('@/lib/cartao-go')>()),
  listarRegistosDoMes: (...a: unknown[]) => listarRegistosDoMes(...a),
}));
let PERFIL: string | null = 'Vendedor VN';
let LOCAL: unknown = ['Aveiro'];
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ me: { perfil: PERFIL, local: LOCAL }, effectiveEmail: 'ana@x.pt' }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { CartaoGoReminder } from '@/components/CartaoGoReminder';
import { isVendedorVN, aplicaCartaoGo, intervaloDoMes, podeAlertar, MAX_ALERTAS_HORA } from '@/lib/cartao-go';

let go: (to: string) => void;
const Nav = () => { const n = useNavigate(); go = to => n(to); return null; };
const mount = () => render(<MemoryRouter><Nav /><CartaoGoReminder /></MemoryRouter>);
const dialog = () => screen.queryByRole('dialog');

beforeEach(() => { localStorage.clear(); PERFIL = 'Vendedor VN'; LOCAL = ['Aveiro']; listarRegistosDoMes.mockReset(); });

describe('Cartão Caetano Go — aviso', () => {
  it('abre ao entrar, mostra o progresso e fecha', async () => {
    listarRegistosDoMes.mockResolvedValue(reg(1));
    mount();
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog()!.textContent).toMatch(/2 cartões por mês/);
    expect(dialog()!.textContent).toMatch(/tens\s*1\s*registado/);
    expect(dialog()!.textContent).toMatch(/falta\s*1/);   // singular
    expect(dialog()!.textContent).toMatch(/Não te esqueças de fazer o Cartão Caetano Go/);
    expect(dialog()!.textContent).toMatch(/gestão\s*confirmar os 2 cartões do mês/);
    // sem "lembrar mais tarde" nem "já tenho": só fechar
    expect(screen.queryByText(/lembrar|já tenho/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('sem nenhum registado, "faltam 2" (plural)', async () => {
    listarRegistosDoMes.mockResolvedValue(reg(0));
    mount();
    await waitFor(() => expect(dialog()).toBeTruthy());
    expect(dialog()!.textContent).toMatch(/tens\s*0\s*registados/);
    expect(dialog()!.textContent).toMatch(/faltam\s*2/);
  });

  it('volta a abrir a cada mudança de página', async () => {
    listarRegistosDoMes.mockResolvedValue(reg(0));
    mount();
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(dialog()).toBeNull());
    act(() => go('/funil'));
    await waitFor(() => expect(dialog()).toBeTruthy());
  });

  it('volta a abrir quando o separador volta a ficar visível', async () => {
    listarRegistosDoMes.mockResolvedValue(reg(0));
    mount();
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(dialog()).toBeNull());
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(dialog()).toBeTruthy());
  });

  it('com o objetivo registado pelo administrador, deixa de aparecer', async () => {
    listarRegistosDoMes.mockResolvedValue(reg(2));
    mount();
    await waitFor(() => expect(listarRegistosDoMes).toHaveBeenCalled());
    expect(dialog()).toBeNull();
  });

  it('se o administrador regista entretanto, a próxima página já não o mostra', async () => {
    listarRegistosDoMes.mockResolvedValueOnce(reg(1)).mockResolvedValue(reg(2));
    mount();
    await waitFor(() => expect(dialog()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    act(() => go('/carteira'));
    await waitFor(() => expect(listarRegistosDoMes).toHaveBeenCalledTimes(2));
    expect(dialog()).toBeNull();
  });

  it('outras funções não veem o aviso nem consultam a base de dados', async () => {
    PERFIL = 'Vendedor VU';
    mount();
    await new Promise(r => setTimeout(r, 20));
    expect(dialog()).toBeNull();
    expect(listarRegistosDoMes).not.toHaveBeenCalled();
  });

  it.each([
    ['de outro local (Porto)', ['Porto']],
    ['sem local definido', null],
    ['com "Todas" (não é um local)', ['Todas']],
  ])('Vendedor VN %s não vê o aviso nem consulta a base de dados', async (_, local) => {
    LOCAL = local;
    mount();
    await new Promise(r => setTimeout(r, 20));
    expect(dialog()).toBeNull();
    expect(listarRegistosDoMes).not.toHaveBeenCalled();
  });

  it('se não for possível saber (erro), fica calado', async () => {
    listarRegistosDoMes.mockRejectedValue(new Error('rede'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await waitFor(() => expect(listarRegistosDoMes).toHaveBeenCalled());
    expect(dialog()).toBeNull();
    err.mockRestore();
  });
});

describe('Cartão Caetano Go — limite por hora', () => {
  it('no máximo 3 alertas por hora; depois fica calado', async () => {
    listarRegistosDoMes.mockResolvedValue(reg(0));
    mount();
    await waitFor(() => expect(dialog()).toBeTruthy());           // 1.º
    for (const [i, to] of ['/a', '/b'].entries()) {
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
      await waitFor(() => expect(dialog()).toBeNull());
      act(() => go(to));
      await waitFor(() => expect(dialog()).toBeTruthy());         // 2.º e 3.º
      expect(i).toBeLessThan(2);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(dialog()).toBeNull());
    const chamadas = listarRegistosDoMes.mock.calls.length;
    act(() => go('/c'));                                          // 4.º: bloqueado
    await waitFor(() => expect(listarRegistosDoMes.mock.calls.length).toBeGreaterThan(chamadas));
    expect(dialog()).toBeNull();
  });

  it('passada a hora, volta a poder alertar', () => {
    const t0 = 1_000_000_000_000, h = 3_600_000;
    const tres = [t0, t0 + 1000, t0 + 2000];
    expect(MAX_ALERTAS_HORA).toBe(3);
    expect(podeAlertar(tres, t0 + 10_000)).toBe(false);
    expect(podeAlertar(tres, t0 + h + 1)).toBe(true);             // o 1.º já saiu da janela
    expect(podeAlertar(tres.slice(0, 2), t0 + 10_000)).toBe(true);
  });
});

describe('Cartão Caetano Go — regras', () => {
  it('só a função "Vendedor VN" (sem distinguir maiúsculas/espaços)', () => {
    expect(isVendedorVN('Vendedor VN')).toBe(true);
    expect(isVendedorVN('  vendedor vn ')).toBe(true);
    expect(isVendedorVN('Vendedor VU')).toBe(false);
    expect(isVendedorVN('Vendedor')).toBe(false);
    expect(isVendedorVN(null)).toBe(false);
  });

  it('só Vendedor VN de Aveiro (local canónico, também em texto/alias)', () => {
    expect(aplicaCartaoGo({ perfil: 'Vendedor VN', local: ['Aveiro'] })).toBe(true);
    expect(aplicaCartaoGo({ perfil: 'Vendedor VN', local: ['Porto', 'Aveiro'] })).toBe(true);
    expect(aplicaCartaoGo({ perfil: 'Vendedor VN', local: 'Caetano Aveiro 2' })).toBe(true);
    expect(aplicaCartaoGo({ perfil: 'Vendedor VN', local: ['Porto'] })).toBe(false);
    expect(aplicaCartaoGo({ perfil: 'Vendedor VN', local: null })).toBe(false);
    expect(aplicaCartaoGo({ perfil: 'Vendedor VU', local: ['Aveiro'] })).toBe(false);
    expect(aplicaCartaoGo(null)).toBe(false);
  });

  it('o mês conta de 1 a 1 (fronteiras certas, incluindo dezembro)', () => {
    expect(intervaloDoMes(new Date(2026, 10, 15))).toEqual({ de: '2026-11-01', ate: '2026-12-01' });
    expect(intervaloDoMes(new Date(2026, 11, 31))).toEqual({ de: '2026-12-01', ate: '2027-01-01' });
  });
});

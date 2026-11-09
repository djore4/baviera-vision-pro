import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { rpc, toast } = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('sonner', () => ({ toast }));

import PrecosDialog from '@/components/demos/PrecosDialog';
import type { PricingInputs } from '@/lib/demoPricing';

const inputs: PricingInputs = {
  pvb: 38230.86, opc: 930.9, bsi: -461.79, eco: 4.2, leg: 1550, isv: 545.07,
  mgb: 0.07, esf: 0.05, pac: 0.06, dem: 0.09, sup: 0, pvp_desc: 39990, depreciacoes: 2239,
};

const setup = (over: Partial<Parameters<typeof PrecosDialog>[0]> = {}) => {
  const onSaved = vi.fn(); const onClose = vi.fn();
  render(<PrecosDialog chassis="WBA1" titulo="225e" inputs={inputs} tipo={{ xev: true, bev: false }} onClose={onClose} onSaved={onSaved} {...over} />);
  return { onSaved, onClose };
};
const field = (label: RegExp) => screen.getByText(label).closest('label')!.querySelector('input') as HTMLInputElement;

beforeEach(() => { rpc.mockReset(); toast.success.mockReset(); toast.error.mockReset(); });

describe('janela de preço', () => {
  it('mostra a mecânica em três blocos e o cálculo do Excel (custo sem BSI)', () => {
    setup();
    expect(screen.getByText(/1\. Estrutura base/)).toBeTruthy();
    expect(screen.getByText(/2\. Descontos/)).toBeTruthy();
    expect(screen.getByText(/3\. Apuramento PVP e margem/)).toBeTruthy();
    // Valores de referência do teste de demoPricing: P Custo 37 745,45 · margem 4 483,55
    expect(screen.getAllByText(/37\D?745,4\d/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/4\D?483,5\d/).length).toBeGreaterThan(0);
  });

  it('sem alterações não grava; alterado só envia o campo mudado', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const { onSaved } = setup();
    const gravar = screen.getByRole('button', { name: /Gravar/ }) as HTMLButtonElement;
    expect(gravar.disabled).toBe(true);
    fireEvent.change(field(/^MGB/), { target: { value: '8,5' } });
    expect(gravar.disabled).toBe(false);
    fireEvent.click(gravar);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('demos_gravar_precos');
    expect(args.p_chassis).toBe('WBA1');
    expect(Object.keys(args.p_inputs)).toEqual(['mgb']);
    expect(args.p_inputs.mgb).toBeCloseTo(0.085);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ mgb: expect.any(Number) })));
  });

  it('valores inválidos bloqueiam a gravação (texto, percentagem acima de 100)', () => {
    setup();
    const gravar = screen.getByRole('button', { name: /Gravar/ }) as HTMLButtonElement;
    fireEvent.change(field(/^PVB/), { target: { value: 'abc' } });
    expect(gravar.disabled).toBe(true);
    fireEvent.change(field(/^PVB/), { target: { value: '38230,86' } });
    fireEvent.change(field(/^MGB/), { target: { value: '150' } });
    expect(gravar.disabled).toBe(true);
  });

  it('erro de permissão da base de dados aparece como aviso e não fecha a janela', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'x' } });
    const { onSaved } = setup();
    fireEvent.change(field(/^PVB/), { target: { value: '40000' } });
    fireEvent.click(screen.getByRole('button', { name: /Gravar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sem permissão para gerir os preços desta viatura.'));
    expect(onSaved).not.toHaveBeenCalled();
  });
});

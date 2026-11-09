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

const veiculo = {
  chassis: 'WBA1', titulo: '225e xDrive', matricula: 'AA-00-BB', local: 'Aveiro', encomenda: 'E123',
  dataMatricula: '2026-01-01', kms: 1200, modelo: 'Série 2', versao: '225e', estadoEntrega: 'Imediata',
};
const tipoPhev = { ice: false, xev: true, bev: false, qor: false, m: false };
const setup = (over: Partial<Parameters<typeof PrecosDialog>[0]> = {}) => {
  const onSaved = vi.fn(); const onClose = vi.fn();
  render(<PrecosDialog veiculo={veiculo} inputs={inputs} tipo={tipoPhev} onClose={onClose} onSaved={onSaved} {...over} />);
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

  it('mostra a identificação só em leitura e os escalões de 30 dias', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z')); // 63 dias após 2026-01-01
    try {
      setup();
      expect(screen.getByText(/0\. Identificação da viatura/)).toBeTruthy();
      expect(screen.getByText('E123')).toBeTruthy();
      expect(screen.getByText('Imediata')).toBeTruthy();
      expect(screen.queryByDisplayValue('E123')).toBeNull(); // não editável
      expect(screen.getByText('Dias desde matrícula').nextElementSibling?.textContent).toBe('63');
      expect(screen.getByText('Períodos de 30 dias').nextElementSibling?.textContent).toBe('2');
      expect(screen.getByText('Próximo escalão em').nextElementSibling?.textContent).toBe('27 dias');
    } finally { vi.useRealTimers(); }
  });

  it('mostra o desconto máximo do modelo (PHEV Série 2) e o escalão acumulado', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-05T12:00:00Z'));
    try {
      setup();
      expect(screen.getByText(/Desconto máximo · PHEV · Série 2/)).toBeTruthy();
      // penetração 930,9 / 38230,86 = 2,4 % < 19 % → aplica-se "sem 19% de opcionais" (11 %, 1,83 % mensal)
      expect(screen.getByText('Sem 19% de opcionais').closest('div')!.className).toContain('border-brand-primary');
      expect(screen.getByText(/Acumulado ao fim de 2 períodos/).textContent).toMatch(/3,66\s?%/);
    } finally { vi.useRealTimers(); }
  });

  it('modelo fora da tabela de descontos máximos: aviso, sem inventar um valor', () => {
    setup({ veiculo: { ...veiculo, modelo: 'Z8' } });
    expect(screen.getByText(/Sem linha de desconto máximo para "Z8"/)).toBeTruthy();
  });

  it('o botão do cartão só existe quando há onAbrirCartao', () => {
    const onAbrirCartao = vi.fn();
    setup({ onAbrirCartao });
    fireEvent.click(screen.getByRole('button', { name: /Cartão \/ partilhar/ }));
    expect(onAbrirCartao).toHaveBeenCalled();
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

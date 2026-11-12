import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { hojeIso, type Seguro } from '@/lib/seguros';

const mk = (id: string, over: Partial<Seguro> = {}): Seguro => ({
  id, matricula: '00-AA-00', matricula_norm: '00AA00', chassis: null, viatura: 'BMW iX1', area: 'bmw_vn',
  solicitante: 'Rui', cliente: null, data_pedido: '2026-01-01', inicio: '2026-01-01', fim: '2099-12-31',
  cobertura: 'terceiros', capital_seguro: null, premio: 100, seguradora: null, apolice: null, obs: null,
  arquivado: false, arquivado_em: null, motivo_arquivo: null, criado_por: null, created_at: '', updated_at: '', ...over,
});

let DB: Seguro[] = [];
const arquivar = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/seguros', async (orig) => ({
  ...(await orig<typeof import('@/lib/seguros')>()),
  listSeguros: vi.fn(async () => DB),
  listParque: vi.fn(async () => []),
  listVendidas: vi.fn(async () => [{ chassis: null, matricula: '33-CC-33', modelo: null, data_venda: null }]),
  arquivarSeguro: (...a: unknown[]) => arquivar(...a),
}));
let EDIT = true;
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit: () => EDIT, isAdmin: false }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import SegurosPage from '@/pages/SegurosPage';

beforeEach(() => {
  arquivar.mockReset(); EDIT = true;
  DB = [
    mk('1'),
    mk('2', { matricula: '11-BB-11', matricula_norm: '11BB11', fim: '2026-01-02' }),            // expirado
    mk('3', { matricula: '33-CC-33', matricula_norm: '33CC33' }),                              // vendida
    mk('4', { matricula: '44-DD-44', matricula_norm: '44DD44', arquivado: true, arquivado_em: '2026-02-01', motivo_arquivo: 'terminado' }),
  ];
});

describe('SegurosPage', () => {
  it('separa ativos de arquivados', async () => {
    render(<SegurosPage />);
    expect(await screen.findAllByTestId('seguro')).toHaveLength(3);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Arquivados/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Arquivados/ }));
    await waitFor(() => expect(screen.getAllByTestId('seguro')).toHaveLength(1));
    expect(screen.getByText('44-DD-44')).toBeTruthy();
  });

  it('destaca expirados por arquivar e viaturas vendidas com seguro', async () => {
    render(<SegurosPage />);
    const alertasEl = await screen.findByTestId('alertas');
    expect(alertasEl.textContent).toContain('11-BB-11');
    expect(alertasEl.textContent).toContain('33-CC-33');
    expect(alertasEl.textContent).not.toContain('00-AA-00');
  });

  it('arquiva uma viatura vendida com o motivo pré-preenchido', async () => {
    DB = [mk('3', { matricula: '33-CC-33', matricula_norm: '33CC33' })];
    arquivar.mockResolvedValue(mk('3', { arquivado: true, motivo_arquivo: 'viatura_vendida', arquivado_em: hojeIso() }));
    render(<SegurosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar 33-CC-33' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Arquivar' }));
    await waitFor(() => expect(arquivar).toHaveBeenCalledWith('3', 'viatura_vendida'));
  });

  it('só consulta sem permissão de edição', async () => {
    EDIT = false;
    render(<SegurosPage />);
    await screen.findAllByTestId('seguro');
    expect(screen.queryByRole('button', { name: /Novo seguro/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });
});

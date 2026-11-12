import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { hojeIso, type Seguro } from '@/lib/seguros';

const mk = (id: string, over: Partial<Seguro> = {}): Seguro => ({
  id, matricula: '00-AA-00', matricula_norm: '00AA00', chassis: null, viatura: 'BMW iX1', area: 'bmw_vn',
  solicitante: 'Rui', responsavel_info: null, cancelamento_pedido_em: null, dp_desde: null, cliente: null, data_pedido: '2026-01-01', inicio: '2026-01-01', fim: '2099-12-31',
  cobertura: 'terceiros', capital_seguro: null, premio: 100, seguradora: null, apolice: null, obs: null,
  arquivado: false, arquivado_em: null, motivo_arquivo: null, criado_por: null, created_at: '', updated_at: '', ...over,
});

let DB: Seguro[] = [];
const arquivar = vi.fn((..._a: unknown[]) => Promise.resolve<unknown>(undefined));
const cancelar = vi.fn((..._a: unknown[]) => Promise.resolve<unknown>(undefined));
const upgrade = vi.fn((..._a: unknown[]) => Promise.resolve<unknown>(undefined));
const copiar = vi.fn(async (_t: string) => true);

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/seguros', async (orig) => ({
  ...(await orig<typeof import('@/lib/seguros')>()),
  listSeguros: vi.fn(async () => DB),
  listParque: vi.fn(async () => [
    { origem: 'demos', ref: 'D1', chassis: 'D1', matricula: '77-XX-77', modelo: 'iX1', versao: null, marca: 'BMW', area: 'bmw_vn' },
    { origem: 'stock_vu', ref: 'S1', chassis: null, matricula: '00-AA-00', modelo: 'X1', versao: null, marca: 'BMW', area: 'bmw_vu' },
  ]),
  listVendidas: vi.fn(async () => [{ matricula: '33-CC-33', origem: 'retail', data_venda: '2026-11-05' }]),
  copiarTexto: (t: string) => copiar(t),
  arquivarSeguro: (...a: unknown[]) => arquivar(...a),
  marcarCancelamentoPedido: (...a: unknown[]) => cancelar(...a),
  upgradeDanosProprios: (...a: unknown[]) => upgrade(...a),
  listHistoricoSeguro: vi.fn(async () => [{ id: 'h1', seguro_id: '1', tipo: 'cobertura', de: 'terceiros', para: 'danos_proprios', detalhe: 'Valor seguro 30000 €', autor: 'a@b.pt', created_at: '2026-11-12T10:00:00Z' }]),
}));
let EDIT = true;
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit: () => EDIT, isAdmin: false }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import SegurosPage from '@/pages/SegurosPage';

beforeEach(() => {
  arquivar.mockReset(); cancelar.mockReset(); upgrade.mockReset(); copiar.mockClear(); EDIT = true;
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

  it('realça a baixa a dar e lista as viaturas do parque sem seguro (a que tem seguro fica de fora)', async () => {
    render(<SegurosPage />);
    await screen.findAllByTestId('seguro');
    expect(screen.getAllByText(/DAR BAIXA · passou a Retail em 05-11-2026/).length).toBeGreaterThan(0);
    const parque = screen.getByTestId('parque-sem-seguro');
    expect(parque.textContent).toContain('77-XX-77');
    expect(parque.textContent).toContain('Demos VN');
    expect(parque.textContent).not.toContain('00-AA-00');   // já tem seguro
  });

  it('Cancelar seguro copia a mensagem e regista o pedido', async () => {
    DB = [mk('1', { apolice: '123' })];
    cancelar.mockResolvedValue(mk('1', { apolice: '123', cancelamento_pedido_em: '2026-11-12' }));
    render(<SegurosPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar seguro 00-AA-00' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar mensagem' }));
    await waitFor(() => expect(copiar).toHaveBeenCalled());
    expect(String(copiar.mock.calls[0][0])).toContain('Cancelamento de seguro | 00-AA-00 | Apólice 123');
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith('1'));
  });

  it('upgrade para danos próprios só em terceiros e exige os campos obrigatórios', async () => {
    DB = [mk('1'), mk('2', { matricula: '11-BB-11', matricula_norm: '11BB11', cobertura: 'danos_proprios', capital_seguro: 5000, fim: '2099-01-01', responsavel_info: 'Ana' })];
    upgrade.mockResolvedValue(mk('1', { cobertura: 'danos_proprios', capital_seguro: 30000, dp_desde: '2026-11-12', fim: '2099-12-31', responsavel_info: 'Ana' }));
    render(<SegurosPage />);
    await screen.findAllByTestId('seguro');
    expect(screen.queryByRole('button', { name: 'Upgrade para danos próprios 11-BB-11' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade para danos próprios 00-AA-00' }));
    const fazer = await screen.findByRole('button', { name: 'Fazer upgrade' });
    expect((fazer as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Valor seguro (€) *'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('Responsável pela informação *'), { target: { value: 'Ana' } });
    expect((fazer as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(fazer);
    await waitFor(() => expect(upgrade).toHaveBeenCalledWith('1', expect.objectContaining({ capital_seguro: '30000', responsavel_info: 'Ana' })));
  });

  it('mostra o histórico de um seguro', async () => {
    render(<SegurosPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Histórico/ }))[0]);
    expect((await screen.findByTestId('historico')).textContent).toContain('Contra terceiros → Danos próprios');
  });
});

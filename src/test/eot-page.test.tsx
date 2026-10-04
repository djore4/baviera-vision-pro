import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { EotContract } from '@/lib/eot';

/* Página End-of-Term inteira, com dados simulados: o que se testa é a ligação
 * clique no contador → filtro da lista, não a regra (essa está em eot-kpi.test.ts). */

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const mk = (n: string, fase: EotContract['fase'], dias: number): EotContract => ({
  contrato: `C-${n}`, cliente: `Cliente ${n}`, marca: 'BMW', modelo: 'X1', matricula: `AA-00-${n}`,
  concessionario_resp: 'Caetano Aveiro', concessionario: 'Caetano Aveiro', vendedor: 'V', owner_email: null, owner_nome: null,
  data_fim: inDays(dias), fase, temperatura: null, prestacao: 300, valor_total: 20000,
} as unknown as EotContract);

/* A: ativo ≤30 · B: ativo ≤60 · C: ativo >60 · E,F: renovado/retomado (fechados) · G: perdido (fechado, não conta) */
const CONTRACTS = [
  mk('A', 'pendente', 10), mk('B', 'contactado', 45), mk('C', 'negociacao', 90),
  mk('E', 'renovado', 20), mk('F', 'retomado', -10), mk('G', 'perdido', 5),
];

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
// O hook real memoriza o scope; um objeto novo a cada render faria a página recarregar em ciclo.
const SCOPE = { isDirector: true, email: 'a@x.pt' };
const EOT_SCOPE = { scope: SCOPE, isDirector: true, isAdmin: true, myEmail: 'a@x.pt', myNome: 'A' };
vi.mock('@/hooks/useEotScope', () => ({ useEotScope: () => EOT_SCOPE }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit: () => true }) }));
vi.mock('@/components/eot/ContractDialog', () => ({
  ContractDialog: ({ open, contract }: { open: boolean; contract: { contrato: string } | null }) =>
    open ? <div data-testid="contract-dialog">{contract?.contrato}</div> : null,
}));
const toastInfo = vi.fn();
vi.mock('sonner', () => ({ toast: { info: (m: string) => toastInfo(m), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/eot', async (orig) => ({
  ...(await orig<typeof import('@/lib/eot')>()),
  listEotContracts: vi.fn(async () => CONTRACTS),
  listAgenda: vi.fn(async () => []),
  listEotVendedores: vi.fn(async () => []),
  listEotOwners: vi.fn(async () => []),
}));

import EndOfTermPage from '@/pages/EndOfTermPage';

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div>; }
const renderPage = (url = '/end-of-term') =>
  render(<MemoryRouter initialEntries={[url]}><EndOfTermPage /><Where /></MemoryRouter>);

/* O rodapé existe duas vezes (lista de cartões no telemóvel e tabela no ecrã grande; o CSS
 * esconde uma): têm de dizer sempre o mesmo. */
const rodape = async (shown: number) => {
  const all = await screen.findAllByText(`${shown} de ${CONTRACTS.length} contratos`);
  expect(all).toHaveLength(2);
  expect(screen.queryAllByText(/^\d+ de \d+ contratos$/)).toHaveLength(2);
};
const kpi = (label: RegExp) => screen.getByRole('button', { name: label });

beforeEach(() => { vi.clearAllMocks(); toastInfo.mockClear(); });

describe('EndOfTermPage — contadores clicáveis', () => {
  it('por omissão mostra os ativos (fechados escondidos) e os contadores têm os números certos', async () => {
    renderPage();
    await rodape(3);
    expect(kpi(/Contratos ativos/)).toHaveTextContent('3');
    expect(kpi(/A terminar ≤ 30 dias/)).toHaveTextContent('1');
    expect(kpi(/A terminar ≤ 60 dias/)).toHaveTextContent('2');
    expect(kpi(/Renovados \/ Retomados/)).toHaveTextContent('2');
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);   // nenhum contador ativo
  });

  it('clicar em "≤ 30 dias" filtra a lista; clicar outra vez limpa', async () => {
    renderPage();
    await rodape(3);

    fireEvent.click(kpi(/A terminar ≤ 30 dias/));
    await rodape(1);
    expect(kpi(/A terminar ≤ 30 dias/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/A mostrar: A terminar ≤ 30 dias · 1/)).toBeInTheDocument();
    expect(screen.getAllByText('Cliente A').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cliente B')).not.toBeInTheDocument();

    fireEvent.click(kpi(/A terminar ≤ 30 dias/));
    await rodape(3);
    expect(kpi(/A terminar ≤ 30 dias/)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/A mostrar:/)).not.toBeInTheDocument();
  });

  it('"≤ 60 dias" inclui os de 30; "ativos" mostra os três ativos', async () => {
    renderPage();
    await rodape(3);
    fireEvent.click(kpi(/A terminar ≤ 60 dias/));
    await rodape(2);
    expect(screen.getAllByText('Cliente A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cliente B').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cliente C')).not.toBeInTheDocument();
    fireEvent.click(kpi(/Contratos ativos/));
    await rodape(3);
    expect(screen.getAllByText('Cliente C').length).toBeGreaterThan(0);
  });

  it('"Renovados / Retomados" mostra-os mesmo com "Esconder fechados" ligado, sem os perdidos', async () => {
    renderPage();
    await rodape(3);
    expect(screen.getByRole('checkbox', { name: /Esconder fechados/ })).toBeChecked();
    fireEvent.click(kpi(/Renovados \/ Retomados/));
    await rodape(2);
    expect(screen.getAllByText('Cliente E').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cliente F').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cliente G')).not.toBeInTheDocument();
  });

  it('os números dos cartões não mudam ao clicar (ficam estáveis para se poder alternar)', async () => {
    renderPage();
    await rodape(3);
    fireEvent.click(kpi(/A terminar ≤ 30 dias/));
    await rodape(1);
    expect(kpi(/Contratos ativos/)).toHaveTextContent('3');
    expect(kpi(/A terminar ≤ 60 dias/)).toHaveTextContent('2');
    expect(kpi(/Renovados \/ Retomados/)).toHaveTextContent('2');
  });

  it('só um contador de cada vez: o último clique substitui o anterior', async () => {
    renderPage();
    await rodape(3);
    fireEvent.click(kpi(/A terminar ≤ 30 dias/));
    await rodape(1);
    fireEvent.click(kpi(/Renovados \/ Retomados/));
    await rodape(2);
    expect(kpi(/A terminar ≤ 30 dias/)).toHaveAttribute('aria-pressed', 'false');
    expect(kpi(/Renovados \/ Retomados/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('o botão "x" do aviso limpa o filtro', async () => {
    renderPage();
    await rodape(3);
    fireEvent.click(kpi(/A terminar ≤ 60 dias/));
    await rodape(2);
    fireEvent.click(screen.getByRole('button', { name: /Limpar o filtro do contador/ }));
    await rodape(3);
    expect(screen.queryByText(/A mostrar:/)).not.toBeInTheDocument();
  });

  it('a partir do separador Agenda, clicar num contador volta aos contratos', async () => {
    renderPage();
    await rodape(3);
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Agenda/ }), { button: 0 });
    await waitFor(() => expect(screen.queryAllByText(/^\d+ de \d+ contratos$/)).toHaveLength(0));
    fireEvent.click(kpi(/A terminar ≤ 30 dias/));
    await rodape(1);
  });

  it('os contadores seguem os outros filtros (a pesquisa reduz os números e a lista)', async () => {
    renderPage();
    await rodape(3);
    fireEvent.change(screen.getByPlaceholderText(/Cliente, matrícula ou contrato/), { target: { value: 'Cliente A' } });
    await rodape(1);
    expect(kpi(/Contratos ativos/)).toHaveTextContent('1');
    expect(kpi(/A terminar ≤ 60 dias/)).toHaveTextContent('1');
    expect(kpi(/Renovados \/ Retomados/)).toHaveTextContent('0');
    fireEvent.click(kpi(/A terminar ≤ 60 dias/));
    await rodape(1);
    expect(within(screen.getByText(/A mostrar:/).parentElement as HTMLElement).getByText(/· 1/)).toBeInTheDocument();
  });
});

describe('EndOfTermPage — hotlink das notificações (?contrato=)', () => {
  it('sem parâmetro, nenhum contrato abre', async () => {
    renderPage();
    await rodape(3);
    expect(screen.queryByTestId('contract-dialog')).not.toBeInTheDocument();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('abre o contrato do link e tira o parâmetro do URL (não reabre ao atualizar)', async () => {
    renderPage('/end-of-term?contrato=C-A');
    expect(await screen.findByTestId('contract-dialog')).toHaveTextContent('C-A');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/end-of-term$/));
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('abre mesmo um contrato que os filtros por omissão escondem (fechado, "Esconder fechados" ligado)', async () => {
    renderPage('/end-of-term?contrato=C-E');   // renovado: fora da lista por omissão
    expect(await screen.findByTestId('contract-dialog')).toHaveTextContent('C-E');
    await rodape(3);                           // a lista continua a mostrar só os ativos
  });

  it('contrato inexistente (ou sem acesso): avisa em vez de abrir outro, e limpa o URL', async () => {
    renderPage('/end-of-term?contrato=NAO-EXISTE');
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('NAO-EXISTE')));
    expect(screen.queryByTestId('contract-dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/end-of-term$/));
  });

  it('um contrato com espaço, & e / (como vem codificado no link) abre', async () => {
    CONTRACTS.push({ ...mk('Z', 'pendente', 15), contrato: 'EOT X&Y/1' });
    try {
      renderPage('/end-of-term?contrato=EOT%20X%26Y%2F1');
      expect(await screen.findByTestId('contract-dialog')).toHaveTextContent('EOT X&Y/1');
    } finally {
      CONTRACTS.pop();
    }
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  listEventos: vi.fn(), listCategorias: vi.fn(), listEstadosConvidados: vi.fn(),
  createEvento: vi.fn(), updateEvento: vi.fn(), deleteEvento: vi.fn(),
  listOrcamentos: vi.fn(), saveOrcamento: vi.fn(),
  listViaturasEvento: vi.fn(), listParque: vi.fn(), listAnexos: vi.fn(), listConvidados: vi.fn(),
}));
vi.mock('@/lib/marketing-data', async orig => ({
  ...(await orig<typeof import('@/lib/marketing-data')>()),
  ...api,
  urlFicheiro: vi.fn().mockResolvedValue('https://exemplo.test/capa.png'),
}));
const perm = vi.hoisted(() => ({ canEdit: true }));
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    canEdit: (t: string) => t === 'marketing' && perm.canEdit,
    effectiveEmail: 'rui@c.pt',
    me: { nome: 'Rui Costa', email: 'rui@c.pt' },
  }),
}));
vi.mock('@/lib/permissions', async orig => ({
  ...(await orig<typeof import('@/lib/permissions')>()),
  listUsers: vi.fn().mockResolvedValue([]),
}));

import MarketingPage from '@/pages/MarketingPage';
import { TABS, PERMISSION_TABS, ADMIN_ONLY_TAB_KEYS, ARCHIVED_TAB_KEYS } from '@/lib/permissions';
import type { Categoria, MarketingEvento } from '@/lib/marketing';

const CATS: Categoria[] = [
  { id: 'c1', nome: 'Lançamento', cor: '214 77% 47%', ordem: 1 },
  { id: 'c2', nome: 'Evento', cor: '262 60% 55%', ordem: 2 },
];
const EV = (id: string, titulo: string, inicio: string, categoria_id: string | null, extra: Partial<MarketingEvento> = {}): MarketingEvento => ({
  id, titulo, categoria_id, inicio, fim: null, hora: null, local: 'Aveiro', descricao: null, dress_code: null,
  highlights: [], imagem_path: null, ...extra,
});
const EVENTOS = [
  EV('e1', 'Open House', '2099-03-10', 'c2', { descricao: 'Showroom aberto', dress_code: 'Smart casual', highlights: ['Test drives', 'Convidados da marca'] }),
  EV('e2', 'Lançamento iX', '2099-05-01', 'c1'),
];

beforeEach(() => {
  vi.clearAllMocks();
  perm.canEdit = true;
  api.listOrcamentos.mockResolvedValue({ e1: { previsto: 5000, real: 6000 } });
  api.saveOrcamento.mockResolvedValue(undefined);
  api.listEventos.mockResolvedValue(EVENTOS);
  api.listCategorias.mockResolvedValue(CATS);
  api.listEstadosConvidados.mockResolvedValue([
    { evento_id: 'e1', estado: 'confirmado' }, { evento_id: 'e1', estado: 'convidado' },
  ]);
  api.listViaturasEvento.mockResolvedValue([]);
  api.listParque.mockResolvedValue([]);
  api.listAnexos.mockResolvedValue([]);
  api.listConvidados.mockResolvedValue([]);
});

describe('tab Marketing: acesso', () => {
  it('está na secção Transversal e é atribuível na matriz de funções', () => {
    const t = TABS.find(x => x.key === 'marketing');
    expect(t).toMatchObject({ area: 'apv', path: '/marketing' });
    expect(t?.adminOnly).toBeFalsy();
    expect(ADMIN_ONLY_TAB_KEYS).not.toContain('marketing');
    expect(PERMISSION_TABS.some(x => x.key === 'marketing')).toBe(true);
    expect(ARCHIVED_TAB_KEYS).not.toContain('marketing');
  });
});

describe('MarketingPage', () => {
  it('mostra os eventos da base de dados, com categoria e totais de convidados', async () => {
    render(<MarketingPage />);
    expect(await screen.findAllByTestId('evento')).toHaveLength(2);
    const open = screen.getByRole('button', { name: 'Abrir Open House' });
    expect(within(open).getByText('Evento')).toBeInTheDocument();
    expect(within(open).getByText('1/2 confirmados')).toBeInTheDocument();
    expect(screen.getByTestId('marcador-hoje')).toBeInTheDocument();
  });

  it('filtra por categoria', async () => {
    render(<MarketingPage />);
    await screen.findAllByTestId('evento');
    const filtros = screen.getByRole('group', { name: /filtrar por categoria/i });
    fireEvent.click(within(filtros).getByRole('button', { name: /lançamento/i }));
    expect(screen.getAllByTestId('evento')).toHaveLength(1);
    fireEvent.click(within(filtros).getByRole('button', { name: /todos/i }));
    expect(screen.getAllByTestId('evento')).toHaveLength(2);
  });

  it('abre o detalhe: descrição, dress code, highlights e orçamento acima do previsto', async () => {
    render(<MarketingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Open House' }));
    const det = await screen.findByTestId('evento-detalhe');
    expect(within(det).getByText('Showroom aberto')).toBeInTheDocument();
    expect(within(det).getByText('Smart casual')).toBeInTheDocument();
    expect(within(det).getByTestId('highlights').children).toHaveLength(2);
    await waitFor(() => expect(within(det).getByText(/acima do orçamento/)).toBeInTheDocument());
    expect(within(det).getByRole('link', { name: /partilhar convite/i }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('quem só vê: sem botões de gestão, sem orçamento, e só os seus convidados', async () => {
    perm.canEdit = false;
    render(<MarketingPage />);
    const cartao = await screen.findByRole('button', { name: 'Abrir Open House' });
    expect(screen.queryByRole('button', { name: /novo evento/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /categorias/i })).toBeNull();
    expect(within(cartao).getByText('2 convidados meus')).toBeInTheDocument();
    expect(api.listOrcamentos).not.toHaveBeenCalled();

    fireEvent.click(cartao);
    const det = await screen.findByTestId('evento-detalhe');
    expect(within(det).queryByRole('button', { name: /editar/i })).toBeNull();
    expect(within(det).queryByRole('button', { name: /apagar/i })).toBeNull();
    expect(within(det).queryByTestId('orcamento')).toBeNull();
    expect(within(det).getByText('Showroom aberto')).toBeInTheDocument();

    fireEvent.mouseDown(within(det).getByRole('tab', { name: 'Convidados' }), { button: 0 });
    expect(await screen.findByTestId('convidados')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Vendedor' })).toBeNull(); // o convidado é sempre dele
    fireEvent.mouseDown(within(det).getByRole('tab', { name: 'Viaturas' }), { button: 0 });
    expect(await within(det).findByText(/ainda sem viaturas/i)).toBeInTheDocument();
    expect(within(det).queryByLabelText(/procurar ou escrever viatura/i)).toBeNull();
  });

  it('quem edita vê o orçamento do evento', async () => {
    render(<MarketingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Open House' }));
    const det = await screen.findByTestId('evento-detalhe');
    await waitFor(() => expect(within(det).getByTestId('orcamento')).toHaveTextContent('6000'));
    expect(within(det).getByText(/acima do orçamento/)).toBeInTheDocument();
  });

  it('sem eventos: convida a criar o primeiro', async () => {
    api.listEventos.mockResolvedValue([]);
    render(<MarketingPage />);
    expect(await screen.findByText(/ainda não há eventos/i)).toBeInTheDocument();
  });

  it('mostra o erro se a base de dados falhar', async () => {
    api.listEventos.mockRejectedValue(new Error('Não foi possível ler os eventos: x'));
    render(<MarketingPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ler os eventos');
  });

  it('criar evento exige título e data, e grava com o local de Aveiro por omissão', async () => {
    api.createEvento.mockImplementation(async e => ({ id: 'novo', ...e }));
    render(<MarketingPage />);
    await screen.findAllByTestId('evento');
    fireEvent.click(screen.getAllByRole('button', { name: /novo evento/i })[0]);
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByLabelText('Local')).toHaveValue('Aveiro');

    fireEvent.click(within(dlg).getByRole('button', { name: /criar evento/i }));
    expect(api.createEvento).not.toHaveBeenCalled();

    fireEvent.change(within(dlg).getByLabelText(/título/i), { target: { value: 'Noite M' } });
    fireEvent.change(within(dlg).getByLabelText(/^data \*/i), { target: { value: '2099-07-01' } });
    fireEvent.change(within(dlg).getByLabelText(/highlights/i), { target: { value: '- Um\n\nDois' } });
    fireEvent.change(within(dlg).getByLabelText(/orçamento previsto/i), { target: { value: '1500,50' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /criar evento/i }));

    await waitFor(() => expect(api.createEvento).toHaveBeenCalledTimes(1));
    expect(api.createEvento.mock.calls[0][0]).toMatchObject({
      titulo: 'Noite M', inicio: '2099-07-01', local: 'Aveiro', highlights: ['Um', 'Dois'],
    });
    expect(api.createEvento.mock.calls[0][0]).not.toHaveProperty('orcamento_previsto');
    expect(api.saveOrcamento).toHaveBeenCalledWith('novo', { previsto: 1500.5, real: null });
    expect(await screen.findAllByTestId('evento')).toHaveLength(3);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  listEventos: vi.fn(), listCategorias: vi.fn(), listEstadosConvidados: vi.fn(),
  createEvento: vi.fn(), updateEvento: vi.fn(), deleteEvento: vi.fn(),
  listViaturasEvento: vi.fn(), listParque: vi.fn(), listAnexos: vi.fn(), listConvidados: vi.fn(),
}));
vi.mock('@/lib/marketing-data', async orig => ({
  ...(await orig<typeof import('@/lib/marketing-data')>()),
  ...api,
  urlFicheiro: vi.fn().mockResolvedValue('https://exemplo.test/capa.png'),
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
  highlights: [], orcamento_previsto: null, orcamento_real: null, imagem_path: null, ...extra,
});
const EVENTOS = [
  EV('e1', 'Open House', '2099-03-10', 'c2', { descricao: 'Showroom aberto', dress_code: 'Smart casual', highlights: ['Test drives', 'Convidados da marca'], orcamento_previsto: 5000, orcamento_real: 6000 }),
  EV('e2', 'Lançamento iX', '2099-05-01', 'c1'),
];

beforeEach(() => {
  vi.clearAllMocks();
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
  it('está na secção Transversal, visível só ao admin e fora da matriz de funções', () => {
    expect(TABS.find(t => t.key === 'marketing')).toMatchObject({ area: 'apv', path: '/marketing', adminOnly: true });
    expect(ADMIN_ONLY_TAB_KEYS).toContain('marketing');
    expect(PERMISSION_TABS.some(t => t.key === 'marketing')).toBe(false);
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
    expect(within(det).getByText(/acima do orçamento/)).toBeInTheDocument();
    expect(within(det).getByRole('link', { name: /partilhar convite/i }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
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
      titulo: 'Noite M', inicio: '2099-07-01', local: 'Aveiro', highlights: ['Um', 'Dois'], orcamento_previsto: 1500.5, orcamento_real: null,
    });
    expect(await screen.findAllByTestId('evento')).toHaveLength(3);
  });
});

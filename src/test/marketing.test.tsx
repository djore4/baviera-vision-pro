import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  listEventos: vi.fn(), listCategorias: vi.fn(), listEstadosConvidados: vi.fn(),
  createEvento: vi.fn(), updateEvento: vi.fn(), deleteEvento: vi.fn(),
  listOrcamentos: vi.fn(), saveOrcamento: vi.fn(), saveCategoria: vi.fn(), uploadAnexo: vi.fn(), urlDownload: vi.fn(),
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

// Radix Select no jsdom.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);

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

  it('"Hoje" é um item da linha: antes dos eventos futuros, e cada cartão mostra os dias que faltam', async () => {
    const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    api.listEventos.mockResolvedValue([EV('f1', 'Daqui a dez', d(10), 'c2'), EV('f2', 'Daqui a quarenta', d(40), 'c1')]);
    render(<MarketingPage />);
    const cartoes = await screen.findAllByTestId('evento');
    const hoje = screen.getByTestId('marcador-hoje');
    // Hoje vem antes do primeiro evento (nunca colado a ele nem depois).
    expect(hoje.compareDocumentPosition(cartoes[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(cartoes[0]).getByTestId('contagem')).toHaveTextContent('Faltam10dias');
    expect(within(cartoes[1]).getByTestId('contagem')).toHaveTextContent('Faltam40dias');
    // Cada cartão está ligado ao ponto da linha por um traço.
    expect(within(cartoes[0]).getByTestId('ligacao')).toBeInTheDocument();
    expect(within(cartoes[1]).getByTestId('ligacao')).toBeInTheDocument();
  });

  it('cabeçalho enxuto: só os filtros (e, a quem edita, categorias e novo evento)', async () => {
    render(<MarketingPage />);
    await screen.findAllByTestId('evento');
    expect(screen.queryByRole('heading', { name: 'Marketing' })).toBeNull();
    expect(screen.queryByText(/linha do tempo dos eventos/i)).toBeNull();
    expect(screen.queryByText('Próximo')).toBeNull();
    const barra = screen.getByRole('group', { name: /filtrar por categoria/i });
    expect(within(barra).getByRole('button', { name: /novo evento/i })).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: 'Categorias' })).toBeInTheDocument();
  });

  it('mostra a faixa de números da agenda', async () => {
    render(<MarketingPage />);
    const faixa = await screen.findByTestId('resumo-agenda');
    expect(within(faixa).getByText('Por acontecer').previousSibling).toHaveTextContent('2');
    expect(within(faixa).getByText('Já realizados').previousSibling).toHaveTextContent('0');
  });

  it('o detalhe mostra o mapa do local e a ligação "Como chegar" a partir do stand', async () => {
    api.listEventos.mockResolvedValue([EV('e1', 'Open House', '2099-03-10', 'c2', { local: 'Quinta da Ria, Ílhavo' })]);
    render(<MarketingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Open House' }));
    const mapa = await screen.findByTestId('local-mapa');
    expect(within(mapa).getByTitle('Mapa: Quinta da Ria, Ílhavo').getAttribute('src')).toContain('q=Quinta%20da%20Ria%2C%20%C3%8Dlhavo');
    const rota = within(mapa).getByRole('link', { name: /como chegar/i }).getAttribute('href') ?? '';
    expect(rota).toContain('google.com/maps/dir/');
    expect(rota).toContain('destination=Quinta%20da%20Ria%2C%20%C3%8Dlhavo');
    expect(rota).toContain('origin=');
  });

  it('no formulário dá para criar uma categoria nova e ficar com ela escolhida', async () => {
    api.saveCategoria.mockResolvedValue({ id: 'c9', nome: 'Parceria', cor: '262 60% 55%', ordem: 5 });
    api.createEvento.mockImplementation(async e => ({ id: 'novo', ...e }));
    render(<MarketingPage />);
    await screen.findAllByTestId('evento');
    fireEvent.click(screen.getAllByRole('button', { name: /novo evento/i })[0]);
    const dlg = await screen.findByRole('dialog');

    fireEvent.keyDown(within(dlg).getByRole('combobox', { name: 'Categoria' }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: /nova categoria/i }));
    const painel = await within(dlg).findByTestId('nova-categoria');
    fireEvent.change(within(painel).getByLabelText('Nova categoria'), { target: { value: 'Parceria' } });
    fireEvent.click(within(painel).getByRole('button', { name: /criar e usar/i }));

    await waitFor(() => expect(api.saveCategoria).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Parceria' })));
    await waitFor(() => expect(within(dlg).queryByTestId('nova-categoria')).toBeNull());
    // (o texto do Select não se renderiza no jsdom: a escolha prova-se pelo categoria_id gravado, abaixo)

    fireEvent.change(within(dlg).getByLabelText(/título/i), { target: { value: 'Jantar' } });
    fireEvent.change(within(dlg).getByLabelText(/^data \*/i), { target: { value: '2099-08-01' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /criar evento/i }));
    await waitFor(() => expect(api.createEvento).toHaveBeenCalled());
    expect(api.createEvento.mock.calls[0][0]).toMatchObject({ titulo: 'Jantar', categoria_id: 'c9' });
  });

  it('convites: quem edita carrega e descarrega; só aceita imagem ou PDF', async () => {
    const convite = { id: 'a1', evento_id: 'e1', categoria: 'convite', path: 'e1/x-convite.png', nome: 'convite.png', tipo: 'image/png', tamanho: 120000, created_at: '2099-01-01' };
    api.listAnexos.mockResolvedValue([convite]);
    api.uploadAnexo.mockImplementation(async (id: string, f: File, cat: string) => ({ ...convite, id: 'a2', nome: f.name, categoria: cat }));
    render(<MarketingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Open House' }));
    const det = await screen.findByTestId('evento-detalhe');
    fireEvent.mouseDown(within(det).getByRole('tab', { name: 'Convites' }), { button: 0 });
    const painel = await screen.findByTestId('convites');
    await waitFor(() => expect(api.listAnexos).toHaveBeenCalledWith('e1', 'convite'));
    expect(await within(painel).findByRole('button', { name: 'Descarregar convite.png' })).toBeInTheDocument();

    fireEvent.change(within(painel).getByTestId('convites-input'), { target: { files: [new File(['x'], 'folheto.docx')] } });
    expect(api.uploadAnexo).not.toHaveBeenCalled(); // Word não é um convite válido

    fireEvent.change(within(painel).getByTestId('convites-input'), { target: { files: [new File(['x'], 'novo.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(api.uploadAnexo).toHaveBeenCalledWith('e1', expect.objectContaining({ name: 'novo.pdf' }), 'convite'));
    expect(await within(painel).findByRole('button', { name: 'Descarregar novo.pdf' })).toBeInTheDocument();
  });

  it('convites: quem só vê descarrega, mas não carrega nem remove', async () => {
    perm.canEdit = false;
    api.listAnexos.mockResolvedValue([{ id: 'a1', evento_id: 'e1', categoria: 'convite', path: 'e1/x.png', nome: 'convite.png', tipo: 'image/png', tamanho: 1000, created_at: '2099-01-01' }]);
    render(<MarketingPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir Open House' }));
    const det = await screen.findByTestId('evento-detalhe');
    fireEvent.mouseDown(within(det).getByRole('tab', { name: 'Convites' }), { button: 0 });
    const painel = await screen.findByTestId('convites');
    expect(await within(painel).findByRole('button', { name: 'Descarregar convite.png' })).toBeInTheDocument();
    expect(within(painel).queryByRole('button', { name: 'Carregar convite' })).toBeNull();
    expect(within(painel).queryByRole('button', { name: /remover/i })).toBeNull();
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

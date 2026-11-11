import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const { perm, rpc, toast, premiosDb, mobile } = vi.hoisted(() => ({ perm: { value: {} as Record<string, unknown> }, rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() }, premiosDb: { rows: [] as unknown[] }, mobile: { value: false } }));

vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: 'x@x.pt' } } }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => perm.value }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (t: string) => ({ select: async () => ({ data: t === 'demos_premios' ? premiosDb.rows : [], error: null }) }) },
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile.value }));

import DemosPage from '@/pages/DemosPage';

// jsdom não tem ResizeObserver (a coluna Local fixa usa-o para medir a largura).
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const viatura = (over: Record<string, unknown> = {}) => ({
  chassis: 'WBA0000000000001', matricula: 'AA00BB', modelo: 'iX1', versao: 'xDrive', encomenda: 'E1', estado_entrega: null,
  data_matricula: '2026-01-10', tipologia: ['BEV'], local: ['Aveiro'], marca: 'BMW', estado_negocio: 'VD', link_fotos: null,
  observacoes: null, kms: 10, reserva_expira: null, reserva_user: null, stats: {},
  inputs: { pvb: 50000, opc: 5000, bsi: 0, eco: 4.2, leg: 1550, isv: 0, mgb: 0.08, esf: 0.05, pac: 0, dem: 0, sup: 0, pvp_desc: 60000, depreciacoes: 1000 },
  ...over,
});

const perfil = (over: Record<string, unknown> = {}) => {
  perm.value = {
    isAdmin: false, me: { local: ['Aveiro'] }, capabilities: { demosPrecos: true, demosGestao: true, demosReservas: true },
    canView: () => true, canEdit: (t: string) => t === 'demos:precos' ? false : false, ...over,
  };
};
const linha = (modelo = 'iX1') => screen.findByText(modelo, { selector: 'td span.truncate' });
const cabecalhos = () => within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').map(h => h.textContent?.replace(/\s+/g, ' ').trim());

const dados = { parque: [viatura()] as unknown[], vendidas: [] as unknown[] };
beforeEach(() => {
  dados.parque = [viatura()]; dados.vendidas = []; premiosDb.rows = []; mobile.value = false;
  try { localStorage.removeItem('demos.modo'); } catch { /* */ }
  toast.success.mockReset(); toast.error.mockReset();
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === 'demos_viaturas') return { data: dados.parque, error: null };
    if (fn === 'demos_vendidas') return { data: dados.vendidas, error: null };
    return { data: null, error: null };
  });
});

describe('tab Demos', () => {
  it('mostra as mesmas colunas a todos os perfis, sem grupos colapsáveis nem custo/margem', async () => {
    for (const p of [{}, { isAdmin: true, canEdit: () => true }]) {
      perfil({ ...p, me: { local: [] } }); // sem filtro de local: a coluna Local aparece
      const { unmount } = render(<DemosPage />);
      await linha();
      const h = cabecalhos();
      for (const c of ['Local', 'Tipo / Marca', 'Modelo', 'Versão', 'Enc', 'Chassis', 'Matrícula', 'Data', 'Idade', 'Tipo', 'PVP', 'PVP Desc', 'PVP s/IVA']) expect(h, c).toContain(c);
      for (const c of ['PVB', 'OPC', 'MGB', 'DSC €', 'P Custo', 'DEP', 'Margem']) expect(h, c).not.toContain(c);
      expect(screen.queryByTitle(/Colapsar grupo|Expandir grupo/)).toBeNull();
      expect(screen.queryByText(/Descontos máximos/)).toBeNull(); // a tabela saiu do fundo da página
      unmount();
    }
  });

  it('quem não gere preços abre o cartão, sem a janela de preço', async () => {
    perfil();
    render(<DemosPage />);
    fireEvent.click(await linha());
    expect(await screen.findAllByText('Decomposição de preço')).toBeTruthy();
    expect(screen.queryByText(/1\. Estrutura base/)).toBeNull();
  });

  it('o administrador abre a janela de preço ao clicar na linha, com a identificação e os economics', async () => {
    perfil({ isAdmin: true, canEdit: () => true });
    render(<DemosPage />);
    fireEvent.click(await linha());
    expect(await screen.findByText(/0\. Identificação da viatura/)).toBeTruthy();
    expect(screen.getByText(/Desconto máximo · BEV · iX1, iX2/)).toBeTruthy();
    for (const t of [/1\. Estrutura base/, /2\. Descontos/, /3\. Apuramento PVP e margem/]) expect(screen.getByText(t)).toBeTruthy();
  });

  it('com demos:precos só abre a janela nas viaturas do seu local; as outras abrem o cartão', async () => {
    perfil({ canEdit: (t: string) => t === 'demos:precos', me: { local: ['Aveiro'] } });
    dados.parque = [viatura(), viatura({ chassis: 'WBA0000000000002', modelo: 'i4', local: ['Porto'] })];
    render(<DemosPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Todas' }))[0]); // limpa o filtro de local inicial
    fireEvent.click(await linha('iX1'));
    expect(await screen.findByText(/1\. Estrutura base/)).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(await linha('i4'));
    expect((await screen.findAllByText('Decomposição de preço')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1\. Estrutura base/)).toBeNull();
  });

  it('sem a migração (capacidade ausente) ninguém abre a janela: só o cartão', async () => {
    perfil({ isAdmin: true, capabilities: { demosPrecos: false, demosGestao: false, demosReservas: false }, canEdit: () => true });
    render(<DemosPage />);
    fireEvent.click(await linha());
    expect((await screen.findAllByText('Decomposição de preço')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1\. Estrutura base/)).toBeNull();
  });

  it('mostra todas as viaturas do parque (VD, VU e motas), como na Gestão VD', async () => {
    perfil({ me: { local: [] } });
    dados.parque = [
      viatura(),
      viatura({ chassis: 'W2', modelo: 'Série 3', estado_negocio: 'VU' }),
      viatura({ chassis: 'W3', modelo: 'R 1250', marca: ['BMW Motorrad'] }),
    ];
    render(<DemosPage />);
    await linha();
    expect(within(screen.getAllByRole('table')[0]).getAllByRole('row').filter(r => r.closest('tbody'))).toHaveLength(3);
    expect(screen.getByText('R 1250', { selector: 'td span.truncate' })).toBeTruthy();
  });
});

const futuro = () => new Date(Date.now() + 6 * 3600_000).toISOString();

describe('tab Demos: reserva de 24 h', () => {
  it('uma viatura reservada fica destacada para todos, sem coluna de reserva a quem não pode reservar', async () => {
    dados.parque = [viatura({ reserva_expira: futuro(), reserva_user: 'Chefe X' }), viatura({ chassis: 'W2', modelo: 'Série 3' })];
    perfil();
    render(<DemosPage />);
    await linha();
    const reservadas = document.querySelectorAll('tbody tr[data-reservada]');
    expect(reservadas).toHaveLength(1);
    expect(reservadas[0].textContent).toContain('RESERVADA');
    expect(cabecalhos()).not.toContain('Reserva');
  });

  it('o chefe de vendas reserva por 24 h e a viatura passa a destacada', async () => {
    perfil({ canEdit: (t: string) => t === 'demos:reservar', capabilities: { demosPrecos: true, demosGestao: true, demosReservas: true } });
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'demos_viaturas') return { data: dados.parque, error: null };
      if (fn === 'demos_reservar_viatura') return { data: { reserva_expira: futuro(), reserva_user: 'Chefe' }, error: null, args };
      return { data: null, error: null };
    });
    render(<DemosPage />);
    await linha();
    expect(cabecalhos()).toContain('Reserva');
    expect(document.querySelector('tbody tr[data-reservada]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reservar 24 h/ }));
    await waitFor(() => expect(document.querySelector('tbody tr[data-reservada]')).not.toBeNull());
    expect(rpc).toHaveBeenCalledWith('demos_reservar_viatura', { p_chassis: 'WBA0000000000001', p_libertar: false });
    expect(toast.success).toHaveBeenCalled();
    // e volta a poder libertá-la
    fireEvent.click(screen.getByRole('button', { name: /Libertar/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('demos_reservar_viatura', { p_chassis: 'WBA0000000000001', p_libertar: true }));
  });

  it('sem permissão (ou sem a migração) não há botão de reservar', async () => {
    perfil({ canEdit: (t: string) => t === 'demos:reservar', capabilities: { demosPrecos: true, demosGestao: true, demosReservas: false } });
    render(<DemosPage />);
    await linha();
    expect(screen.queryByRole('button', { name: /Reservar 24 h/ })).toBeNull();
  });
});

describe('tab Demos: cartões em telemóvel', () => {
  it('em telemóvel mostra cartões por defeito e deixa passar para a tabela e voltar', async () => {
    mobile.value = true;
    premiosDb.rows = [{ chassis: 'W2', premio: 100 }];
    dados.parque = [viatura(), viatura({ chassis: 'W2', modelo: 'Série 5', versao: '530e Touring', reserva_expira: futuro(), reserva_user: 'Chefe' })];
    perfil();
    render(<DemosPage />);
    const cartoes = await screen.findByTestId('demos-cartoes');
    expect(within(cartoes).getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByRole('table')).toBeNull();
    const c5 = within(cartoes).getByText('Série 5').closest('article')!;
    expect(c5.textContent).toContain('Reservada até');
    expect(c5.textContent).toContain('Prémio de venda +100 €');
    expect(c5.textContent).toContain('325 €');           // 225 + 100 de prémio
    expect(c5.getAttribute('data-premio')).toBe('sim');

    fireEvent.click(screen.getByRole('button', { name: /Tabela/ }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(screen.queryByTestId('demos-cartoes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cartões/ }));
    expect(await screen.findByTestId('demos-cartoes')).toBeTruthy();
  });

  it('no ecrã grande abre em tabela e também deixa escolher cartões', async () => {
    perfil();
    render(<DemosPage />);
    await linha();
    expect(screen.queryByTestId('demos-cartoes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cartões/ }));
    expect(await screen.findByTestId('demos-cartoes')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('em telemóvel os filtros ficam recolhidos (só a pesquisa à vista) e abrem em "Filtros"', async () => {
    mobile.value = true;
    perfil();
    render(<DemosPage />);
    await screen.findByTestId('demos-cartoes');
    expect(screen.getByLabelText('Pesquisar')).toBeTruthy();
    const conc = screen.getByText('Concessão');
    expect(conc.closest('.hidden')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    expect(screen.getByText('Concessão').closest('.hidden')).toBeNull();
  });

  it('o filtro Destaque mostra só as reservadas ou só as com prémio', async () => {
    premiosDb.rows = [{ chassis: 'W2', premio: 100 }];
    dados.parque = [
      viatura({ reserva_expira: futuro(), reserva_user: 'Chefe' }),
      viatura({ chassis: 'W2', modelo: 'Série 5', versao: '530e' }),
      viatura({ chassis: 'W3', modelo: 'Série 3' }),
    ];
    perfil();
    render(<DemosPage />);
    await linha();
    const modelos = () => Array.from(document.querySelectorAll('tbody td span.truncate')).map(e => e.textContent);
    expect(modelos()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Reservadas' }));
    expect(modelos()).toEqual(['iX1']);
    fireEvent.click(screen.getByRole('button', { name: 'Com prémio' }));
    expect(modelos()).toEqual(['Série 5']);
    fireEvent.click(within(screen.getByRole('group', { name: 'Destaque' })).getByRole('button', { name: 'Todas' }));
    expect(modelos()).toHaveLength(3);
  });
});

describe('tab Demos: pesquisa por matrícula', () => {
  it('a matrícula (guardada com hífenes, mostrada sem) encontra-se com ou sem hífenes', async () => {
    dados.parque = [viatura({ matricula: 'CH-99-AQ' }), viatura({ chassis: 'W2', modelo: 'Série 3', matricula: 'AA-11-BB' })];
    perfil();
    render(<DemosPage />);
    await linha();
    for (const q of ['CH99AQ', 'CH-99-AQ', 'ch 99 aq']) {
      fireEvent.change(screen.getByLabelText('Pesquisar'), { target: { value: q } });
      expect(await screen.findByText('iX1', { selector: 'td span.truncate' }), q).toBeTruthy();
      expect(screen.queryByText('Série 3', { selector: 'td span.truncate' }), q).toBeNull();
    }
    fireEvent.change(screen.getByLabelText('Pesquisar'), { target: { value: 'CH98AQ' } });
    expect(await screen.findByText('Nenhuma viatura encontrada.')).toBeTruthy();
  });
});

describe('tab Demos: comissão e prémio de venda', () => {
  it('mostra a comissão fixa do modelo (iX1 = X1 → 125 €) e não realça a linha sem prémio', async () => {
    perfil();
    render(<DemosPage />);
    await linha();
    expect(cabecalhos().some(h => h?.includes('Comissão'))).toBe(true);
    expect(screen.getByText('125 €')).toBeTruthy();
    expect(document.querySelector('tbody tr[data-premio]')).toBeNull();
  });

  it('com prémio: soma à comissão, mostra o detalhe e realça só essa viatura', async () => {
    premiosDb.rows = [{ chassis: 'W2', premio: 100 }];
    dados.parque = [viatura(), viatura({ chassis: 'W2', modelo: 'Série 5', versao: '530e Touring' })];
    perfil();
    render(<DemosPage />);
    await linha('Série 5');
    const realcadas = document.querySelectorAll('tbody tr[data-premio]');
    expect(realcadas).toHaveLength(1);
    expect(realcadas[0].textContent).toContain('Série 5');
    expect(realcadas[0].textContent).toContain('325 €');            // 225 + 100
    expect(realcadas[0].textContent).toContain('225 € + 100 € prémio');
  });

  it('o administrador define o prémio na janela da viatura', async () => {
    perfil({ isAdmin: true, canEdit: () => true });
    render(<DemosPage />);
    fireEvent.click(await linha());
    const sec = await screen.findByTestId('premio-venda');
    expect(within(sec).getByLabelText('Prémio de venda')).toBeTruthy();
    expect(within(sec).getAllByText(/125,00/).length).toBeGreaterThan(0);
  });
});

describe('tab Demos: filtros da Gestão VD (escolha única)', () => {
  const tres = () => {
    dados.parque = [
      viatura({ chassis: 'A1', modelo: 'iX1', local: ['Aveiro'] }),
      viatura({ chassis: 'P1', modelo: 'i4', local: ['Porto'], estado_negocio: 'VU' }),
      viatura({ chassis: 'P2', modelo: 'R 1250', local: ['Porto'], marca: ['BMW Motorrad'] }),
    ];
  };
  const grupo = (nome: string) => within(screen.getByRole('group', { name: nome }));
  const modelos = () => screen.queryAllByText(/^(iX1|i4|R 1250)$/, { selector: 'td span.truncate' }).map(e => e.textContent);

  it('Concessão, Tipo e Marca filtram e combinam; "Todas/Todos" repõe', async () => {
    perfil({ me: { local: [] } }); tres();
    render(<DemosPage />);
    await linha();
    expect(modelos().sort()).toEqual(['R 1250', 'i4', 'iX1']);

    fireEvent.click(grupo('Concessão').getByRole('button', { name: 'Porto' }));
    expect(modelos().sort()).toEqual(['R 1250', 'i4']);
    fireEvent.click(grupo('Tipo').getByRole('button', { name: 'VU' }));
    expect(modelos()).toEqual(['i4']);
    fireEvent.click(grupo('Tipo').getByRole('button', { name: 'Todos' }));
    fireEvent.click(grupo('Marca').getByRole('button', { name: 'BMW Motorrad' }));
    expect(modelos()).toEqual(['R 1250']);
    expect(grupo('Marca').getByRole('button', { name: 'BMW Motorrad' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(grupo('Marca').getByRole('button', { name: 'Todas' }));
    fireEvent.click(grupo('Concessão').getByRole('button', { name: 'Todas' }));
    expect(modelos().sort()).toEqual(['R 1250', 'i4', 'iX1']);
  });

  it('a pesquisa combina com os filtros', async () => {
    perfil({ me: { local: [] } }); tres();
    render(<DemosPage />);
    await linha();
    fireEvent.click(grupo('Concessão').getByRole('button', { name: 'Porto' }));
    fireEvent.change(screen.getByLabelText('Pesquisar'), { target: { value: 'i4' } });
    expect(modelos()).toEqual(['i4']);
  });

  it('abre na concessão do perfil quando é só uma', async () => {
    perfil({ me: { local: ['Porto'] } }); tres();
    render(<DemosPage />);
    await linha('i4');
    expect(grupo('Concessão').getByRole('button', { name: 'Porto' }).getAttribute('aria-pressed')).toBe('true');
    expect(modelos().sort()).toEqual(['R 1250', 'i4']);
  });

  it('com várias concessões no perfil (ou nenhuma) abre em "Todas"', async () => {
    perfil({ me: { local: ['Porto', 'Gaia'] } }); tres();
    render(<DemosPage />);
    await linha();
    expect(grupo('Concessão').getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('se a concessão do perfil não tem viaturas, passa a "Todas" em vez de uma tabela vazia', async () => {
    perfil({ me: { local: ['Gaia'] } }); tres();
    render(<DemosPage />);
    await linha();
    expect(grupo('Concessão').getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');
    expect(modelos()).toHaveLength(3);
  });
});

describe('tab Demos: adicionar, arquivar e consultar vendidas', () => {
  it('"Adicionar viatura" só aparece a quem pode (inserir-viaturas) e com a migração', async () => {
    perfil({ me: { local: [] } });
    const { unmount } = render(<DemosPage />);
    await linha();
    expect(screen.queryByRole('button', { name: /Adicionar viatura/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Vendidas/ })).toBeNull();
    unmount();

    perfil({ me: { local: [] }, canEdit: (t: string) => t === 'demos:inserir-viaturas' });
    const b = render(<DemosPage />);
    await linha();
    expect(screen.getByRole('button', { name: /Adicionar viatura/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Vendidas/ })).toBeNull(); // arquivo é de demos:precos
    b.unmount();

    perfil({ me: { local: [] }, canEdit: (t: string) => t === 'demos:inserir-viaturas', capabilities: { demosPrecos: true, demosGestao: false, demosReservas: false } });
    render(<DemosPage />);
    await linha();
    expect(screen.queryByRole('button', { name: /Adicionar viatura/ })).toBeNull();
  });

  const abrirNova = async () => {
    perfil({ isAdmin: true, me: { local: [] }, canEdit: () => true });
    render(<DemosPage />);
    await linha();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar viatura/ }));
    await screen.findByText(/0\. Identificação da viatura/);
  };
  const preencher = (rotulo: RegExp, valor: string) =>
    fireEvent.change(within(screen.getByRole('dialog')).getByText(rotulo).closest('label')!.querySelector('input')!, { target: { value: valor } });

  it('adicionar: valida obrigatórios e duplicados antes de ir à base de dados', async () => {
    await abrirNova();
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar$/ }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Preenche: Encomenda, Chassis, Matrícula/));
    expect(rpc.mock.calls.some(c => c[0] === 'demos_criar_viatura')).toBe(false);

    preencher(/^Encomenda/, 'E9'); preencher(/^Chassis/, 'wba0000000000001'); preencher(/^Matrícula/, 'ab12cd');
    preencher(/^Modelo/, 'iX1'); preencher(/^Versão/, 'xDrive30');
    fireEvent.click(screen.getAllByRole('button', { name: 'Aveiro' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar$/ }));
    expect(toast.error).toHaveBeenLastCalledWith('O chassis WBA0000000000001 já existe no parque.');
    preencher(/^Chassis/, 'WBA0000000000099'); preencher(/^Matrícula/, 'aa00bb');
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar$/ }));
    expect(toast.error).toHaveBeenLastCalledWith('A matrícula AA-00-BB já está associada a outra viatura.');
  });

  it('adicionar: envia a identificação normalizada e todos os preços; a viatura entra na tabela', async () => {
    await abrirNova();
    preencher(/^Encomenda/, ' E9 '); preencher(/^Chassis/, 'wba0000000000077'); preencher(/^Matrícula/, 'ab12cd');
    preencher(/^Modelo/, 'iX3'); preencher(/^Versão/, 'M60'); preencher(/^PVB/, '50.000,50'); preencher(/^MGB/, '8,5');
    fireEvent.click(screen.getByRole('button', { name: 'BEV' }));
    fireEvent.click(screen.getByRole('button', { name: 'VU' }));
    fireEvent.click(screen.getByRole('button', { name: 'BMW Motorrad' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Aveiro' }).at(-1)!);
    const nova = viatura({ chassis: 'WBA0000000000077', modelo: 'iX3', versao: 'M60', local: ['Aveiro'], estado_negocio: 'VU' });
    rpc.mockImplementation(async (fn: string) => fn === 'demos_criar_viatura' ? { data: nova, error: null }
      : { data: fn === 'demos_viaturas' ? dados.parque : [], error: null });
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar$/ }));
    await waitFor(() => expect(rpc.mock.calls.some(c => c[0] === 'demos_criar_viatura')).toBe(true));
    const [, args] = rpc.mock.calls.find(c => c[0] === 'demos_criar_viatura')!;
    expect(args.p).toMatchObject({
      chassis: 'WBA0000000000077', matricula: 'AB-12-CD', encomenda: 'E9', modelo: 'iX3', versao: 'M60',
      estado_negocio: 'VU', marca: 'BMW Motorrad', tipologia: ['BEV'], local: ['Aveiro'],
    });
    expect(args.p.inputs.pvb).toBe(50000.5);
    expect(args.p.inputs.mgb).toBeCloseTo(0.085);
    expect(args.p.inputs.eco).toBe(4.2);
    expect(Object.keys(args.p.inputs)).toHaveLength(13);
    expect(await screen.findByText('iX3', { selector: 'td span.truncate' })).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith('Viatura adicionada.');
  });

  it('adicionar: um erro da base de dados (ex.: sem permissão) aparece e a janela fica aberta', async () => {
    await abrirNova();
    preencher(/^Encomenda/, 'E9'); preencher(/^Chassis/, 'NOVO1'); preencher(/^Matrícula/, 'ab12cd');
    preencher(/^Modelo/, 'iX3'); preencher(/^Versão/, 'M60');
    fireEvent.click(screen.getAllByRole('button', { name: 'Aveiro' }).at(-1)!);
    rpc.mockImplementation(async (fn: string) => fn === 'demos_criar_viatura'
      ? { data: null, error: { code: '23505', message: 'A matrícula AB-12-CD já está associada a outra viatura.' } }
      : { data: dados.parque, error: null });
    fireEvent.click(screen.getByRole('button', { name: /^Adicionar$/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A matrícula AB-12-CD já está associada a outra viatura.'));
    expect(screen.getByText(/0\. Identificação da viatura/)).toBeTruthy();
  });

  it('arquivar: "Vendida (Arquivar)" confirma, arquiva e tira a viatura do parque', async () => {
    perfil({ isAdmin: true, me: { local: [] }, canEdit: () => true });
    render(<DemosPage />);
    fireEvent.click(await linha());
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(await screen.findByRole('button', { name: /Vendida \(Arquivar\)/ }));
    expect(rpc.mock.calls.some(c => c[0] === 'demos_arquivar_viatura')).toBe(false); // cancelou
    await waitFor(() => expect((screen.getByRole('button', { name: /Vendida \(Arquivar\)/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Vendida \(Arquivar\)/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('demos_arquivar_viatura', { p_chassis: 'WBA0000000000001' }));
    await waitFor(() => expect(screen.queryByText(/1\. Estrutura base/)).toBeNull());
    expect(screen.queryByText('iX1', { selector: 'td span.truncate' })).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Viatura arquivada em "Vendidas".');
    confirmar.mockRestore();
  });

  it('arquivar: sem permissão, a base de dados recusa e a viatura fica', async () => {
    perfil({ isAdmin: true, me: { local: [] }, canEdit: () => true });
    render(<DemosPage />);
    fireEvent.click(await linha());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rpc.mockImplementation(async (fn: string) => fn === 'demos_arquivar_viatura'
      ? { data: null, error: { code: '42501', message: 'x' } } : { data: dados.parque, error: null });
    fireEvent.click(await screen.findByRole('button', { name: /Vendida \(Arquivar\)/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Sem permissão para arquivar esta viatura.'));
    expect(screen.getByText(/1\. Estrutura base/)).toBeTruthy();
  });

  it('Vendidas: lista o arquivo, pesquisa, e "Recuperar viatura" repõe no parque', async () => {
    perfil({ isAdmin: true, me: { local: [] }, canEdit: () => true });
    dados.vendidas = [
      { id: 7, chassis: 'V7', matricula: 'AA00BB', modelo: 'iX1', versao: 'xDrive', encomenda: 'E1', local: ['Porto'], preco_final: 55000, data_venda: '2026-11-04T15:00:00Z', vendido_por: 'Rodrigo Silva' },
      { id: 8, chassis: 'V8', matricula: 'CC11DD', modelo: 'i4', versao: 'eDrive', encomenda: 'E2', local: ['Gaia'], preco_final: null, data_venda: null, vendido_por: null },
    ];
    render(<DemosPage />);
    await linha();
    fireEvent.click(screen.getByRole('button', { name: /Vendidas/ }));
    expect(await screen.findByText('Rodrigo Silva')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Viaturas vendidas' })).toBeTruthy();
    expect(screen.getByText(/55\D?000,00/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Pesquisar \(modelo/), { target: { value: 'i4' } });
    expect(screen.queryByText('Rodrigo Silva')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Pesquisar \(modelo/), { target: { value: '' } });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: /Recuperar viatura/ })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('demos_repor_viatura', { p_id: 7 }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Viatura recuperada para o parque.'));
    expect(screen.queryByText('Rodrigo Silva')).toBeNull();
    const chamadas = rpc.mock.calls.filter(c => c[0] === 'demos_viaturas').length;
    expect(chamadas).toBeGreaterThanOrEqual(2); // o parque recarrega
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao parque/ }));
    expect(await linha()).toBeTruthy();
  });

  it('Vendidas: chassis repetido no parque → aviso claro', async () => {
    perfil({ isAdmin: true, me: { local: [] }, canEdit: () => true });
    dados.vendidas = [{ id: 7, chassis: 'V7', matricula: 'AA00BB', modelo: 'iX1', versao: 'x', encomenda: 'E1', local: ['Porto'], preco_final: 1, data_venda: null, vendido_por: null }];
    render(<DemosPage />);
    await linha();
    fireEvent.click(screen.getByRole('button', { name: /Vendidas/ }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    rpc.mockImplementation(async (fn: string) => fn === 'demos_repor_viatura'
      ? { data: null, error: { code: '23505', message: 'x' } } : { data: fn === 'demos_vendidas' ? dados.vendidas : dados.parque, error: null });
    fireEvent.click(await screen.findByRole('button', { name: /Recuperar viatura/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Já existe no parque uma viatura com este chassis.'));
    expect(screen.getByText('V7')).toBeTruthy();
  });
});

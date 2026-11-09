import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { perm, rpc } = vi.hoisted(() => ({
  perm: { value: {} as Record<string, unknown> },
  rpc: vi.fn(),
}));

vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: 'x@x.pt' } } }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => perm.value }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import DemosPage from '@/pages/DemosPage';

const viatura = (over: Record<string, unknown> = {}) => ({
  chassis: 'WBA0000000000001', matricula: 'AA00BB', modelo: 'iX1', versao: 'xDrive', encomenda: 'E1', estado_entrega: null,
  data_matricula: '2026-01-10', tipologia: ['BEV'], local: ['Aveiro'], marca: 'BMW', estado_negocio: 'VD', link_fotos: null,
  observacoes: null, kms: 10, reserva_expira: null, reserva_user: null, stats: {},
  inputs: { pvb: 50000, opc: 5000, bsi: 0, eco: 4.2, leg: 1550, isv: 0, mgb: 0.08, esf: 0.05, pac: 0, dem: 0, sup: 0, pvp_desc: 60000, depreciacoes: 1000 },
  ...over,
});

const perfil = (over: Record<string, unknown>) => {
  const granted = (over.granted as string[] | undefined) ?? [];
  const editar = over.editar === true;
  perm.value = {
    isAdmin: false, me: { local: ['Aveiro'] }, capabilities: { demosPrecos: true },
    canView: (t: string) => t === 'demos' || granted.includes(t),
    canEdit: (t: string) => (t === 'demos:precos' ? editar : t === 'demos' ? false : false),
    ...over,
  };
};

const linha = (modelo = 'iX1') => screen.findByText(modelo, { selector: 'td span.truncate' });
const cabecalhos = () => within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').map(h => h.textContent?.replace(/\s+/g, ' ').trim());

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [viatura()], error: null }); });

describe('tab Demos: colunas por função e janela de preço', () => {
  it('só mostra as colunas atribuídas à função, sem grupos colapsáveis', async () => {
    perfil({ granted: ['demos:col:pvp', 'demos:col:pvp_desc'] });
    render(<DemosPage />);
    await linha();
    const h = cabecalhos();
    expect(h).toContain('PVP');
    expect(h).toContain('PVP Desc');
    for (const escondida of ['MGB', 'DSC €', 'P Custo', 'Margem', 'DEP', 'PVB']) expect(h, escondida).not.toContain(escondida);
    expect(screen.queryByTitle(/Colapsar grupo|Expandir grupo/)).toBeNull();
  });

  it('o administrador vê todas as colunas, incluindo descontos e margem', async () => {
    perfil({ isAdmin: true, canView: () => true, canEdit: () => true });
    render(<DemosPage />);
    await linha();
    const h = cabecalhos();
    for (const c of ['PVB', 'MGB', 'DSC €', 'P Custo', 'DEP', 'Margem', 'PVP Desc', 'PVP s/IVA']) expect(h, c).toContain(c);
    // já não há edição inline "para simular"
    expect(screen.queryByText(/Repor simulação/)).toBeNull();
  });

  it('sem a migração (capacidade ausente) mantém a regra antiga: sem descontos nem custo', async () => {
    perfil({ capabilities: { demosPrecos: false } });
    render(<DemosPage />);
    await linha();
    const h = cabecalhos();
    expect(h).toContain('PVB');
    for (const c of ['MGB', 'P Custo', 'Margem']) expect(h, c).not.toContain(c);
  });

  it('"Gerir preço" só aparece a quem pode, nas viaturas do seu local', async () => {
    perfil({ granted: ['demos:col:pvp_desc'], editar: false });
    const { unmount } = render(<DemosPage />);
    fireEvent.click(await linha());
    expect(screen.queryByText('Gerir preço')).toBeNull();
    unmount();

    perfil({ granted: ['demos:col:pvp_desc'], editar: true });
    rpc.mockResolvedValue({ data: [viatura(), viatura({ chassis: 'WBA0000000000002', modelo: 'i4', local: ['Porto'] })], error: null });
    render(<DemosPage />);
    fireEvent.click(await linha());
    expect(screen.getByText('Gerir preço')).toBeTruthy();
    fireEvent.click(screen.getByText('Gerir preço'));
    expect(await screen.findByText(/1\. Estrutura base/)).toBeTruthy();
  });

  it('o cartão não mostra linhas de preço de colunas que a função não vê', async () => {
    perfil({ granted: ['demos:col:pvp_desc'] });
    render(<DemosPage />);
    fireEvent.click(await linha());
    const cartao = (await screen.findAllByText('Decomposição de preço'))[0].parentElement as HTMLElement;
    expect(within(cartao).getByText('PVP Final')).toBeTruthy();
    for (const t of ['Preço Base (PVB)', 'Preço de custo', /Desconto/]) expect(within(cartao).queryByText(t)).toBeNull();
  });
});

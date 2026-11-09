import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const { perm, rpc } = vi.hoisted(() => ({ perm: { value: {} as Record<string, unknown> }, rpc: vi.fn() }));

vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: 'x@x.pt' } } }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => perm.value }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => ({ select: async () => ({ data: [], error: null }) }) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
    isAdmin: false, me: { local: ['Aveiro'] }, capabilities: { demosPrecos: true },
    canView: () => true, canEdit: (t: string) => t === 'demos:precos' ? false : false, ...over,
  };
};
const linha = (modelo = 'iX1') => screen.findByText(modelo, { selector: 'td span.truncate' });
const cabecalhos = () => within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').map(h => h.textContent?.replace(/\s+/g, ' ').trim());

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: [viatura()], error: null }); });

describe('tab Demos', () => {
  it('mostra as mesmas colunas a todos os perfis, sem grupos colapsáveis nem custo/margem', async () => {
    for (const p of [{}, { isAdmin: true, canEdit: () => true }]) {
      perfil({ ...p, me: { local: [] } }); // sem filtro de local: a coluna Local aparece
      const { unmount } = render(<DemosPage />);
      await linha();
      const h = cabecalhos();
      for (const c of ['Local', 'Modelo', 'Versão', 'Enc', 'Chassis', 'Matrícula', 'Data', 'Idade', 'Tipo', 'PVP', 'PVP Desc', 'PVP s/IVA']) expect(h, c).toContain(c);
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
    rpc.mockResolvedValue({ data: [viatura(), viatura({ chassis: 'WBA0000000000002', modelo: 'i4', local: ['Porto'] })], error: null });
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
    perfil({ isAdmin: true, capabilities: { demosPrecos: false }, canEdit: () => true });
    render(<DemosPage />);
    fireEvent.click(await linha());
    expect((await screen.findAllByText('Decomposição de preço')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/1\. Estrutura base/)).toBeNull();
  });
});

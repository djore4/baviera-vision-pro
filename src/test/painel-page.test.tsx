import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ControlRecord } from '@/types/data';
import type { Notification } from '@/lib/notifications';

const hoje = new Date();
const dia = (atras: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - atras);
const rec = (over: Partial<ControlRecord>): ControlRecord => ({
  id: `id-${Math.random().toString(36).slice(2)}`, status: 'Carteira', neg: dia(1), mes1: '2027/01', resp: 'JD',
  cliente: 'Cliente', type: 'VN', biz: 'B1', enc: '', chas: 'WBA0001', mat: '', model: 'X1', version: '20e',
  gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, ret: 0, fin: 'FS', week198: '', dmat: null, date298: null,
  dfat: null, obs: '', matPedidaEm: null, ...over,
});

let CONTROL: ControlRecord[] = [];
let NOTIFS: Notification[] = [];
let ADMIN = false;
const openEditor = vi.fn();
const createNotification = vi.fn(async () => ({}));

vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: 'ana@x.pt' } } }) }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ data: { control: CONTROL } }) }));
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({
    isAdmin: ADMIN, canView: () => true, canEdit: () => true,
    me: { nome: 'Ana Costa' }, effectiveEmail: 'ana@x.pt',
  }),
}));
vi.mock('@/components/RecordEditor', () => ({ useRecordEditor: () => ({ openEditor }) }));
vi.mock('@/lib/lead-time-entrega', async (orig) => ({
  ...(await orig<typeof import('@/lib/lead-time-entrega')>()),
  carregarEntradasParque: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/painel', async (orig) => ({
  ...(await orig<typeof import('@/lib/painel')>()),
  carregarEventosPainel: vi.fn(async () => []),
}));
vi.mock('@/lib/notifications', async (orig) => ({
  ...(await orig<typeof import('@/lib/notifications')>()),
  listNotifications: vi.fn(async () => NOTIFS),
  createNotification: (...a: unknown[]) => createNotification(...(a as [])),
  deleteNotification: vi.fn(async () => {}),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PainelPage from '@/pages/PainelPage';

const montar = () => render(<MemoryRouter><PainelPage /></MemoryRouter>);

beforeEach(() => {
  openEditor.mockReset(); createNotification.mockClear();
  ADMIN = false; NOTIFS = [];
  localStorage.clear();
  CONTROL = [
    rec({ resp: 'AC', week198: '12P', model: 'iX1', cliente: 'Maria', chas: 'PARK1' }),       // parque sem matrícula
    rec({ resp: 'AC', fin: 'PP', model: 'X3' }),                                              // financiamento
    rec({ resp: 'ZZ', biz: '', neg: dia(30), model: 'Série 5' }),                             // bizagi (de outro comercial)
  ];
});

describe('Painel', () => {
  it('cumprimenta, resume e mostra por omissão só os negócios do próprio comercial (iniciais AC)', async () => {
    montar();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/Ana/);
    // "Os meus (AC)": parque + financiamento; o Bizagi é do ZZ e não aparece.
    expect(screen.getByTestId('alerta-parque-sem-matricula')).toBeInTheDocument();
    expect(screen.getByTestId('alerta-financiamento-bmw')).toBeInTheDocument();
    expect(screen.queryByTestId('alerta-sem-bizagi')).not.toBeInTheDocument();
    expect(screen.getByTestId('painel-em-dia')).toHaveTextContent(/Negócio fechado sem Bizagi/);
  });

  it('"Toda a equipa" mostra também os de outros comerciais', async () => {
    montar();
    await screen.findByTestId('painel');
    fireEvent.change(screen.getByLabelText('Ver'), { target: { value: 'equipa' } });
    expect(screen.getByTestId('alerta-sem-bizagi')).toBeInTheDocument();
  });

  it('clicar numa linha abre o registo', async () => {
    montar();
    const cartao = await screen.findByTestId('alerta-parque-sem-matricula');
    fireEvent.click(within(cartao).getByRole('button', { name: /iX1/ }));
    expect(openEditor).toHaveBeenCalledWith(CONTROL[0].id);
  });

  it('mostra as mensagens da administração marcadas para o Painel e permite dispensá-las', async () => {
    NOTIFS = [
      { id: 'm1', title: 'Reunião às 15h', body: 'Sala 2', audience: 'all', created_by: null, created_by_nome: 'Direção', created_at: hoje.toISOString(), painel: true },
      { id: 'm2', title: 'Só no sino', body: null, audience: 'all', created_by: null, created_by_nome: null, created_at: hoje.toISOString(), painel: false },
    ];
    montar();
    const msgs = await screen.findByTestId('painel-mensagens');
    expect(msgs).toHaveTextContent('Reunião às 15h');
    expect(screen.queryByText('Só no sino')).not.toBeInTheDocument();
    fireEvent.click(within(msgs).getByLabelText('Dispensar mensagem'));
    await waitFor(() => expect(screen.queryByText('Reunião às 15h')).not.toBeInTheDocument());
  });

  it('só a administração vê o botão para lançar uma mensagem, e publica-a no Painel', async () => {
    const { unmount } = montar();
    await screen.findByTestId('painel');
    expect(screen.queryByRole('button', { name: /Mensagem/ })).not.toBeInTheDocument();
    unmount();

    ADMIN = true;
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Mensagem/ }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Atenção' } });
    fireEvent.click(screen.getByRole('button', { name: /Publicar/ }));
    await waitFor(() => expect(createNotification).toHaveBeenCalledTimes(1));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Atenção', painel: true, audience: 'all' }));
  });
});

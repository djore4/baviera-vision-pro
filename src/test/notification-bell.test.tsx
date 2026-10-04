import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Notification } from '@/lib/notifications';

/* O sino com notificações simuladas: quem vê o quê e para onde leva cada clique. */

const n = (id: string, over: Partial<Notification>): Notification => ({
  id, title: `T-${id}`, body: `corpo ${id}`, audience: 'all', created_by: 'admin@x.pt', created_by_nome: 'Admin',
  created_at: '2026-10-04T10:00:00Z', recipient_email: null, link: null, ...over,
});

let NOTIFS: Notification[] = [];
let ME = 'vend@x.pt';
let PERMS = new Set<string>(['end-of-term']);
let ADMIN = false;

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/App', () => ({ useAuth: () => ({ session: { user: { email: ME } } }) }));
// Funções e objetos estáveis: o contexto real memoriza-os, e um canView novo a cada render faria o sino recarregar em ciclo.
const canView = (t: string) => ADMIN || PERMS.has(t);
const ME_OBJ = { nome: 'Pessoa' };
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ canView, isAdmin: ADMIN, me: ME_OBJ }),
}));
const SCOPE = { isDirector: false, email: 'x' };
vi.mock('@/hooks/useProspecScope', () => ({ useProspecScope: () => ({ scope: SCOPE }) }));
vi.mock('@/lib/prospec', () => ({
  listTaskAlerts: vi.fn(async () => ({ overdue: [], today: [] })),
  listRecentAccounts: vi.fn(async () => []),
}));
vi.mock('@/lib/notifications', async (orig) => ({
  ...(await orig<typeof import('@/lib/notifications')>()),
  listNotifications: vi.fn(async () => NOTIFS),
  listReadIds: vi.fn(async () => new Set<string>()),
  markRead: vi.fn(async () => {}),
  createNotification: vi.fn(),
  deleteNotification: vi.fn(),
}));

import { NotificationBell } from '@/components/NotificationBell';

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div>; }
const renderBell = () => render(<MemoryRouter initialEntries={['/inicio']}><NotificationBell /><Where /></MemoryRouter>);
const openBell = async () => {
  const bell = await screen.findByRole('button', { name: 'Notificações' });
  await waitFor(() => expect(bell).toHaveTextContent(/\d/));       // espera pelos dados (contador)
  fireEvent.click(bell);
};

beforeEach(() => { ME = 'vend@x.pt'; PERMS = new Set(['end-of-term']); ADMIN = false; NOTIFS = []; });

describe('NotificationBell — avisos do End-of-Term', () => {
  it('o vendedor vê o aviso que lhe é dirigido, e não os dos outros nem os do administrador', async () => {
    NOTIFS = [
      n('mine', { title: 'Contrato End-of-Term atribuído', audience: 'end-of-term', recipient_email: 'Vend@X.pt', link: '/end-of-term?contrato=C-1' }),
      n('other', { title: 'Aviso de outro vendedor', audience: 'end-of-term', recipient_email: 'outro@x.pt', link: '/end-of-term?contrato=C-2' }),
      n('adm', { title: 'End-of-Term · nova tarefa de Fulano', audience: '@admin', link: '/end-of-term?contrato=C-3' }),
      n('geral', { title: 'Mensagem geral' }),
    ];
    renderBell();
    await openBell();
    expect(await screen.findByText('Contrato End-of-Term atribuído')).toBeInTheDocument();
    expect(screen.getByText('Mensagem geral')).toBeInTheDocument();
    expect(screen.queryByText('Aviso de outro vendedor')).not.toBeInTheDocument();
    expect(screen.queryByText(/nova tarefa de Fulano/)).not.toBeInTheDocument();
    expect(screen.getByText('Para si')).toBeInTheDocument();
  });

  it('clicar no aviso de atribuição leva ao contrato (hotlink) e fecha o painel', async () => {
    NOTIFS = [n('mine', { title: 'Contrato End-of-Term atribuído', audience: 'end-of-term', recipient_email: 'vend@x.pt', link: '/end-of-term?contrato=C-1' })];
    renderBell();
    await openBell();
    fireEvent.click(await screen.findByText('Contrato End-of-Term atribuído'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/end-of-term?contrato=C-1'));
    await waitFor(() => expect(screen.queryByText('Contrato End-of-Term atribuído')).not.toBeInTheDocument());
  });

  it('o administrador vê os avisos de atividade dos vendedores e o clique leva ao contrato', async () => {
    ME = 'admin@x.pt'; ADMIN = true;
    NOTIFS = [
      n('adm1', { title: 'End-of-Term · nova tarefa de Fulano', audience: '@admin', link: '/end-of-term?contrato=EOT%20X%26Y%2F1' }),
      n('adm2', { title: 'End-of-Term · nova interação de Fulano', audience: '@admin', link: '/end-of-term?contrato=C-9' }),
      n('para-vendedor', { title: 'Contrato End-of-Term atribuído', audience: 'end-of-term', recipient_email: 'vend@x.pt', link: '/end-of-term?contrato=C-1' }),
    ];
    renderBell();
    await openBell();
    expect(await screen.findByText(/nova interação de Fulano/)).toBeInTheDocument();
    expect(screen.queryByText('Contrato End-of-Term atribuído')).not.toBeInTheDocument();   // nem o admin vê o aviso dirigido a outro
    fireEvent.click(screen.getByText(/nova tarefa de Fulano/));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/end-of-term?contrato=EOT%20X%26Y%2F1'));
  });

  it('o contador conta só o que a pessoa pode ver', async () => {
    NOTIFS = [
      n('a', { audience: 'end-of-term', recipient_email: 'vend@x.pt', link: '/end-of-term?contrato=C-1' }),
      n('b', { audience: 'end-of-term', recipient_email: 'outro@x.pt', link: '/end-of-term?contrato=C-2' }),
      n('c', { audience: '@admin' }),
      n('d', {}),
    ];
    renderBell();
    const bell = await screen.findByRole('button', { name: 'Notificações' });
    await waitFor(() => expect(bell).toHaveTextContent('2'));   // a (dela) + d (geral)
  });

  it('uma notificação sem link continua a abrir a área a que se dirige (comportamento de sempre)', async () => {
    PERMS = new Set(['lavagem']);
    NOTIFS = [n('lav', { title: 'Mensagem da lavagem', audience: 'lavagem', link: null })];
    renderBell();
    await openBell();
    fireEvent.click(await screen.findByText('Mensagem da lavagem'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/lavagem'));
  });

  it('links inseguros nunca são seguidos', async () => {
    NOTIFS = [
      n('ext', { title: 'Link externo', audience: 'all', link: 'https://evil.example/x' }),
      n('proto', { title: 'Link protocolo-relativo', audience: 'all', link: '//evil.example/x' }),
      n('js', { title: 'Link javascript', audience: 'all', link: 'javascript:alert(1)' }),
    ];
    renderBell();
    await openBell();
    for (const t of ['Link externo', 'Link protocolo-relativo', 'Link javascript']) fireEvent.click(await screen.findByText(t));
    expect(screen.getByTestId('where')).toHaveTextContent('/inicio');   // não saiu de onde estava
  });

  it('o aviso com destino é um link acessível por teclado', async () => {
    NOTIFS = [n('mine', { title: 'Contrato End-of-Term atribuído', audience: 'end-of-term', recipient_email: 'vend@x.pt', link: '/end-of-term?contrato=C-1' })];
    renderBell();
    await openBell();
    const card = (await screen.findByText('Contrato End-of-Term atribuído')).closest('[role="link"]') as HTMLElement;
    expect(card).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(card, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/end-of-term?contrato=C-1'));
  });
});

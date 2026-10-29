import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { EventoAtividade, ResumoUtilizador } from '@/lib/atividade';

const listarResumo = vi.fn();
const listarEventos = vi.fn();
const registarAtividade = vi.fn(async (_tipo: string, _pagina: string) => {});
vi.mock('@/lib/atividade', async orig => ({
  ...(await orig<typeof import('@/lib/atividade')>()),
  listarResumo: (...a: unknown[]) => listarResumo(...a),
  listarEventos: (...a: unknown[]) => listarEventos(...a),
  registarAtividade: (t: string, p: string) => registarAtividade(t, p),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import LogsPage from '@/pages/LogsPage';
import { ActivityTracker } from '@/components/ActivityTracker';
import { haQuanto } from '@/lib/atividade';

const agora = Date.now();
const iso = (minAtras: number) => new Date(agora - minAtras * 60000).toISOString();
const mk = (email: string, over: Partial<ResumoUtilizador> = {}): ResumoUtilizador => ({
  email, nome: null, perfil: 'Vendedor VN', ultimo_login: null, ultima_atividade: null,
  sessoes: 0, paginas: 0, pagina_top: null, ...over,
});

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

describe('haQuanto', () => {
  it('escala de agora até dias, e depois a data', () => {
    expect(haQuanto(null)).toBe('—');
    expect(haQuanto(iso(0), agora)).toBe('agora');
    expect(haQuanto(iso(5), agora)).toBe('há 5 min');
    expect(haQuanto(iso(180), agora)).toBe('há 3 h');
    expect(haQuanto(iso(60 * 24), agora)).toBe('há 1 dia');
    expect(haQuanto(iso(60 * 24 * 4), agora)).toBe('há 4 dias');
    expect(haQuanto(iso(60 * 24 * 90), agora)).not.toMatch(/^há/);
  });
});

describe('Página Logs', () => {
  const dados = [
    mk('ana@x.pt', { nome: 'Ana', ultimo_login: iso(60 * 24 * 3), ultima_atividade: iso(10), sessoes: 4, paginas: 37, pagina_top: '/funil' }),
    mk('rui@x.pt', { nome: 'Rui' }),
  ];

  it('mostra último login, última atividade e quem nunca entrou', async () => {
    listarResumo.mockResolvedValue(dados);
    render(<MemoryRouter><LogsPage /></MemoryRouter>);
    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(screen.getByText('há 3 dias')).toBeTruthy();
    expect(screen.getByText('há 10 min')).toBeTruthy();
    expect(screen.getByText('Funil')).toBeTruthy();       // etiqueta do tab, não a rota
    expect(screen.getByText('Nunca')).toBeTruthy();       // Rui
    expect(screen.getByText('Sem registo')).toBeTruthy();
    expect(screen.getByText(/1 sem nunca entrar/)).toBeTruthy();
    expect(listarResumo).toHaveBeenCalledWith(30);
  });

  it('procura por nome, email ou função', async () => {
    listarResumo.mockResolvedValue(dados);
    render(<MemoryRouter><LogsPage /></MemoryRouter>);
    await screen.findByText('Ana');
    fireEvent.change(screen.getByPlaceholderText(/Procurar/), { target: { value: 'rui@' } });
    expect(screen.queryByText('Ana')).toBeNull();
    expect(screen.getByText('Rui')).toBeTruthy();
  });

  it('abre as últimas páginas do utilizador', async () => {
    listarResumo.mockResolvedValue(dados);
    const ev: EventoAtividade[] = [
      { id: 2, email: 'ana@x.pt', tipo: 'pagina', pagina: '/stock', created_at: iso(5) },
      { id: 1, email: 'ana@x.pt', tipo: 'sessao', pagina: '/', created_at: iso(6) },
    ];
    listarEventos.mockResolvedValue(ev);
    render(<MemoryRouter><LogsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Ana'));
    expect(await screen.findByText('Início de sessão')).toBeTruthy();
    expect(screen.getByText('Stock')).toBeTruthy();
    expect(listarEventos).toHaveBeenCalledWith('ana@x.pt');
  });

  it('migração por aplicar: mostra a mensagem, não rebenta', async () => {
    listarResumo.mockRejectedValue(new Error('Os logs ainda não estão disponíveis'));
    render(<MemoryRouter><LogsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/ainda não estão disponíveis/)).toBeTruthy());
  });
});

describe('ActivityTracker', () => {
  function Ir() { const nav = useNavigate(); return <button onClick={() => nav('/stock')}>ir</button>; }

  it('regista a sessão uma vez e cada página aberta, sem repetir a mesma', async () => {
    render(<MemoryRouter initialEntries={['/funil']}><ActivityTracker /><Ir /></MemoryRouter>);
    await waitFor(() => expect(registarAtividade).toHaveBeenCalledWith('pagina', '/funil'));
    expect(registarAtividade).toHaveBeenCalledWith('sessao', '/funil');
    fireEvent.click(screen.getByText('ir'));
    await waitFor(() => expect(registarAtividade).toHaveBeenCalledWith('pagina', '/stock'));
    expect(registarAtividade.mock.calls.filter(c => c[0] === 'sessao')).toHaveLength(1);
    expect(registarAtividade).toHaveBeenCalledTimes(3);
  });
});

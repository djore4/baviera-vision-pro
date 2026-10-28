import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Sugestao } from '@/lib/sugestoes';

const criarSugestao = vi.fn(async () => {});
const listarSugestoes = vi.fn();
const atualizarSugestao = vi.fn(async () => {});
const eliminarSugestao = vi.fn(async () => {});
vi.mock('@/lib/sugestoes', async orig => ({
  ...(await orig<typeof import('@/lib/sugestoes')>()),
  criarSugestao: (...a: unknown[]) => criarSugestao(...(a as [])),
  listarSugestoes: () => listarSugestoes(),
  atualizarSugestao: (...a: unknown[]) => atualizarSugestao(...(a as [])),
  eliminarSugestao: (...a: unknown[]) => eliminarSugestao(...(a as [])),
}));
let EDIT = true;
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit: () => EDIT }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { SugestaoDialog } from '@/components/SugestaoDialog';
import SugestoesPage from '@/pages/SugestoesPage';
import { estadoDef, tipoDef } from '@/lib/sugestoes';

const mk = (id: string, over: Partial<Sugestao> = {}): Sugestao => ({
  id, tipo: 'ideia', titulo: `Sugestão ${id}`, descricao: `Detalhes ${id}`, pagina: '/funil', estado: 'nova', resposta: null,
  autor_email: 'ana@x.pt', autor_nome: 'Ana', created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z', ...over,
});

beforeEach(() => { vi.clearAllMocks(); EDIT = true; });

describe('SugestaoDialog', () => {
  it('envia tipo, título, detalhes e a página em que estava', async () => {
    const onSent = vi.fn();
    render(
      <MemoryRouter initialEntries={['/funil']}>
        <SugestaoDialog open onOpenChange={() => {}} onSent={onSent} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Funil')).toBeTruthy(); // etiqueta da página
    const enviar = screen.getByRole('button', { name: /Enviar/ }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true); // sem título
    fireEvent.click(screen.getByRole('radio', { name: /Problema/ }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: '  Exportar para Excel ' } });
    fireEvent.change(screen.getByLabelText(/Detalhes/), { target: { value: 'Em todas as tabelas' } });
    fireEvent.click(enviar);
    await waitFor(() => expect(criarSugestao).toHaveBeenCalledWith({
      tipo: 'problema', titulo: '  Exportar para Excel ', descricao: 'Em todas as tabelas', pagina: '/funil',
    }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });
});

describe('Página Sugestões (gestão)', () => {
  const dados = [
    mk('1'), mk('2', { tipo: 'problema', estado: 'em_analise', autor_nome: null, autor_email: 'rui@x.pt' }),
    mk('3', { estado: 'feita', resposta: 'Já está' }),
  ];

  it('por defeito mostra as por tratar; os filtros por estado e pesquisa funcionam', async () => {
    listarSugestoes.mockResolvedValue(dados);
    render(<MemoryRouter><SugestoesPage /></MemoryRouter>);
    expect(await screen.findByText('Sugestão 1')).toBeTruthy();
    expect(screen.getByText('Sugestão 2')).toBeTruthy();
    expect(screen.queryByText('Sugestão 3')).toBeNull(); // feita: fora de "por tratar"
    fireEvent.click(screen.getByRole('button', { name: /^Feita/ }));
    expect(screen.getByText('Sugestão 3')).toBeTruthy();
    expect(screen.queryByText('Sugestão 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Todas/ }));
    fireEvent.change(screen.getByPlaceholderText(/Pesquisar/), { target: { value: 'rui@x' } });
    expect(screen.getByText('Sugestão 2')).toBeTruthy();
    expect(screen.queryByText('Sugestão 1')).toBeNull();
  });

  it('responde e muda o estado', async () => {
    listarSugestoes.mockResolvedValue(dados);
    render(<MemoryRouter><SugestoesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Sugestão 1'));
    const guardar = screen.getByRole('button', { name: /Guardar/ }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true); // nada alterado
    fireEvent.change(screen.getByLabelText('Resposta ao autor'), { target: { value: ' Entra em dezembro ' } });
    fireEvent.click(guardar);
    await waitFor(() => expect(atualizarSugestao).toHaveBeenCalledWith('1', { estado: 'nova', resposta: 'Entra em dezembro' }));
  });

  it('só com consulta não há como alterar nem apagar', async () => {
    EDIT = false;
    listarSugestoes.mockResolvedValue(dados);
    render(<MemoryRouter><SugestoesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Sugestão 1'));
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).toBeNull();
    expect((screen.getByLabelText('Resposta ao autor') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('elimina com confirmação', async () => {
    listarSugestoes.mockResolvedValue(dados);
    render(<MemoryRouter><SugestoesPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Sugestão 1'));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/ }));
    expect(eliminarSugestao).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /^Eliminar$/ }));
    await waitFor(() => expect(eliminarSugestao).toHaveBeenCalledWith('1'));
  });

  it('mostra o erro (ex.: tabela por criar)', async () => {
    listarSugestoes.mockRejectedValue(new Error('As sugestões ainda não estão disponíveis'));
    render(<MemoryRouter><SugestoesPage /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toContain('ainda não estão disponíveis');
  });
});

describe('Definições dos estados', () => {
  it('tipos e estados desconhecidos caem num valor por omissão', () => {
    expect(tipoDef('xyz').value).toBe('ideia');
    expect(estadoDef('xyz').value).toBe('nova');
    expect(estadoDef('em_analise').label).toBe('Em análise');
  });
});

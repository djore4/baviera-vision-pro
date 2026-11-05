import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const invoke = vi.fn();
const refresh = vi.fn(async () => {});
let ADMIN = true;
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ refresh }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ isAdmin: ADMIN }) }));
let MS: unknown = null;
const obterTokenMs = vi.fn(async () => 'tok');
vi.mock('@/lib/ms-auth', () => ({ getMsConfig: () => MS, obterTokenMs: () => obterTokenMs() }));
const lerCaixa = vi.fn();
const gravarAlteracoes = vi.fn();
vi.mock('@/lib/email-sync-browser', () => ({
  lerCaixa: (...a: unknown[]) => lerCaixa(...a),
  paraRegistosVN: () => [],
  planear: () => ({
    alteracoes: [{ id: '1', mat: 'AA-26-BB' }],
    previa: { mensagens: 4, pedidas: 0, matriculas: 1, chassis: 0, datas: 0, totalIgnoradas: 0, ignoradas: [], detalhes: [{ id: '1', enc: '9710001', cliente: 'Cliente Um', campos: [{ campo: 'Matrícula', de: '—', para: 'AA-26-BB' }] }] },
  }),
  gravarAlteracoes: (...a: unknown[]) => gravarAlteracoes(...a),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SincronizarMatriculasButton, { resumoSync } from '@/components/SincronizarMatriculasButton';
import { toast } from 'sonner';

beforeEach(() => { invoke.mockReset(); refresh.mockClear(); ADMIN = true; MS = null; obterTokenMs.mockClear(); lerCaixa.mockReset(); gravarAlteracoes.mockReset(); });

describe('Sincronizar matrículas', () => {
  it('só o administrador vê o botão', () => {
    ADMIN = false;
    const { container } = render(<SincronizarMatriculasButton />);
    expect(container.textContent).toBe('');
  });

  const detalhe = { id: '1', enc: '9710001', cliente: 'Cliente Um', campos: [{ campo: 'Matrícula', de: '—', para: 'AA-26-BB' }, { campo: 'DMAT', de: '—', para: '02/11/2026' }] };

  it('mostra primeiro o que muda e só grava depois de confirmar', async () => {
    invoke
      .mockResolvedValueOnce({ data: { simulado: true, mensagens: 12, pedidas: 0, matriculas: 1, datas: 1, totalIgnoradas: 1, ignoradas: [{ assunto: 'Matriculas - Aveiro · 9710002 (CC-20-DD)', motivo: 'negócio não encontrado' }], detalhes: [detalhe] }, error: null })
      .mockResolvedValueOnce({ data: { mensagens: 12, pedidas: 0, matriculas: 1, datas: 1, totalIgnoradas: 1, ignoradas: [], detalhes: [detalhe] }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await screen.findByText('Sincronizar com o email');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenLastCalledWith('sync-matriculas', { body: { dias: 30, simular: true } });
    expect(screen.getByText('9710001')).toBeInTheDocument();
    expect(screen.getByText(/negócio não encontrado/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Gravar 1 alteração/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(invoke).toHaveBeenLastCalledWith('sync-matriculas', { body: { dias: 30 } });
    // Popup final a dizer o que foi importado.
    await screen.findByText('Dados importados');
    expect(screen.getByText(/1 matrícula preenchida/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByText('Dados importados')).toBeNull());
  });

  it('função não publicada (404): mensagem clara', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Requested function was not found'), { context: { status: 404, json: async () => ({}) } }) });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível sincronizar', { description: expect.stringMatching(/ainda não está publicada/) }));
  });

  it('cancelar não grava', async () => {
    invoke.mockResolvedValue({ data: { simulado: true, mensagens: 3, pedidas: 0, matriculas: 1, totalIgnoradas: 0, ignoradas: [], detalhes: [detalhe] }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await screen.findByText('Sincronizar com o email');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sem nada a mudar nem por tratar, avisa e não abre o diálogo', async () => {
    invoke.mockResolvedValue({ data: { simulado: true, mensagens: 5, pedidas: 0, matriculas: 0, totalIgnoradas: 0, ignoradas: [], detalhes: [] }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Tudo em dia', expect.anything()));
    expect(screen.queryByText('Sincronizar com o email')).toBeNull();
  });

  it('mostra o erro (ex.: não configurado) sem recarregar', async () => {
    invoke.mockResolvedValue({ data: { error: 'Sincronização não configurada' }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it('resumoSync faz o plural certo', () => {
    expect(resumoSync({ pedidas: 1, matriculas: 1, totalIgnoradas: 0, mensagens: 3 })).toBe('1 pedido confirmado · 1 matrícula preenchida (3 emails lidos).');
    expect(resumoSync({ pedidas: 2, matriculas: 0, totalIgnoradas: 4, mensagens: 9 })).toMatch(/2 pedidos confirmados · 0 matrículas preenchidas · 4 por tratar/);
    expect(resumoSync({ pedidas: 0, matriculas: 1, chassis: 2, datas: 1, totalIgnoradas: 0, mensagens: 4 })).toBe('0 pedidos confirmados · 1 matrícula preenchida · 2 chassis completos · 1 DMAT atualizada (4 emails lidos).');
  });
});

describe('Sincronizar com a Microsoft (email de quem está a usar)', () => {
  beforeEach(() => { MS = { clientId: 'c', tenantId: 't' }; lerCaixa.mockResolvedValue({ mensagens: [], diarios: [] }); });

  it('lê o email no browser (sem passar pela função), mostra o que muda e grava só depois de confirmar', async () => {
    gravarAlteracoes.mockResolvedValue({ aplicadas: 1, falhadas: [] });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await screen.findByText('Sincronizar com o email');
    expect(obterTokenMs).toHaveBeenCalled();
    expect(lerCaixa).toHaveBeenCalledWith('tok', 30, expect.any(Array));
    expect(invoke).not.toHaveBeenCalled();
    expect(gravarAlteracoes).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Gravar 1 alteração/ }));
    await screen.findByText('Dados importados');
    expect(gravarAlteracoes).toHaveBeenCalledWith([{ id: '1', mat: 'AA-26-BB' }]);
    expect(refresh).toHaveBeenCalled();
  });

  it('se o início de sessão falhar mostra a razão e não lê nem grava nada', async () => {
    obterTokenMs.mockRejectedValueOnce(new Error('O browser bloqueou a janela da Microsoft'));
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível sincronizar', { description: expect.stringMatching(/bloqueou/) }));
    expect(lerCaixa).not.toHaveBeenCalled();
  });

  it('sem ligação Microsoft e sem segredos no servidor, explica a alternativa', async () => {
    MS = null;
    invoke.mockResolvedValue({ data: { error: 'Sincronização não configurada: faltam os segredos' }, error: null });
    render(<SincronizarMatriculasButton />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível sincronizar', { description: expect.stringMatching(/Client ID e o Tenant ID/) }));
  });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

let perms: Record<string, boolean> = {};
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ canEdit: (t: string) => !!perms[t] }),
}));
const openNew = vi.fn();
const openEditor = vi.fn();
vi.mock('@/components/RecordEditor', () => ({
  useRecordEditor: () => ({ openNew, openEditor, deleteRecord: vi.fn() }),
}));
vi.mock('@/contexts/DataContext', () => ({
  useData: () => ({ data: { control: [
    { id: 'a', status: 'Frio', resp: 'JL', version: 'V1', cliente: 'Meu', obs: '' },
    { id: 'b', status: 'Quente', resp: 'AB', version: 'V2', cliente: 'Alheio', obs: '' },
  ] } }),
}));

import FunilPage from '@/pages/FunilPage';
import { getMinhasIniciais, negocioMeu } from '@/lib/funil-escopo';

beforeEach(() => { rpc.mockReset(); openNew.mockReset(); openEditor.mockReset(); perms = {}; });

describe('funil-escopo', () => {
  it('getMinhasIniciais normaliza e tolera erro (sem migração: nenhuma)', async () => {
    rpc.mockResolvedValueOnce({ data: [' jl ', ''], error: null });
    expect(await getMinhasIniciais()).toEqual(['JL']);
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
    expect(await getMinhasIniciais()).toEqual([]);
  });
  it('negocioMeu ignora maiúsculas e espaços', () => {
    expect(negocioMeu(' jl', ['JL'])).toBe(true);
    expect(negocioMeu('AB', ['JL'])).toBe(false);
    expect(negocioMeu(null, ['JL'])).toBe(false);
  });
});

describe('FunilPage — vendedor com funil em edição', () => {
  it('cria, edita e elimina só o que é seu', async () => {
    perms = { funil: true };
    rpc.mockResolvedValue({ data: ['JL'], error: null });
    render(<FunilPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Novo negócio/ })).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(1);
    fireEvent.click(screen.getByText('Alheio'));
    expect(openEditor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Meu'));
    expect(openEditor).toHaveBeenCalledWith('a');
    // Filtrar por um colega não deixa criar negócios em nome dele.
    fireEvent.click(screen.getByRole('button', { name: 'AB' }));
    fireEvent.click(screen.getByRole('button', { name: /Novo negócio/ }));
    expect(openNew).toHaveBeenLastCalledWith({ status: 'Frio', type: 'VN', resp: 'JL' });
  });

  it('sem iniciais identificadas (ou só consulta): fica só de leitura', async () => {
    perms = { funil: true };
    rpc.mockResolvedValue({ data: [], error: null });
    render(<FunilPage />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Novo negócio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });

  it('quem edita Dados continua a escrever tudo', () => {
    perms = { dados: true };
    render(<FunilPage />);
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/* Gestão dos negócios VU na plataforma: editor (criar/editar/eliminar), Funil VU e WIP VU. */

const insert = vi.fn();
const update = vi.fn();
const del = vi.fn();
let rows: Record<string, unknown>[] = [];
let canEditDados = true;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => Object.assign(Promise.resolve({ data: rows, error: null }), {
        eq: (_c: string, id: string) => ({ single: () => Promise.resolve({ data: rows.find(r => r.id === id) ?? null, error: null }) }),
      }),
      insert: (...a: unknown[]) => insert(...a),
      update: (...a: unknown[]) => ({ eq: (...b: unknown[]) => update(...a, ...b) }),
      delete: () => ({ eq: (...a: unknown[]) => del(...a) }),
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ canEdit: (t: string) => canEditDados && t === 'dados' }),
}));
// O RecordEditor VN (importado pelo editor VU para os campos partilhados) usa o DataContext.
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ refresh: vi.fn(async () => {}), data: null }) }));

import { VuRecordEditorProvider, useVuRecordEditor } from '@/components/VuRecordEditor';
import FunilVuPage from '@/pages/FunilVuPage';
import WipPage from '@/pages/WipPage';

// recharts (WIP) precisa de ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const funilRow = { id: 'a', status: 'FRIO', resp: 'JD', cliente: 'Maria', model: 'X1', version: 'sDrive', type: 'VU', ret: 0, a360: 0, recond: 0 };
const wipRow = { id: 'b', status: 'CARTEIRA', resp: 'AL', cliente: 'Rui', model: 'Série 3', version: '320d', type: 'VU', ret: 0, a360: 0, recond: 0 };

beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  update.mockReset().mockResolvedValue({ error: null });
  del.mockReset().mockResolvedValue({ error: null });
  rows = []; canEditDados = true;
});

function Opener() {
  const { openNew, openEditor } = useVuRecordEditor();
  return (
    <>
      <button onClick={() => openNew({ status: 'FRIO', type: 'VU' })}>novo</button>
      <button onClick={() => openEditor('a')}>editar</button>
    </>
  );
}

describe('Editor de negócios VU', () => {
  it('cria um negócio com os valores normalizados', async () => {
    render(<VuRecordEditorProvider><Opener /></VuRecordEditorProvider>);
    fireEvent.click(screen.getByText('novo'));
    fireEvent.change(screen.getByLabelText('CLIENTE'), { target: { value: ' Ana ' } });
    fireEvent.change(screen.getByLabelText('MAT — Matrícula'), { target: { value: 'aa-11-bb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ status: 'FRIO', type: 'VU', cliente: 'Ana', mat: 'AA-11-BB' });
  });

  it('não grava sem estado', async () => {
    render(<VuRecordEditorProvider><Opener /></VuRecordEditorProvider>);
    fireEvent.click(screen.getByText('novo'));
    fireEvent.change(screen.getByLabelText('STATUS'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await new Promise(r => setTimeout(r, 20));
    expect(insert).not.toHaveBeenCalled();
  });

  it('passar a Fatura preenche DFAT e grava', async () => {
    render(<VuRecordEditorProvider><Opener /></VuRecordEditorProvider>);
    fireEvent.click(screen.getByText('novo'));
    fireEvent.change(screen.getByLabelText('STATUS'), { target: { value: 'FATURA' } });
    expect((screen.getByLabelText('DFAT — Data da fatura') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ status: 'FATURA' });
    expect(insert.mock.calls[0][0].dfat).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('edita um negócio existente e elimina-o depois de confirmar', async () => {
    rows = [{ ...funilRow }];
    render(<VuRecordEditorProvider><Opener /></VuRecordEditorProvider>);
    fireEvent.click(screen.getByText('editar'));
    await waitFor(() => expect(screen.getByLabelText('CLIENTE')).toHaveValue('Maria'));
    fireEvent.change(screen.getByLabelText('CLIENTE'), { target: { value: 'Maria Silva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0]).toMatchObject({ cliente: 'Maria Silva', status: 'FRIO' });
    expect(update.mock.calls[0][1]).toBe('id');

    fireEvent.click(screen.getByText('editar'));
    await waitFor(() => expect(screen.getByLabelText('CLIENTE')).toHaveValue('Maria'));
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/ }));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, eliminar' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('id', 'a'));
  });
});

describe('Funil VU', () => {
  it('com edição em Dados mostra "Novo negócio" e abre o editor como Frio', async () => {
    rows = [funilRow];
    render(<VuRecordEditorProvider><FunilVuPage /></VuRecordEditorProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /Novo negócio/ }));
    expect(screen.getByLabelText('STATUS')).toHaveValue('FRIO');
    expect(screen.getByRole('dialog', { name: 'Novo negócio VU' })).toBeInTheDocument();
  });

  it('sem permissão não há botões de gestão', async () => {
    canEditDados = false; rows = [funilRow];
    render(<VuRecordEditorProvider><FunilVuPage /></VuRecordEditorProvider>);
    await screen.findByText('Maria');
    expect(screen.queryByRole('button', { name: /Novo negócio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });
});

describe('WIP VU', () => {
  it('sem registos oferece adicionar o primeiro negócio (se houver permissão)', async () => {
    render(<VuRecordEditorProvider><WipPage /></VuRecordEditorProvider>);
    fireEvent.click(await screen.findByRole('button', { name: /Novo negócio/ }));
    expect(screen.getByLabelText('STATUS')).toHaveValue('CARTEIRA');
    expect(screen.getByLabelText('DT FECHO — Data de fecho')).not.toHaveValue('');
  });

  it('sem permissão não mostra o botão nem refere o Excel', async () => {
    canEditDados = false;
    render(<VuRecordEditorProvider><WipPage /></VuRecordEditorProvider>);
    await screen.findByText(/Ainda não há faturas nem carteira VU/);
    expect(screen.queryByRole('button', { name: /Novo negócio/ })).toBeNull();
    expect(screen.queryByText(/ficheiro/i)).toBeNull();
  });

  it('com registos: eliminar pela tabela chama a base de dados; clicar na linha abre o editor', async () => {
    rows = [{ ...wipRow, dfat: null }];
    render(<VuRecordEditorProvider><WipPage /></VuRecordEditorProvider>);
    const celula = await screen.findByText('Rui');
    fireEvent.click(celula);
    expect(await screen.findByRole('dialog', { name: 'Editar negócio VU' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('id', 'b'));
  });
});

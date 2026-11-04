import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/* openNew(preset, onCreated): o callback só dispara quando um negócio NOVO é mesmo gravado. */

const insert = vi.fn();
const update = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (...a: unknown[]) => insert(...a),
      update: (...a: unknown[]) => ({ eq: () => update(...a) }),
    }),
  },
}));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ refresh: vi.fn(async () => {}), data: null }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { RecordEditorProvider, useRecordEditor } from '@/components/RecordEditor';

const onCreated = vi.fn();

function Opener() {
  const { openNew } = useRecordEditor();
  return (
    <>
      <button onClick={() => openNew({ status: 'Quente', type: 'VN', id_cliente: 'Maria Silva', obs: 'Origem: Campanha i3' }, onCreated)}>com callback</button>
      <button onClick={() => openNew({ status: 'Frio' })}>sem callback</button>
    </>
  );
}

beforeEach(() => { insert.mockReset(); update.mockReset(); onCreated.mockReset(); });

describe('Editor de registos — negócio novo a partir de outro sítio', () => {
  it('abre preenchido e grava o negócio Quente com os valores do preset', async () => {
    insert.mockResolvedValue({ error: null });
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('com callback'));
    expect(screen.getByText('ID — Cliente').parentElement!.querySelector('input')).toHaveValue('Maria Silva');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ status: 'Quente', type: 'VN', id_cliente: 'Maria Silva', obs: 'Origem: Campanha i3' });
  });

  it('o callback dispara depois de gravar, uma só vez', async () => {
    insert.mockResolvedValue({ error: null });
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('com callback'));
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('se a gravação falha (p.ex. sem permissão), o callback não dispara', async () => {
    insert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('com callback'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 20));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('um editor aberto depois, sem callback, não herda o anterior', async () => {
    insert.mockResolvedValue({ error: null });
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('com callback'));
    fireEvent.click(screen.getByText('Novo Registo').parentElement!.querySelector('button')!); // fecha sem gravar (X)
    expect(screen.queryByText('Novo Registo')).toBeNull();

    fireEvent.click(screen.getByText('sem callback'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 20));
    expect(onCreated).not.toHaveBeenCalled();
  });
});

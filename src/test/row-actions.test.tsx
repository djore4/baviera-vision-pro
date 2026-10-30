import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RowDeleteButton } from '@/components/RowDeleteButton';
import { FunilBoard, type FunilRow } from '@/components/funil/FunilBoard';

describe('RowDeleteButton', () => {
  it('só elimina depois da confirmação', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(<RowDeleteButton onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('"Não" cancela sem eliminar', () => {
    const onDelete = vi.fn();
    render(<RowDeleteButton onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });

  it('não propaga o clique à linha (não abre o editor)', () => {
    const onRow = vi.fn();
    render(<div onClick={onRow}><RowDeleteButton onDelete={vi.fn()} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(onRow).not.toHaveBeenCalled();
  });
});

describe('Funil — novo e eliminar', () => {
  const rows: FunilRow[] = [
    { id: 'a', status: 'Frio', resp: 'JD', version: '520d', cliente: 'C1', obs: '' },
    { id: 'b', status: 'Quente', resp: 'AL', version: 'X1', cliente: 'C2', obs: '' },
  ];

  it('"Novo negócio" passa o responsável filtrado', () => {
    const onNew = vi.fn();
    render(<FunilBoard records={rows} onNew={onNew} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo negócio/ }));
    expect(onNew).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'AL' }));
    fireEvent.click(screen.getByRole('button', { name: /Novo negócio/ }));
    expect(onNew).toHaveBeenLastCalledWith('AL');
  });

  it('eliminar uma linha chama onDelete com o id certo', async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    render(<FunilBoard records={rows} onDelete={onDelete} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('b'));
  });

  it('sem permissões não há botões', () => {
    render(<FunilBoard records={rows} />);
    expect(screen.queryByRole('button', { name: /Novo negócio/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull();
  });
});

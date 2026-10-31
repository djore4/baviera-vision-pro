import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GarantiaFilter, TriStateFilter, RetomaFilter } from '@/components/RetomaFilter';

describe('filtros segmentados', () => {
  it('Garantia: Todos / GAR / nGAR e marca o ativo', () => {
    const onChange = vi.fn();
    render(<GarantiaFilter value="GAR" onChange={onChange} />);
    expect(screen.getByText('Garantia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GAR' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'nGAR' }));
    expect(onChange).toHaveBeenLastCalledWith('nGAR');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('BEV/QoR/M: Todos = null, Sim = true, Não = false', () => {
    const onChange = vi.fn();
    render(<TriStateFilter label="BEV" value={null} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('Retoma mantém os rótulos Com / Sem', () => {
    const onChange = vi.fn();
    render(<RetomaFilter value={false} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Sem' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Com' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});

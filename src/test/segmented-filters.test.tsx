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

import { TipoFilter } from '@/components/RetomaFilter';

describe('TipoFilter', () => {
  it('multi-seleção de VN, VD, RMK e VP', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TipoFilter value={new Set()} onChange={onChange} />);
    ['VN', 'VD', 'RMK', 'VP'].forEach(t => expect(screen.getByRole('button', { name: t })).toHaveAttribute('aria-pressed', 'false'));
    fireEvent.click(screen.getByRole('button', { name: 'RMK' }));
    expect(Array.from(onChange.mock.calls[0][0])).toEqual(['RMK']);
    rerender(<TipoFilter value={new Set(['RMK', 'VP'])} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'VP' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'RMK' }));
    expect(Array.from(onChange.mock.calls[1][0])).toEqual(['VP']);
  });
});

import { FlagsFilter } from '@/components/RetomaFilter';

describe('FlagsFilter (BEV / QoR / M)', () => {
  it('uma linha: ligar mostra só os que têm a característica; desligar remove o filtro', () => {
    const bev = vi.fn(), qor = vi.fn(), m = vi.fn();
    const { rerender } = render(<FlagsFilter flags={[
      { label: 'BEV', value: null, onChange: bev }, { label: 'QoR', value: null, onChange: qor }, { label: 'M', value: null, onChange: m },
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: 'BEV' }));
    expect(bev).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Não' })).toBeNull();
    rerender(<FlagsFilter flags={[
      { label: 'BEV', value: true, onChange: bev }, { label: 'QoR', value: null, onChange: qor }, { label: 'M', value: null, onChange: m },
    ]} />);
    expect(screen.getByRole('button', { name: 'BEV' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'BEV' }));
    expect(bev).toHaveBeenLastCalledWith(null);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GarantiaFilter, TriStateFilter, RetomaFilter, FlagsFilter } from '@/components/RetomaFilter';

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
  it('Todos + VN / VD / RMK / VP, uma escolha de cada vez', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TipoFilter value={new Set()} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'RMK' }));
    expect(Array.from(onChange.mock.calls[0][0])).toEqual(['RMK']);
    rerender(<TipoFilter value={new Set(['RMK'])} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'RMK' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(onChange.mock.calls[1][0].size).toBe(0);
  });
});

describe('FlagsFilter (BEV / QoR / M)', () => {
  const mk = (b: boolean | null, q: boolean | null, m: boolean | null, fns = { b: vi.fn(), q: vi.fn(), m: vi.fn() }) => ({
    fns,
    el: <FlagsFilter flags={[
      { label: 'BEV', value: b, onChange: fns.b }, { label: 'QoR', value: q, onChange: fns.q }, { label: 'M', value: m, onChange: fns.m },
    ]} />,
  });

  it('mesma lógica dos outros: Todos explícito e uma escolha de cada vez', () => {
    const { fns, el } = mk(null, null, null);
    render(el);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'QoR' }));
    expect(fns.q).toHaveBeenLastCalledWith(true);
    expect(fns.b).toHaveBeenLastCalledWith(null);
    expect(fns.m).toHaveBeenLastCalledWith(null);
  });

  it('Todos limpa as três características', () => {
    const { fns, el } = mk(true, null, null);
    render(el);
    expect(screen.getByRole('button', { name: 'BEV' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect([fns.b, fns.q, fns.m].map(f => f.mock.lastCall![0])).toEqual([null, null, null]);
  });

  it('com mais de uma ativa (via cartões) nenhum segmento fica marcado', () => {
    const { el } = mk(true, true, null);
    render(el);
    ['Todos', 'BEV', 'QoR', 'M'].forEach(n => expect(screen.getByRole('button', { name: n })).toHaveAttribute('aria-pressed', 'false'));
  });
});

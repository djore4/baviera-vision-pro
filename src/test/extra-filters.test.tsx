import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtraFilters, ExtraFilterChips, hasExtraFilters, isParked, type ExtraFiltersState } from '@/components/ExtraFilters';

const state = (over: Partial<ExtraFiltersState> = {}): ExtraFiltersState => ({
  ret: null, setRet: vi.fn(), gar: null, setGar: vi.fn(), types: new Set(), setTypes: vi.fn(),
  bev: null, setBev: vi.fn(), qor: null, setQor: vi.fn(), m: null, setM: vi.fn(), park: false, setPark: vi.fn(), ...over,
});

describe('isParked', () => {
  it('semana com P e ainda não entregue', () => {
    expect(isParked({ week198: '12P', status: 'Carteira' })).toBe(true);
    expect(isParked({ week198: '12p', status: 'Matricula' })).toBe(true);
    expect(isParked({ week198: '12P', status: 'Retail' })).toBe(false);
    expect(isParked({ week198: '12', status: 'Carteira' })).toBe(false);
  });
});

describe('ExtraFilters (WIP, Produção, Carteira)', () => {
  it('mostra Em Parque, Retoma, Tipo, Garantia e Características e liga cada setter', () => {
    const s = state();
    render(<ExtraFilters s={s} parkCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: /Em Parque/ }));
    expect(s.setPark).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Com' }));
    expect(s.setRet).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'RMK' }));
    expect(Array.from((s.setTypes as ReturnType<typeof vi.fn>).mock.calls[0][0])).toEqual(['RMK']);
    fireEvent.click(screen.getByRole('button', { name: 'nGAR' }));
    expect(s.setGar).toHaveBeenLastCalledWith('nGAR');
    fireEvent.click(screen.getByRole('button', { name: 'BEV' }));
    expect(s.setBev).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'QoR' }));
    expect(s.setQor).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'M' }));
    expect(s.setM).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('o layout em barra funciona igual', () => {
    render(<ExtraFilters s={state()} parkCount={0} layout="bar" />);
    ['Tipo', 'Garantia', 'Características', 'Retoma'].forEach(t => expect(screen.getByText(t)).toBeInTheDocument());
  });

  it('chips de filtros ativos limpam o respetivo filtro', () => {
    const s = state({ gar: 'GAR', types: new Set(['VP']), m: true, park: true });
    expect(hasExtraFilters(s)).toBe(true);
    expect(hasExtraFilters(state())).toBe(false);
    render(<ExtraFilterChips s={s} />);
    fireEvent.click(screen.getByText('Garantia: GAR x'));
    expect(s.setGar).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByText('Tipo: VP x'));
    expect((s.setTypes as ReturnType<typeof vi.fn>).mock.calls[0][0].size).toBe(0);
    fireEvent.click(screen.getByText('M x'));
    expect(s.setM).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByText('Parque x'));
    expect(s.setPark).toHaveBeenCalledWith(false);
  });
});

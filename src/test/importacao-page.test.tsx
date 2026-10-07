import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImportacaoPage from '@/pages/ImportacaoPage';

const campo = (label: RegExp) => screen.getByText(label).closest('label')!.querySelector('input,select') as HTMLInputElement;

describe('ImportacaoPage', () => {
  it('mostra o aviso de tabelas por validar', () => {
    render(<ImportacaoPage />);
    expect(screen.getByRole('alert').textContent).toMatch(/por validar/);
  });

  it('com ISV manual: calcula custo, PVP sugerido e rentabilidade ao PVP de mercado', () => {
    render(<ImportacaoPage />);
    fireEvent.change(campo(/^Preço de compra/), { target: { value: '10000' } });
    fireEvent.change(campo(/^Transporte da viatura/), { target: { value: '500' } });
    fireEvent.change(campo(/^ISV total à mão/), { target: { value: '1500' } });

    // Custo total = 10000 + 500 + 1500 = 12 000
    expect(screen.getByText('Custo total').parentElement!.textContent).toMatch(/12\s000,00/);

    // 10 % de margem em regime de margem → PVP sugerido = 12 000×1,1×1,23 − 10 000×0,23 = 13 936,00
    expect(screen.getByText(/PVP para 10,0 % de margem/).previousElementSibling!.textContent).toMatch(/13\s936,00/);

    fireEvent.change(campo(/^PVP de mercado/), { target: { value: '14000' } });
    expect(screen.getByText('Rentabilidade ao PVP de mercado')).toBeTruthy();
  });

  it('sem custo não mostra preço de venda', () => {
    render(<ImportacaoPage />);
    expect(screen.getByText(/Introduz o preço de compra/)).toBeTruthy();
  });

  it('elétrico: isento de ISV', () => {
    render(<ImportacaoPage />);
    fireEvent.change(campo(/^Propulsão/), { target: { value: 'eletrico' } });
    expect(screen.getByText(/isento de ISV/)).toBeTruthy();
  });
});

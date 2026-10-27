import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/produto', async orig => ({
  ...(await orig<typeof import('@/lib/produto')>()),
  listModelos: vi.fn(async () => [{ id: 'x5', codigo: 'G05', nome: 'BMW X5' }]),
  listMotorizacoes: vi.fn(async () => [
    { id: 'm1', codigo: 'A', nome_visual: 'xDrive40d' },
    { id: 'm2', codigo: 'B', nome_visual: 'xDrive50e' },
  ]),
  getSpecs: vi.fn(async (id: string) => (id === 'm1' ? { Potência: '250', Lugares: '5', 'Potência combinada comunicada, cv': '250' } : { Potência: '490', Lugares: '5', 'Potência combinada comunicada, cv': '490' })),
  listOpModelos: vi.fn(async () => [{ id: 'x5', codigo: 'G05', nome: 'BMW X5' }]),
  listOpMotorizacoes: vi.fn(async () => [{ id: 'o1', nome: 'xDrive40d' }]),
  listOpcionais: vi.fn(async () => [
    { id: 'p1', codigo: '337', nome: 'Pack M', preco_iva: 1500, preco_siva: 1219.5, descricao: 'Desportivo', regras: null, secao: '2 Exterior', tipo: 'opcional' },
    { id: 'p2', codigo: '4FL', nome: 'Pneus', preco_iva: 0, preco_siva: 0, descricao: null, regras: null, secao: '1 Rodas', tipo: 'serie' },
  ]),
  listDisponibilidade: vi.fn(async () => [{ tipo: 'opcional', motorizacao: 'xDrive40d' }]),
}));

import ProdutoPage from '@/pages/ProdutoPage';

// O Slider (Radix) mede-se com ResizeObserver, que o jsdom não tem.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

describe('Página Produto', () => {
  it('Dados Técnicos: série → modelo → motorizações, e destaca as diferenças', async () => {
    render(<ProdutoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'X' }));
    fireEvent.click(await screen.findByRole('button', { name: 'BMW X5' }));
    fireEvent.click(await screen.findByRole('button', { name: 'xDrive40d' }));
    fireEvent.click(await screen.findByRole('button', { name: 'xDrive50e' }));

    const pot = (await screen.findByText('Potência')).closest('tr')!;
    await waitFor(() => expect(pot.querySelectorAll('td')[2].textContent).toBe('490'));
    expect(pot.querySelectorAll('td')[1].className).toContain('text-primary');
    const lug = screen.getByText('Lugares').closest('tr')!;
    expect(lug.querySelectorAll('td')[1].className).not.toContain('text-primary');
  });

  it('Opcionais: lista por secção e abre o detalhe', async () => {
    render(<ProdutoPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Opcionais' }));
    const x = (await screen.findAllByRole('button', { name: 'X' }));
    fireEvent.click(x[x.length - 1]);
    fireEvent.click((await screen.findAllByRole('button', { name: 'BMW X5' })).pop()!);
    fireEvent.click(await screen.findByRole('button', { name: 'xDrive40d' }));
    expect(await screen.findByText('Pack M')).toBeTruthy();
    expect(screen.getByText('Grátis')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '1 Rodas' }));
    expect(screen.queryByText('Pack M')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));

    fireEvent.click(screen.getByText('Pack M'));
    expect(await screen.findByText('Desportivo')).toBeTruthy();
    expect(screen.getByText('Preço c/ IVA')).toBeTruthy();
  });

  it('Comparador: escolhe duas viaturas e compara', async () => {
    render(<ProdutoPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Comparador' }));
    for (const mot of ['xDrive40d', 'xDrive50e']) {
      fireEvent.click((await screen.findAllByRole('button', { name: /Adicionar viatura/ }))[0]);
      fireEvent.click(await screen.findByRole('button', { name: /BMW X5/ }));
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(mot) }));
      await waitFor(() => expect(screen.getAllByText('Pronto').length).toBeGreaterThan(0));
    }
    const linha = (await screen.findByText('Potência (cv)')).closest('tr')!;
    expect(linha.querySelectorAll('td')[1].textContent).toBe('250');
    expect(linha.querySelectorAll('td')[2].textContent).toBe('490');
    expect(linha.querySelectorAll('td')[1].className).toContain('text-primary');
  });

  it('Calculadora: mostra o tempo com os valores por defeito', () => {
    render(<ProdutoPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Calculadora' }));
    expect(screen.getByTestId('calc-tempo').textContent).toBe('6h 8min');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const extrairFicha = vi.fn();
vi.mock('@/lib/ficha-extrair', async orig => ({
  ...(await orig<typeof import('@/lib/ficha-extrair')>()),
  extrairFicha: (...a: unknown[]) => extrairFicha(...a),
}));
let ADMIN = true;
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ isAdmin: ADMIN }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { FICHA_KEYS, paraFicha, validarFicheiro } from '@/lib/ficha-extrair';
import FichaMargemPage from '@/pages/FichaMargemPage';
import { toast } from 'sonner';

describe('paraFicha', () => {
  it('converte para os inputs e descarta o que não é válido', () => {
    const r = paraFicha({
      docTipo: 'Contrato', docNum: '  C-2026/123 ', natureza: 'VN', modelo: 'iX1 xDrive30', pagamento: 'BMW FS', tipoCliente: 'Empresa',
      pvb: 45000.456, opc: 3200, ivaPct: 23, mgVarPct: 5, precoVenda: 61234.5,
      legTr: -5,                 // negativo: descartado
      isv: Number.NaN,           // inválido: descartado
      pacPct: 450,               // % absurda: descartada
      dataMatricula: '31/12/2025', // formato errado: descartado
      incerto: ['pvb', 'naoExiste', 'bsi'], notas: 'x',
    });
    expect(r.valores).toEqual({
      docTipo: 'Contrato', docNum: 'C-2026/123', natureza: 'VN', modelo: 'iX1 xDrive30', pagamento: 'BMW FS', tipoCliente: 'Empresa',
      pvb: '45000.46', opc: '3200', ivaPct: '23', mgVarPct: '5', precoVenda: '61234.5',
    });
    // só conta como incerto o que foi preenchido e é um campo da ficha
    expect(r.incertos).toEqual(['pvb']);
  });

  it('opções desconhecidas e nulos ficam de fora; matrícula implica viatura usada', () => {
    const r = paraFicha({ pagamento: 'Cheque', tipoCliente: null, matricula: '00-AA-00', dataMatricula: '2024-05-10', natureza: null });
    expect(r.valores).toEqual({ matricula: '00-AA-00', dataMatricula: '2024-05-10', natureza: 'VD' });
  });

  it('o APOIO genérico nunca se preenche, mesmo que a leitura o devolva', () => {
    const r = paraFicha({ pvb: 1000, apoioValor: 500, apoioLabel: 'Apoio X', incerto: ['apoioValor'] } as never);
    expect(r.valores).toEqual({ pvb: '1000' });
    expect(r.incertos).toEqual([]);
  });

  it('valida o ficheiro', () => {
    expect(validarFicheiro({ type: 'application/pdf', size: 1000 })).toBeNull();
    expect(validarFicheiro({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validarFicheiro({ type: 'text/plain', size: 10 })).toMatch(/Formato/);
    expect(validarFicheiro({ type: 'application/pdf', size: 7 * 1024 * 1024 })).toMatch(/grande/);
    expect(validarFicheiro({ type: 'application/pdf', size: 0 })).toMatch(/vazio/);
  });
});

describe('esquema da edge function', () => {
  it('as propriedades da ferramenta são exatamente as chaves da ficha (mais "incerto" e "notas")', () => {
    const src = readFileSync('supabase/functions/ficha-extrair/index.ts', 'utf8');
    const bloco = src.slice(src.indexOf('const SCHEMA'), src.indexOf('required: ["incerto"]'));
    const props = [...bloco.matchAll(/^ {4}(\w+): /gm)].map(m => m[1]);
    expect(props.filter(p => p !== 'incerto' && p !== 'notas').sort()).toEqual([...FICHA_KEYS].sort());
  });

  it('as chaves da ficha existem no estado da página (data-campo)', () => {
    const page = readFileSync('src/pages/FichaMargemPage.tsx', 'utf8');
    for (const k of FICHA_KEYS) expect(page, `falta o setter de ${k}`).toContain(`${k}:`);
  });
});

const ficheiro = () => new File(['%PDF-1.4'], 'contrato.pdf', { type: 'application/pdf' });
const campo = (c: HTMLElement, k: string) => c.querySelector(`[data-campo="${k}"]`) as HTMLInputElement;

describe('Ficha de Margem — carregar contrato', () => {
  beforeEach(() => { vi.clearAllMocks(); ADMIN = true; });

  it('preenche os campos, destaca os lidos e os incertos, e as contas usam os valores', async () => {
    extrairFicha.mockResolvedValue({ docTipo: 'Contrato', docNum: 'C-77', modelo: 'X5', pvb: 50000, opc: 5000, precoVenda: 70000, incerto: ['opc'] });
    const { container } = render(<FichaMargemPage />);
    fireEvent.change(screen.getByTestId('ficha-ficheiro'), { target: { files: [ficheiro()] } });
    await waitFor(() => expect(campo(container, 'pvb').value).toBe('50000'));
    expect(campo(container, 'opc').value).toBe('5000');
    expect(campo(container, 'docNum').value).toBe('C-77');
    expect(campo(container, 'modelo').value).toBe('X5');
    expect(campo(container, 'pvb').className).toContain('ring-emerald-500');   // lido
    expect(campo(container, 'opc').className).toContain('ring-orange-500');    // incerto
    expect(campo(container, 'isv').className).not.toContain('ring-2');          // não tocado
    expect(screen.getByRole('status').textContent).toContain('contrato.pdf');
    expect(screen.getAllByText(/67\D650,00/).length).toBeGreaterThan(0);        // PVP = (PVB+OPC) × 1,23
  });

  it('remover destaques e limpar tiram as marcas', async () => {
    extrairFicha.mockResolvedValue({ pvb: 40000 });
    const { container } = render(<FichaMargemPage />);
    fireEvent.change(screen.getByTestId('ficha-ficheiro'), { target: { files: [ficheiro()] } });
    await waitFor(() => expect(campo(container, 'pvb').className).toContain('ring-emerald-500'));
    fireEvent.click(screen.getByRole('button', { name: /Remover destaques/ }));
    expect(campo(container, 'pvb').className).not.toContain('ring-2');
    expect(campo(container, 'pvb').value).toBe('40000'); // o valor fica
  });

  it('mostra o erro e não altera nada quando a leitura falha ou não traz nada', async () => {
    extrairFicha.mockRejectedValueOnce(new Error('A leitura automática ainda não está configurada (falta a chave da API).'));
    const { container } = render(<FichaMargemPage />);
    fireEvent.change(screen.getByTestId('ficha-ficheiro'), { target: { files: [ficheiro()] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('falta a chave')));
    expect(campo(container, 'pvb').value).toBe('');

    extrairFicha.mockResolvedValueOnce({ pvb: null, notas: 'ilegível' });
    fireEvent.change(screen.getByTestId('ficha-ficheiro'), { target: { files: [ficheiro()] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não consegui ler valores neste documento.'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('piloto: só os administradores veem o botão', () => {
    ADMIN = false;
    render(<FichaMargemPage />);
    expect(screen.queryByRole('button', { name: /Carregar contrato/ })).toBeNull();
    expect(screen.queryByTestId('ficha-ficheiro')).toBeNull();
  });
});

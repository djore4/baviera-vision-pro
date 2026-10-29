import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';

const rpc = vi.fn();
const selectImportacoes = vi.fn();
const selectCopias = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => ({
      select: () => (t === 'importacoes'
        ? { order: () => ({ order: () => ({ limit: selectImportacoes }) }) }
        : selectCopias()),
    }),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  validarImportacao, restaurarImportacao, ultimosCarimbos, isImportacaoSuspeita, motivoSuspeita,
} from '@/lib/importacoes';
import { cabecalhosEmFalta, parseExcel } from '@/lib/excel-parser';
import { replaceTableRows } from '@/lib/replace-rows';
import { ImportConfirm, type ImportacaoPendente } from '@/components/ImportConfirm';
import { ImportHistory } from '@/components/ImportHistory';
import { ImportStamp } from '@/components/ImportStamp';

beforeEach(() => { vi.clearAllMocks(); });

const HEADER = ['#', 'STATUS', 'NEG', 'MÊS1', 'RESP', 'ID', 'TYPE', 'BIZ', 'ENC', 'CHAS', 'MAT', 'MODEL', 'VERSION', 'GAR'];

describe('cabeçalhos da sheet CONTROL', () => {
  it('layout certo (com acentos e maiúsculas/minúsculas variadas): sem problemas', () => {
    expect(cabecalhosEmFalta(HEADER, -1)).toEqual([]);
    expect(cabecalhosEmFalta(HEADER.map(h => h.toLowerCase()), -1)).toEqual([]);
  });

  it('coluna inserida antes de MAT: diz onde está cada uma', () => {
    const deslocado = [...HEADER.slice(0, 10), 'NOVA', ...HEADER.slice(10)];
    const p = cabecalhosEmFalta(deslocado, -1);
    expect(p.join(' | ')).toMatch(/MAT está na coluna 12, não na 11/);
    expect(p.join(' | ')).toMatch(/MODEL está na coluna 13/);
  });

  it('coluna em falta: mostra o que lá está', () => {
    const sem = HEADER.filter(h => h !== 'CHAS');
    expect(cabecalhosEmFalta(sem, -1).join(' | ')).toMatch(/CHAS está na coluna|falta a coluna CHAS/);
  });

  it('com RET inserida antes das essenciais, desloca as posições esperadas', () => {
    const comRet = [...HEADER.slice(0, 4), 'RET', ...HEADER.slice(4)];   // RET na posição 4
    expect(cabecalhosEmFalta(comRet, 4)).toEqual([]);
  });

  it('parseExcel recusa o ficheiro em vez de ler dados trocados', () => {
    const deslocado = [...HEADER.slice(0, 10), 'NOVA', ...HEADER.slice(10)];
    const linha: unknown[] = []; linha[1] = 'Carteira'; linha[4] = 'BR';
    const ws = XLSX.utils.aoa_to_sheet([[], [], deslocado, linha]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CONTROL');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    expect(() => parseExcel(buf)).toThrow(/mudou de estrutura.*MAT está na coluna 12.*Importação cancelada/);
  });
});

describe('replaceTableRows — parâmetros novos só quando usados', () => {
  it('force e ficheiro vão para a base de dados', async () => {
    rpc.mockResolvedValue({ data: 2, error: null });
    await replaceTableRows('control_records', [{ status: 'a' }], { force: true, ficheiro: 'x.xlsx' });
    expect(rpc).toHaveBeenCalledWith('replace_rows', {
      p_table: 'control_records', p_rows: [{ status: 'a' }], p_allow_empty: false, p_force: true, p_ficheiro: 'x.xlsx',
    });
  });
});

describe('lib/importacoes', () => {
  it('reconhece a recusa por ficheiro suspeito e tira-lhe o prefixo', () => {
    const e = new Error('Erro ao importar registos (nada foi alterado): IMPORTACAO_SUSPEITA: O ficheiro tem 10 registos.');
    expect(isImportacaoSuspeita(e)).toBe(true);
    expect(motivoSuspeita(e)).toBe('O ficheiro tem 10 registos.');
    expect(isImportacaoSuspeita(new Error('boom'))).toBe(false);
  });

  it('validar: devolve o resultado; sem a função na base de dados, devolve null (importa como antes)', async () => {
    rpc.mockResolvedValueOnce({ data: { anteriores: 30, linhas: 5, bloqueios: ['x'], avisos: [] }, error: null });
    expect((await validarImportacao('control_records', 5))?.bloqueios).toEqual(['x']);
    expect(rpc).toHaveBeenCalledWith('importacao_validar', { p_tabela: 'control_records', p_linhas: 5 });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'missing' } });
    expect(await validarImportacao('control_records', 5)).toBeNull();
  });

  it('restaurar: chama a função e devolve os registos repostos', async () => {
    rpc.mockResolvedValue({ data: 25, error: null });
    expect(await restaurarImportacao(7)).toBe(25);
    expect(rpc).toHaveBeenCalledWith('restaurar_importacao', { p_importacao_id: 7 });
  });

  it('carimbos: nunca rebenta', async () => {
    rpc.mockRejectedValue(new Error('rede'));
    expect(await ultimosCarimbos()).toEqual([]);
  });
});

describe('ImportConfirm', () => {
  const pend = (v: ImportacaoPendente['validacao']): ImportacaoPendente => ({ file: new File(['x'], 'control.xlsx'), linhas: 10, validacao: v });

  it('mostra os registos atuais contra os do ficheiro e os avisos; confirma sem forçar', () => {
    const onConfirm = vi.fn();
    render(<ImportConfirm pendente={pend({ anteriores: 11, linhas: 10, bloqueios: [], avisos: ['Menos 1 registo'] })}
      titulo="Importar?" onCancel={() => {}} onConfirm={onConfirm}>texto</ImportConfirm>);
    expect(screen.getByTestId('import-contagem').textContent).toContain('11 → 10 registos');
    expect(screen.getByText('Menos 1 registo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Importar e substituir' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('ficheiro suspeito: o botão só abre depois de "importar mesmo assim", e então força', () => {
    const onConfirm = vi.fn();
    render(<ImportConfirm pendente={pend({ anteriores: 100, linhas: 10, bloqueios: ['Menos de metade'], avisos: [] })}
      titulo="Importar?" onCancel={() => {}} onConfirm={onConfirm}>texto</ImportConfirm>);
    const botao = screen.getByRole('button', { name: 'Importar e substituir' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByText('Menos de metade')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(botao.disabled).toBe(false);
    fireEvent.click(botao);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('sem validação (migração por aplicar): importa como antes', () => {
    const onConfirm = vi.fn();
    render(<ImportConfirm pendente={pend(null)} titulo="Importar?" onCancel={() => {}} onConfirm={onConfirm}>t</ImportConfirm>);
    expect(screen.getByTestId('import-contagem').textContent).toContain('10 registos');
    fireEvent.click(screen.getByRole('button', { name: 'Importar e substituir' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});

describe('ImportHistory', () => {
  const linha = (id: number, over = {}) => ({
    id, tabela: 'control_records', origem: 'manual', por: 'joao@x.pt', ficheiro: `f${id}.xlsx`, linhas: 100, linhas_anteriores: 120,
    avisos: [], forcada: false, created_at: '2026-10-29T16:00:00Z', ...over,
  });

  it('lista as importações com quem/ficheiro/variação e só oferece restauro onde há cópia', async () => {
    selectImportacoes.mockResolvedValue({ data: [linha(2, { forcada: true, avisos: ['Menos de metade'] }), linha(1)], error: null });
    selectCopias.mockResolvedValue({ data: [{ importacao_id: 2 }], error: null });
    render(<ImportHistory />);
    expect(await screen.findByText('f2.xlsx')).toBeTruthy();
    expect(screen.getByText('forçada')).toBeTruthy();
    expect(screen.getAllByText('(-20)')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Voltar a antes/ })).toHaveLength(1);
  });

  it('restaura depois de confirmar e avisa a app para recarregar', async () => {
    selectImportacoes.mockResolvedValue({ data: [linha(2)], error: null });
    selectCopias.mockResolvedValue({ data: [{ importacao_id: 2 }], error: null });
    rpc.mockResolvedValue({ data: 120, error: null });
    const onRestored = vi.fn();
    render(<ImportHistory onRestored={onRestored} />);
    fireEvent.click(await screen.findByRole('button', { name: /Voltar a antes/ }));
    expect(await screen.findByText(/120 registos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('restaurar_importacao', { p_importacao_id: 2 }));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
  });

  it('migração por aplicar: mensagem, não rebenta', async () => {
    selectImportacoes.mockResolvedValue({ data: null, error: { code: '42P01', message: 'x' } });
    selectCopias.mockResolvedValue({ data: [], error: null });
    render(<ImportHistory />);
    expect(await screen.findByText(/ainda não está disponível/)).toBeTruthy();
  });
});

describe('ImportStamp', () => {
  it('mostra há quanto tempo foi a última importação do control VN', async () => {
    rpc.mockResolvedValue({ data: [
      { tabela: 'control_records', created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), linhas: 100, origem: 'manual' },
      { tabela: 'control_records_vu', created_at: new Date(Date.now() - 5 * 60000).toISOString(), linhas: 40, origem: 'manual' },
    ], error: null });
    render(<ImportStamp />);
    const el = await screen.findByTestId('import-stamp');
    expect(el.textContent).toContain('Dados há 2 h');
    expect(el.getAttribute('title')).toMatch(/Control VU.*40 registos/);
  });

  it('sem importações registadas, não mostra nada', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<ImportStamp />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByTestId('import-stamp')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const invoke = vi.fn();
const update = vi.fn();
const refresh = vi.fn(async () => {});
let ADMIN = true;
let CONTROL: unknown[] = [];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({ update: (p: unknown) => ({ eq: (_c: string, id: string) => ({ in: () => ({ select: async () => update(p, id) }) }) }) }),
  },
}));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ data: { control: CONTROL }, refresh }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ isAdmin: ADMIN }) }));
vi.mock('@/components/SincronizarMatriculasButton', () => ({ default: ({ rotulo }: { rotulo?: string }) => <button>{rotulo}</button> }));
vi.mock('@/components/RecordEditor', () => ({ RECORDS_CHANGED_EVENT: 'records-changed' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import ImportarButton from '@/components/ImportarButton';
import { LINHA_KEYS, dataIso, linhasParaFaturas, matriculaValida, planearMapaRetail, validarFicheiro } from '@/lib/importar';
import type { ControlRecord } from '@/types/data';
import { toast } from 'sonner';

const rec = (o: Partial<ControlRecord>): ControlRecord => ({
  id: 'x', status: 'Carteira', neg: null, mes1: '', resp: '', cliente: 'Cliente', type: '', biz: '', enc: '', chas: '', mat: '', model: '', version: '',
  gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0, csc: 0, ret: 0, fin: '', week198: '', dmat: null, date298: null, dfat: null, obs: '', ...o,
});
const d = (iso: string) => new Date(`${iso}T00:00:00`);

beforeEach(() => { invoke.mockReset(); update.mockReset(); refresh.mockClear(); ADMIN = true; CONTROL = []; });

describe('planearMapaRetail', () => {
  const linha = { enc: '230828', chassis: 'WBA51JB000FX46707', matricula: 'CN99JT', dataMatricula: '2026-11-06', data298: '2026-11-12' };

  it('casa por chassis (7 últimos), passa a Retail e põe 298, DMAT e matrícula', () => {
    const r = rec({ id: 'a', enc: '0230828', chas: 'FX46707', status: 'Matricula' });
    const p = planearMapaRetail([r], [linha]);
    expect(p.alteracoes).toHaveLength(1);
    expect(p.alteracoes[0].patch).toEqual({ status: 'Retail', date298: '2026-11-12', dmat: '2026-11-06', mat: 'CN-99-JT', chas: 'WBA51JB000FX46707' });
  });

  it('cai para a encomenda quando o chassis não bate', () => {
    const p = planearMapaRetail([rec({ id: 'a', enc: '230828', chas: '' })], [linha]);
    expect(p.alteracoes[0].id).toBe('a');
  });

  it('o mapa manda nas datas, mas nunca sobrescreve uma matrícula diferente', () => {
    const r = rec({ id: 'a', chas: 'WBA51JB000FX46707', status: 'Retail', date298: d('2026-11-05'), dmat: d('2026-11-06'), mat: 'AA-11-BB' });
    const p = planearMapaRetail([r], [linha]);
    expect(p.alteracoes[0].patch).toEqual({ date298: '2026-11-12' });
    expect(p.ignoradas[0].motivo).toMatch(/já tem matrícula/);
  });

  it('já em dia, sem correspondência, ambíguo, estado não elegível e sem 298 vão para o lado certo', () => {
    const emDia = rec({ id: 'a', chas: 'WBA51JB000FX46707', status: 'Retail', date298: d('2026-11-12'), dmat: d('2026-11-06'), mat: 'CN-99-JT', enc: '230828' });
    expect(planearMapaRetail([emDia], [linha])).toMatchObject({ iguais: 1, alteracoes: [] });
    expect(planearMapaRetail([], [linha]).ignoradas[0].motivo).toMatch(/não encontrei/);
    const dois = [rec({ id: 'a', chas: 'FX46707' }), rec({ id: 'b', chas: 'FX46707' })];
    expect(planearMapaRetail(dois, [linha]).ignoradas[0].motivo).toMatch(/2 registos/);
    expect(planearMapaRetail([rec({ id: 'a', chas: 'FX46707', status: 'Perdido' })], [linha]).ignoradas[0].motivo).toMatch(/Perdido/);
    expect(planearMapaRetail([rec({ id: 'a', chas: 'FX46707' })], [{ ...linha, data298: null }]).ignoradas[0].motivo).toMatch(/298/);
  });

  it('ignora lixo: datas e matrículas inválidas não passam', () => {
    expect(dataIso('2026-02-31')).toBeNull();
    expect(dataIso('12/11/2026')).toBeNull();
    expect(dataIso('2026-11-12 09:53:53')).toBe('2026-11-12');
    expect(matriculaValida('cn26hh')).toBe('CN-26-HH');
    expect(matriculaValida('XYZ')).toBeNull();
  });
});

describe('ficheiros e faturas', () => {
  it('valida o formato e o tamanho', () => {
    expect(validarFicheiro({ type: 'image/png', size: 1000 }).fonte).toBe('imagem');
    expect(validarFicheiro({ name: 'x.xlsx', type: '', size: 1000 }).fonte).toBe('folha');
    expect(validarFicheiro({ type: 'image/gif', size: 1000 }).erro).toMatch(/não suportado/);
    expect(validarFicheiro({ type: 'image/png', size: 7 * 1024 * 1024 }).erro).toMatch(/grande/);
  });
  it('linhas de faturas lidas de imagem viram FaturaRow', () => {
    expect(linhasParaFaturas([{ chassis: 'wba51jb000fx46707', dfat: '2026-11-10', total: 1000 }, { chassis: null }])).toEqual([
      { vin: 'WBA51JB000FX46707', dfat: '2026-11-10', dmat: null, total: 1000, estado: '' },
    ]);
  });
  it('o esquema da edge function usa os mesmos campos da linha', () => {
    const src = readFileSync('supabase/functions/importar-extrair/index.ts', 'utf8');
    for (const k of LINHA_KEYS) expect(src).toContain(`${k}: `);
    expect(src).toContain('platform_admins');
  });
});

describe('Importar (botão)', () => {
  it('só o administrador vê o botão', () => {
    ADMIN = false;
    const { container } = render(<ImportarButton />);
    expect(container.textContent).toBe('');
  });

  it('mostra o email de matrículas e a zona para colar', () => {
    render(<ImportarButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    expect(screen.getByText(/Cola aqui/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sincronizar email' })).toBeInTheDocument();
  });

  it('imagem do mapa: lê, mostra o que muda e só grava depois de confirmar', async () => {
    CONTROL = [rec({ id: 'a', enc: '230828', chas: 'FX46707', status: 'Matricula' })];
    invoke.mockResolvedValue({ data: { resultado: { tipo: 'mapa_retail', linhas: [{ enc: '230828', chassis: 'WBA51JB000FX46707', data298: '2026-11-12', dataMatricula: '2026-11-06' }] } }, error: null });
    update.mockResolvedValue({ data: [{ id: 'a' }], error: null });
    render(<ImportarButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const png = new File([new Uint8Array([1, 2, 3])], 'mapa.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('ficheiro'), { target: { files: [png] } });
    await screen.findByText('Mapa de Retail');
    expect(invoke).toHaveBeenCalledWith('importar-extrair', { body: { media_type: 'image/png', data: expect.any(String) } });
    expect(screen.getByText('230828')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Gravar 1 alteração/ }));
    await screen.findByText('Dados importados');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'Retail', date298: '2026-11-12' }), 'a');
    expect(refresh).toHaveBeenCalled();
  });

  it('colar uma captura de ecrã (Ctrl+V) inicia a leitura', async () => {
    invoke.mockResolvedValue({ data: { resultado: { tipo: 'desconhecido', linhas: [] } }, error: null });
    render(<ImportarButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    const png = new File([new Uint8Array([1])], 'print.png', { type: 'image/png' });
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    ev.clipboardData = { files: [png] };
    document.dispatchEvent(ev);
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível importar', { description: expect.stringMatching(/Não reconheci/) }));
  });

  it('função não publicada (404): mensagem clara e nada gravado', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('x'), { context: { status: 404, json: async () => ({}) } }) });
    render(<ImportarButton />);
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    fireEvent.change(screen.getByTestId('ficheiro'), { target: { files: [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível importar', { description: expect.stringMatching(/importar-extrair/) }));
    expect(update).not.toHaveBeenCalled();
  });
});

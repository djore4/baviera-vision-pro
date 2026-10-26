import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Ocorrencia } from '@/lib/instalacoes';

/* Página Instalações inteira, com dados simulados e a planta substituída por botões
 * que disparam os mesmos callbacks (o zoom/arrasto testa-se à parte, em planta-view). */

const mk = (id: string, over: Partial<Ocorrencia> = {}): Ocorrencia => ({
  id, piso: 'piso-0', x: 0.25, y: 0.5, zona: 'Oficina', titulo: `Oc ${id}`, intervencao: `Arranjar ${id}`,
  categoria: 'eletricidade', prioridade: 'normal', estado: 'aberta', data_ocorrencia: '2026-10-20',
  interlocutor: null, data_reporte: null, obs: null, resolvida_em: null, criada_por: null,
  created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z', ...over,
});

let DB: Ocorrencia[] = [];
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/instalacoes', async (orig) => ({
  ...(await orig<typeof import('@/lib/instalacoes')>()),
  listOcorrencias: vi.fn(async () => DB),
  listHistorico: vi.fn(async () => []),
  createOcorrencia: (...a: unknown[]) => create(...a),
  updateOcorrencia: (...a: unknown[]) => update(...a),
  deleteOcorrencia: (...a: unknown[]) => remove(...a),
}));

let EDIT = true;
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit: () => EDIT }) }));
vi.mock('@/clients', () => ({
  client: { plantas: [
    { id: 'piso-0', label: 'Piso 0', src: '/p0.png' },
    { id: 'piso-1', label: 'Piso 1', src: '/p1.png' },
  ] },
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/instalacoes/PlantaViewer', () => ({
  PlantaViewer: (p: {
    alt: string; pins: { id: string; label: string }[]; placing: string | null; draft: unknown;
    onPlace: (x: number, y: number) => void; onSelect: (id: string | null) => void;
  }) => (
    <div data-testid="viewer" data-placing={p.placing ?? ''} data-draft={p.draft ? 'sim' : ''}>
      <span>{p.alt}</span>
      {p.pins.map(pin => <button key={pin.id} data-testid={`pin-${pin.id}`} onClick={() => p.onSelect(pin.id)}>{pin.label}</button>)}
      <button onClick={() => p.onPlace(0.4, 0.6)}>clicar-na-planta</button>
    </div>
  ),
}));

import InstalacoesPage from '@/pages/InstalacoesPage';

beforeEach(() => {
  create.mockReset(); update.mockReset(); remove.mockReset();
  EDIT = true;
  DB = [
    mk('1', { prioridade: 'urgente', interlocutor: 'Rui' }),
    mk('2'),
    mk('3', { piso: 'piso-1', titulo: 'Porta avariada' }),
    mk('4', { estado: 'resolvida' }),
  ];
});

const list = () => screen.getByTestId('lista-ocorrencias');

describe('InstalacoesPage', () => {
  it('lista as ocorrências por resolver do piso e mostra os contadores', async () => {
    render(<InstalacoesPage />);
    await waitFor(() => expect(within(list()).getByText('Oc 1')).toBeTruthy());
    expect(within(list()).getByText('Oc 2')).toBeTruthy();
    expect(within(list()).queryByText('Oc 3')).toBeNull();     // outro piso
    expect(within(list()).queryByText('Oc 4')).toBeNull();     // resolvida
    expect(screen.getByRole('button', { name: /3\s*Por resolver/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /1\s*Urgentes/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2\s*Por reportar/ })).toBeTruthy();   // 2 e 3 sem interlocutor
  });

  it('"Mostrar todos os pisos" junta as ocorrências dos dois pisos', async () => {
    render(<InstalacoesPage />);
    await screen.findByText('Oc 1');
    fireEvent.click(screen.getByLabelText('Mostrar todos os pisos'));
    expect(within(list()).getByText('Porta avariada')).toBeTruthy();
  });

  it('escolher uma ocorrência abre o detalhe com intervenção, interlocutor e estado', async () => {
    render(<InstalacoesPage />);
    fireEvent.click(await screen.findByTestId('pin-1'));
    expect(await screen.findByText('Intervenção necessária')).toBeTruthy();
    expect(screen.getAllByText('Arranjar 1')).toHaveLength(2);   // na lista e no detalhe
    expect(screen.getAllByText('Rui').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Em curso' })).toBeTruthy();
  });

  it('mudar o estado grava e atualiza a ocorrência', async () => {
    update.mockResolvedValue(mk('1', { estado: 'em_curso', prioridade: 'urgente', interlocutor: 'Rui', updated_at: 'x' }));
    render(<InstalacoesPage />);
    fireEvent.click(await screen.findByTestId('pin-1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Em curso' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('1', { estado: 'em_curso' }));
  });

  it('registar: marcar o local na planta abre o formulário e grava com a posição clicada', async () => {
    create.mockResolvedValue(mk('9', { titulo: 'Fuga de água', x: 0.4, y: 0.6 }));
    render(<InstalacoesPage />);
    await screen.findByText('Oc 1');
    fireEvent.click(screen.getByRole('button', { name: /Registar ocorrência/ }));
    expect(screen.getByText('Clica na planta, no local do problema')).toBeTruthy();
    expect(screen.getByTestId('viewer').dataset.placing).toBe('new');

    fireEvent.click(screen.getByText('clicar-na-planta'));
    expect(screen.getByTestId('viewer').dataset.draft).toBe('sim');
    // o botão de submissão só ativa com título e intervenção
    const submit = screen.getAllByRole('button', { name: 'Registar ocorrência' })
      .find(b => (b as HTMLButtonElement).type === 'submit')!;
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/O que se passa/), { target: { value: 'Fuga de água' } });
    fireEvent.change(screen.getByLabelText(/Intervenção necessária/), { target: { value: 'Chamar canalizador' } });
    fireEvent.change(screen.getByLabelText('Reportada a'), { target: { value: 'Ana Gestora' } });
    fireEvent.click(submit);

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      piso: 'piso-0', x: 0.4, y: 0.6, titulo: 'Fuga de água', intervencao: 'Chamar canalizador', interlocutor: 'Ana Gestora',
    });
    // depois de gravar, fica o detalhe da nova ocorrência
    expect(await screen.findByText('Intervenção necessária')).toBeTruthy();
    expect(screen.getByTestId('viewer').dataset.placing).toBe('');
  });

  it('só com permissão de consulta não há registo, estado nem edição', async () => {
    EDIT = false;
    render(<InstalacoesPage />);
    fireEvent.click(await screen.findByTestId('pin-1'));
    await screen.findByText('Intervenção necessária');
    expect(screen.queryByRole('button', { name: /Registar ocorrência/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Em curso' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Apagar/ })).toBeNull();
    expect(screen.getByTestId('viewer').dataset.placing).toBe('');
  });

  it('o contador "Por reportar" filtra a lista', async () => {
    render(<InstalacoesPage />);
    await screen.findByText('Oc 1');
    fireEvent.click(screen.getByRole('button', { name: /2\s*Por reportar/ }));
    expect(within(list()).queryByText('Oc 1')).toBeNull();     // já reportada
    expect(within(list()).getByText('Oc 2')).toBeTruthy();
  });
});

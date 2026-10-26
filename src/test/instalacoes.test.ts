import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  diasDesde, filtrar, historicoLabel, interlocutoresUsados, isAtiva, kpis, zonasUsadas, hojeIso,
  type Ocorrencia,
} from '@/lib/instalacoes';
import { clampView } from '@/lib/planta-view';

const HOJE = new Date(2026, 9, 27); // 27-10-2026

const mk = (id: string, over: Partial<Ocorrencia> = {}): Ocorrencia => ({
  id, piso: 'piso-0', x: 0.5, y: 0.5, zona: null, titulo: `Oc ${id}`, intervencao: 'Arranjar',
  categoria: 'outro', prioridade: 'normal', estado: 'aberta', data_ocorrencia: '2026-10-20',
  interlocutor: null, data_reporte: null, obs: null, resolvida_em: null, criada_por: null,
  created_at: '', updated_at: '', ...over,
});

describe('diasDesde', () => {
  it('conta dias de calendário e nunca é negativo', () => {
    expect(diasDesde('2026-10-27', HOJE)).toBe(0);
    expect(diasDesde('2026-10-20', HOJE)).toBe(7);
    expect(diasDesde('2026-11-02', HOJE)).toBe(0);
  });
  it('atravessa a mudança de hora sem perder um dia', () => {
    expect(diasDesde('2026-10-24', new Date(2026, 9, 26))).toBe(2);   // fim da hora de verão a 25-10
  });
});

describe('kpis', () => {
  it('só conta ocorrências ativas e separa urgentes e por reportar', () => {
    const k = kpis([
      mk('a', { prioridade: 'urgente', interlocutor: 'Rui' }),
      mk('b', { estado: 'em_curso', data_ocorrencia: '2026-10-01' }),
      mk('c', { estado: 'resolvida', prioridade: 'urgente' }),
      mk('d', { estado: 'cancelada' }),
    ], HOJE);
    expect(k).toEqual({ ativas: 2, urgentes: 1, porReportar: 1, maisAntiga: 26 });
  });
  it('sem ativas não há ocorrência mais antiga', () => {
    expect(kpis([mk('a', { estado: 'resolvida' })], HOJE).maisAntiga).toBeNull();
    expect(kpis([], HOJE).ativas).toBe(0);
  });
});

describe('filtrar', () => {
  const data = [
    mk('1', { prioridade: 'baixa', data_ocorrencia: '2026-10-01', titulo: 'Infiltração no teto', zona: 'Oficina' }),
    mk('2', { prioridade: 'urgente', data_ocorrencia: '2026-10-20' }),
    mk('3', { prioridade: 'urgente', data_ocorrencia: '2026-10-05', piso: 'piso-1' }),
    mk('4', { estado: 'resolvida', prioridade: 'urgente' }),
  ];
  it('por omissão só as ativas, mais urgentes primeiro e, a igual prioridade, as mais antigas', () => {
    expect(filtrar(data, {}).map(o => o.id)).toEqual(['3', '2', '1']);
  });
  it('filtra por piso, estado e prioridade', () => {
    expect(filtrar(data, { piso: 'piso-1' }).map(o => o.id)).toEqual(['3']);
    expect(filtrar(data, { estado: 'resolvida' }).map(o => o.id)).toEqual(['4']);
    expect(filtrar(data, { estado: 'all', prioridade: 'urgente' }).map(o => o.id)).toEqual(['3', '2', '4']);
  });
  it('a pesquisa ignora maiúsculas e acentos e procura também na zona', () => {
    expect(filtrar(data, { q: 'INFILTRACAO' }).map(o => o.id)).toEqual(['1']);
    expect(filtrar(data, { q: 'oficina' }).map(o => o.id)).toEqual(['1']);
  });
  it('as inativas vão para o fim quando se mostra tudo', () => {
    const r = filtrar(data, { estado: 'all' }).map(o => o.id);
    expect(r[r.length - 1]).toBe('4');
    expect(isAtiva(data[3])).toBe(false);
  });
});

describe('sugestões', () => {
  it('interlocutores por frequência e zonas por piso', () => {
    const l = [
      mk('1', { interlocutor: 'Ana', zona: 'Oficina' }), mk('2', { interlocutor: 'Rui', zona: 'Oficina' }),
      mk('3', { interlocutor: 'Rui', zona: 'Receção', piso: 'piso-1' }),
    ];
    expect(interlocutoresUsados(l)).toEqual(['Rui', 'Ana']);
    expect(zonasUsadas(l, 'piso-0')).toEqual(['Oficina']);
    expect(zonasUsadas(l)).toEqual(['Oficina', 'Receção']);
  });
});

describe('historicoLabel', () => {
  it('descreve criação, estado e reporte', () => {
    expect(historicoLabel({ tipo: 'criada', de: null, para: 'aberta' })).toBe('Ocorrência registada');
    expect(historicoLabel({ tipo: 'estado', de: 'aberta', para: 'em_curso' })).toBe('Estado: Aberta → Em curso');
    expect(historicoLabel({ tipo: 'reporte', de: null, para: 'Rui' })).toBe('Reportada a Rui');
    expect(historicoLabel({ tipo: 'reporte', de: 'Rui', para: null })).toBe('Reporte removido (era Rui)');
    expect(historicoLabel({ tipo: 'reporte', de: 'Rui', para: 'Ana' })).toBe('Reportada a Ana (antes: Rui)');
  });
});

describe('hojeIso', () => {
  it('formata em hora local com zeros à esquerda', () => {
    expect(hojeIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('clampView (zoom e arrasto da planta)', () => {
  const W = 1000, H = 300, CW = 1000, CH = 300;
  it('à escala 1 a planta fica centrada, sem folga para arrastar', () => {
    expect(clampView({ s: 1, tx: 120, ty: -50 }, CW, CH, W, H)).toEqual({ s: 1, tx: 0, ty: 0 });
  });
  it('limita a escala', () => {
    expect(clampView({ s: 0.2, tx: 0, ty: 0 }, CW, CH, W, H).s).toBe(1);
    expect(clampView({ s: 50, tx: 0, ty: 0 }, CW, CH, W, H).s).toBe(8);
  });
  it('ampliada, não deixa arrastar a planta para fora da área visível', () => {
    expect(clampView({ s: 2, tx: 500, ty: 500 }, CW, CH, W, H)).toEqual({ s: 2, tx: 0, ty: 0 });
    expect(clampView({ s: 2, tx: -5000, ty: -5000 }, CW, CH, W, H)).toEqual({ s: 2, tx: -1000, ty: -300 });
  });
  it('centra quando a planta é mais baixa que a área (ecrã alto)', () => {
    expect(clampView({ s: 1, tx: 0, ty: 0 }, 1000, 500, 1000, 300).ty).toBe(100);
  });
});

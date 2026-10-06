import { describe, it, expect } from 'vitest';
import { buildReport } from '@/lib/eot-report';
import type { ActTipo, EotContract } from '@/lib/eot';

const inDays = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const mk = (n: string, over: Partial<EotContract> = {}): EotContract => ({
  contrato: `C-${n}`, fase: 'pendente', temperatura: null, owner_email: null, owner_nome: null,
  data_fim: inDays(10), valor_residual: 1000, ...over,
} as EotContract);

const none = () => null;
const opts = { buckets: 'prazo' as const, metric: 'n' as const, nextTipo: none };

describe('buildReport', () => {
  it('distribui pela régua de prazo e soma linhas e colunas', () => {
    const r = buildReport([
      mk('a', { data_fim: inDays(5), temperatura: 'quente' }),
      mk('b', { data_fim: inDays(45), temperatura: 'quente' }),
      mk('c', { data_fim: inDays(45), temperatura: 'frio' }),
      mk('d', { data_fim: inDays(400), temperatura: 'frio' }),
    ], { ...opts, dim: 'temperatura' });

    const labels = r.buckets.map(b => b.label);
    expect(labels).toEqual(['0–30 d', '31–60 d', '61–90 d', '91–180 d', '> 180 d']);
    expect(r.rows.map(x => x.label)).toEqual(['Quente', 'Frio']); // quente primeiro; vazios omitidos
    expect(r.rows[0].cells).toEqual([1, 1, 0, 0, 0]);
    expect(r.rows[1].cells).toEqual([0, 1, 0, 0, 1]);
    expect(r.colTotals).toEqual([1, 2, 0, 0, 1]);
    expect(r.grandTotal).toBe(4);
    expect(r.max).toBe(1);
  });

  it('"Terminados" e "Sem data" só aparecem quando há contratos', () => {
    const sem = buildReport([mk('a')], { ...opts, dim: 'fase' });
    expect(sem.buckets.some(b => b.key === 'past' || b.key === 'none')).toBe(false);

    const com = buildReport([mk('a', { data_fim: inDays(-5) }), mk('b', { data_fim: null })], { ...opts, dim: 'fase' });
    expect(com.buckets[0].label).toBe('Terminados');
    expect(com.buckets[com.buckets.length - 1].label).toBe('Sem data');
    expect(com.grandTotal).toBe(2);
  });

  it('régua por mês: 12 meses a contar de hoje; o que passa disso vai para "> 12 meses"', () => {
    const r = buildReport([mk('a', { data_fim: inDays(5) }), mk('b', { data_fim: inDays(500) })], { ...opts, buckets: 'mes', dim: 'fase' });
    expect(r.buckets.filter(b => /^\w{3} \d{2}$/.test(b.label))).toHaveLength(12);
    expect(r.buckets[r.buckets.length - 1].label).toBe('> 12 meses');
    expect(r.grandTotal).toBe(2);
  });

  it('próxima ação: contratos sem agenda ficam em "Sem ação agendada"', () => {
    const tipos: Record<string, ActTipo> = { 'C-a': 'chamada' };
    const r = buildReport([mk('a'), mk('b')], { ...opts, dim: 'acao', nextTipo: c => tipos[c] ?? null });
    expect(r.rows.map(x => [x.label, x.total])).toEqual([['Chamada', 1], ['Sem ação agendada', 1]]);
  });

  it('responsável: junta emails sem distinguir maiúsculas; "Sem responsável" no fim', () => {
    const r = buildReport([
      mk('a', { owner_email: 'Rui@x.pt', owner_nome: 'Rui' }),
      mk('b', { owner_email: 'rui@x.pt', owner_nome: 'Rui' }),
      mk('c'),
      mk('d', { owner_email: 'ana@x.pt', owner_nome: 'Ana' }),
    ], { ...opts, dim: 'responsavel' });
    expect(r.rows.map(x => [x.label, x.total])).toEqual([['Ana', 1], ['Rui', 2], ['Sem responsável', 1]]);
  });

  it('medida "valor" soma o valor residual; sem valor conta 0', () => {
    const r = buildReport([
      mk('a', { valor_residual: 12000 }), mk('b', { valor_residual: 8000 }), mk('c', { valor_residual: null }),
    ], { ...opts, dim: 'fase', metric: 'valor' });
    expect(r.grandTotal).toBe(20000);
  });
});

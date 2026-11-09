import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEMO_COL_DEFS, DEMO_COL_PERMS, LEGACY_DEMO_COLS, PRICE_FIELDS, demoColRequires, toggleDemoCol, coherentDemoCols,
  type DemoColKey,
} from '@/lib/demoColunas';
import { toFieldText, fromFieldText } from '@/lib/precoCampos';

const keys = (s: Set<DemoColKey>) => [...s].sort();

describe('colunas do Demos por função', () => {
  it('as dependências coincidem com demos_dep_colunas() da migração (é o que a base de dados envia)', () => {
    const sql = readFileSync('supabase/migrations/20261109150000_demos_colunas_precos.sql', 'utf8');
    const json = /select '(\{[\s\S]*?\})'::jsonb/.exec(sql)![1];
    const db = JSON.parse(json) as Record<string, string[]>;
    expect(Object.keys(db).sort()).toEqual(DEMO_COL_DEFS.map(c => c.key).sort());
    for (const c of DEMO_COL_DEFS) expect([...db[c.key]].sort(), c.key).toEqual([...c.deps].sort());
  });

  it('as chaves de permissão têm o prefixo demos:col: e uma por coluna', () => {
    expect(DEMO_COL_PERMS).toHaveLength(DEMO_COL_DEFS.length);
    expect(DEMO_COL_PERMS.every(k => k.startsWith('demos:col:'))).toBe(true);
  });

  it('antes da migração: preços e venda, sem descontos, custo nem margem', () => {
    expect(LEGACY_DEMO_COLS.has('pvp')).toBe(true);
    expect(LEGACY_DEMO_COLS.has('pvp_desc')).toBe(true);
    for (const k of ['mgb', 'dsc', 'p_custo', 'dep', 'margem']) expect(LEGACY_DEMO_COLS.has(k)).toBe(false);
  });

  it('ligar uma coluna calculada traz as de que depende', () => {
    expect(keys(toggleDemoCol(new Set(), 'dsc', true))).toEqual(['dsc', 'esf', 'dem', 'mgb', 'opc', 'pac', 'pvb', 'sup'].sort());
    expect(demoColRequires('pvp_siva')).toEqual(['pvp_desc']);
    expect(demoColRequires('pvb')).toEqual([]);
  });

  it('desligar uma coluna leva as que dependem dela', () => {
    const tudo = new Set(DEMO_COL_DEFS.map(c => c.key));
    const sem = toggleDemoCol(tudo, 'pvb', false);
    for (const k of ['pvb', 'pen', 'pvp', 'dsc', 'p_custo', 'margem']) expect(sem.has(k as DemoColKey), k).toBe(false);
    for (const k of ['opc', 'mgb', 'pvp_desc', 'dep']) expect(sem.has(k as DemoColKey), k).toBe(true);
  });

  it('dados incoerentes (margem sem dependências) são completados', () => {
    const c = coherentDemoCols(['margem']);
    expect(c.has('depreciacoes' as never)).toBe(false);
    for (const k of ['pvb', 'opc', 'mgb', 'esf', 'pac', 'dem', 'sup', 'eco', 'leg', 'isv', 'pvp_desc', 'dep']) expect(c.has(k as DemoColKey), k).toBe(true);
  });

  it('a janela de preço edita exatamente os 13 valores que a base de dados aceita', () => {
    const sql = readFileSync('supabase/migrations/20261109150000_demos_colunas_precos.sql', 'utf8');
    const m = /allowed constant text\[\] := array\[([^\]]+)\]/.exec(sql)![1];
    const db = [...m.matchAll(/'(\w+)'/g)].map(x => x[1]);
    expect([...PRICE_FIELDS].sort()).toEqual(db.sort());
  });
});

describe('texto dos campos de preço', () => {
  it('percentagens escrevem-se em %, euros em formato PT', () => {
    expect(toFieldText(0.085, 'pct')).toBe('8,5');
    expect(toFieldText(76874, 'eur')).toBe('76874');
    expect(toFieldText(0, 'eur')).toBe('');
    expect(fromFieldText('8,5', 'pct')).toBeCloseTo(0.085);
    expect(fromFieldText('76.874,50', 'eur')).toBe(76874.5);
    expect(fromFieldText('', 'eur')).toBe(0);
    expect(fromFieldText('abc', 'eur')).toBeNull();
  });
});

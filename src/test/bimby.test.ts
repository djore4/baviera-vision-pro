import { describe, expect, it } from 'vitest';
import { alongar, bimbyficar, MAX_CHARS, normalizar } from '@/lib/bimby';

/* rng determinístico: devolve a sequência dada, em ciclo */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('Bimby', () => {
  it('normaliza espaços e limita o tamanho', () => {
    expect(normalizar('  olá   \n  mundo ')).toBe('olá mundo');
    expect(normalizar('a'.repeat(MAX_CHARS + 50))).toHaveLength(MAX_CHARS);
  });

  it('modo fiel devolve só o texto limpo; texto vazio devolve vazio', () => {
    expect(bimbyficar('  bom   dia ', 'fiel')).toBe('bom dia');
    expect(bimbyficar('   ', 'maluco')).toBe('');
  });

  it('alonga a última vogal', () => {
    expect(alongar('olá', seq(0))).toBe('oláááá');
    expect(alongar('psst')).toBe('psst');
  });

  it('modo maluco mantém todas as palavras e acrescenta abertura e remate', () => {
    const out = bimbyficar('vamos bater o objetivo', 'maluco', seq(0.99));
    expect(out.startsWith('Notícia de última hora!')).toBe(true);
    for (const p of ['vamos', 'bater', 'o', 'objetivo']) expect(out).toContain(p);
    expect(out.length).toBeGreaterThan('vamos bater o objetivo'.length);
  });

  it('palavras curtas nunca são alteradas', () => {
    const out = bimbyficar('de a o', 'maluco', seq(0));
    expect(out).toContain('de a o');
  });
});

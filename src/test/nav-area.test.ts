import { describe, it, expect } from 'vitest';
import { TABS, navAreaFor } from '@/lib/permissions';

const eot = TABS.find(t => t.key === 'end-of-term')!;
const can = (...keys: string[]) => (k: string) => keys.includes(k);

describe('navAreaFor — End-of-Term na secção VU', () => {
  it('vendedor VU com acesso ao End-of-Term vê-o em VU', () => {
    expect(navAreaFor(eot, can('wip', 'funil-vu', 'end-of-term'))).toBe('vu');
  });

  it('vendedor VN continua a vê-lo em VN', () => {
    expect(navAreaFor(eot, can('retails', 'funil', 'end-of-term'))).toBe('vn');
  });

  it('quem vê VU e VN (ex.: administrador) mantém VN', () => {
    expect(navAreaFor(eot, can('wip', 'retails', 'end-of-term'))).toBe('vn');
  });

  it('sem nenhum tab VU fica em VN (ex.: Finance)', () => {
    expect(navAreaFor(eot, can('end-of-term'))).toBe('vn');
  });

  it('os outros tabs não mudam de área', () => {
    const wip = TABS.find(t => t.key === 'wip')!;
    expect(navAreaFor(wip, can('wip', 'end-of-term'))).toBe('vu');
    expect(navAreaFor(TABS.find(t => t.key === 'retails')!, can('wip'))).toBe('vn');
  });
});

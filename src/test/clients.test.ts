import { describe, it, expect } from 'vitest';
import { CLIENTS, client } from '@/clients';
import { TABS } from '@/lib/permissions';

const HSL = /^\d{1,3} \d{1,3}% \d{1,3}%$/;

describe('configuração por cliente', () => {
  it('sem VITE_CLIENT a instalação é a Baviera', () => {
    expect(client.id).toBe('baviera');
  });

  it('regista a Baviera e o Demo', () => {
    expect(Object.keys(CLIENTS).sort()).toEqual(['baviera', 'demo']);
  });

  it.each(Object.values(CLIENTS))('$id tem marca e cores válidas', c => {
    expect(c.name).toBeTruthy();
    expect(c.title).toBeTruthy();
    expect(c.logo.src).toBeTruthy();
    expect(c.theme.primary).toMatch(HSL);
    expect(c.theme.dark).toMatch(HSL);
  });

  it.each(Object.values(CLIENTS))('$id só desativa tabs que existem', c => {
    const known = new Set([...TABS.map(t => t.key), 'escala-repsol']);
    for (const key of c.disabledTabs) expect(known.has(key)).toBe(true);
  });

  it('o Demo não tem referências a outros clientes', () => {
    const text = JSON.stringify(CLIENTS.demo).toLowerCase();
    expect(text).not.toMatch(/caetano|bmw|baviera/);
  });
});

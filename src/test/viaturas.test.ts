import { describe, it, expect } from 'vitest';
import { getDeliveryMonth, isRetailType, isRetailDelivery } from '@/lib/viaturas';
import type { ControlRecord } from '@/types/data';

const baseRecord = (over: Partial<ControlRecord>): ControlRecord => ({
  status: '', neg: null, mes1: '', resp: '', cliente: '', type: '', biz: '', enc: '',
  chas: '', mat: '', model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, mPerf: 0,
  csc: 0, ret: 0, fin: '', week198: '', dmat: null, date298: null,
  dfat: null, obs: '', ...over,
});

describe('tipos que contam para retails', () => {
  it('VN, VD e RMK contam; VP não', () => {
    expect(['VN', 'VD', 'RMK', 'VP'].map(isRetailType)).toEqual([true, true, true, false]);
  });

  it('RMK com estado Retail é uma entrega retail', () => {
    expect(isRetailDelivery(baseRecord({ type: 'RMK', status: 'Retail' }))).toBe(true);
    expect(isRetailDelivery(baseRecord({ type: 'VP', status: 'Retail' }))).toBe(false);
  });
});

describe('getDeliveryMonth — MÊS1 manda no posicionamento', () => {
  it('usa MÊS1 mesmo quando há data de retail (298) noutro mês', () => {
    // Matrícula pedida em agosto, entrega prevista em setembro (MÊS1).
    const r = baseRecord({ mes1: '2026/09', date298: new Date('2026-08-26T00:00:00Z') });
    expect(getDeliveryMonth(r)).toBe('2026/09');
  });

  it('normaliza MÊS1 sem zero à esquerda', () => {
    expect(getDeliveryMonth(baseRecord({ mes1: '2026/9' }))).toBe('2026/09');
  });

  it('recorre à data de retail quando MÊS1 não tem mês', () => {
    const r = baseRecord({ mes1: '', date298: new Date('2026-08-26T00:00:00Z') });
    expect(getDeliveryMonth(r)).toBe('2026/08');
  });
});

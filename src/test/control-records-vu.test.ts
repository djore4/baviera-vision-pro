import { describe, it, expect } from 'vitest';
import {
  isVuWipStatus, isVuFunilStatus, vuFormToDb, applyVuStatusChange, validateVuForm, EMPTY_VU_FORM, type VuForm,
} from '@/lib/control-records-vu';

const form = (p: Partial<VuForm> = {}): VuForm => ({ ...EMPTY_VU_FORM, ...p });

describe('status VU', () => {
  it('separa WIP (FATURA/CARTEIRA) e funil (FRIO/MORNO/QUENTE)', () => {
    expect(['FATURA', 'CARTEIRA'].every(isVuWipStatus)).toBe(true);
    expect(['FRIO', 'MORNO', 'QUENTE'].every(isVuFunilStatus)).toBe(true);
    expect(isVuWipStatus('FRIO')).toBe(false);
    expect(isVuFunilStatus('FATURA')).toBe(false);
  });
});

describe('vuFormToDb', () => {
  it('normaliza maiúsculas e transforma vazios em null', () => {
    const row = vuFormToDb(form({ status: ' quente ', resp: 'a b', chas: 'wba 123', mat: 'aa-00-bb', type: 'vu', cliente: ' Maria ', ret: 3 }));
    expect(row).toMatchObject({ status: 'QUENTE', resp: 'AB', chas: 'WBA123', mat: 'AA-00-BB', type: 'VU', cliente: 'Maria', ret: 1, a360: 0, recond: 0 });
    expect(row.dfat).toBeNull();
    expect(row.obs).toBeNull();
    expect(row.model).toBeNull();
  });
});

describe('applyVuStatusChange', () => {
  const hoje = new Date(2026, 10, 16);
  it('ao passar do funil a Carteira regista a data de fecho', () => {
    const f = applyVuStatusChange(form({ status: 'QUENTE' }), 'CARTEIRA', hoje);
    expect(f).toMatchObject({ status: 'CARTEIRA', dt_fecho: '2026-11-16', dfat: '' });
  });
  it('ao passar a Fatura regista também a data de fatura', () => {
    const f = applyVuStatusChange(form({ status: 'CARTEIRA', dt_fecho: '2026-11-02' }), 'FATURA', hoje);
    expect(f).toMatchObject({ status: 'FATURA', dt_fecho: '2026-11-02', dfat: '2026-11-16' });
  });
  it('nunca sobrescreve datas já preenchidas, nem mexe no funil', () => {
    expect(applyVuStatusChange(form({ status: 'CARTEIRA', dfat: '2026-10-01' }), 'FATURA', hoje).dfat).toBe('2026-10-01');
    expect(applyVuStatusChange(form({ status: 'FRIO' }), 'MORNO', hoje)).toMatchObject({ dt_fecho: '', dfat: '' });
  });
});

describe('validateVuForm', () => {
  it('exige estado', () => {
    expect(validateVuForm(form())).toMatch(/estado/i);
    expect(validateVuForm(form({ status: 'PERDIDO' }))).toMatch(/estado/i);
    expect(validateVuForm(form({ status: 'frio' }))).toBeNull();
  });
  it('uma fatura exige data de fatura', () => {
    expect(validateVuForm(form({ status: 'FATURA' }))).toMatch(/DFAT/);
    expect(validateVuForm(form({ status: 'FATURA', dfat: '2026-11-01' }))).toBeNull();
  });
});

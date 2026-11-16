import { describe, it, expect } from 'vitest';
import {
  isVuWipStatus, isVuFunilStatus, isVuFaturado, vuFormToDb, applyVuStatusChange, applyVuDfatChange, validateVuForm, EMPTY_VU_FORM, type VuForm,
} from '@/lib/control-records-vu';

const form = (p: Partial<VuForm> = {}): VuForm => ({ ...EMPTY_VU_FORM, ...p });

describe('status VU', () => {
  it('separa WIP (FATURA/CARTEIRA) e funil (FRIO/MORNO/QUENTE)', () => {
    expect(['RETAIL', 'FATURA', 'CARTEIRA'].every(isVuWipStatus)).toBe(true);
    expect(isVuFaturado('RETAIL') && isVuFaturado('FATURA')).toBe(true);
    expect(isVuFaturado('CARTEIRA') || isVuFaturado('FRIO')).toBe(false);
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
  it('ao passar a Retail regista também a data de fatura', () => {
    const f = applyVuStatusChange(form({ status: 'CARTEIRA', dt_fecho: '2026-11-02' }), 'RETAIL', hoje);
    expect(f).toMatchObject({ status: 'RETAIL', dt_fecho: '2026-11-02', dfat: '2026-11-16' });
  });
  it('nunca sobrescreve datas já preenchidas, nem mexe no funil', () => {
    expect(applyVuStatusChange(form({ status: 'CARTEIRA', dfat: '2026-10-01' }), 'RETAIL', hoje).dfat).toBe('2026-10-01');
    expect(applyVuStatusChange(form({ status: 'FRIO' }), 'MORNO', hoje)).toMatchObject({ dt_fecho: '', dfat: '' });
  });
});

describe('applyVuDfatChange — o retail coincide com a fatura', () => {
  const hoje = new Date(2026, 10, 16);
  it('associar a data de fatura passa a Retail, de qualquer estado', () => {
    for (const st of ['CARTEIRA', 'FRIO', 'MORNO', 'QUENTE']) {
      expect(applyVuDfatChange(form({ status: st }), '2026-11-10', hoje)).toMatchObject({ status: 'RETAIL', dfat: '2026-11-10' });
    }
  });
  it('vindo do funil regista a data de fecho (sem sobrescrever)', () => {
    expect(applyVuDfatChange(form({ status: 'QUENTE' }), '2026-11-10', hoje).dt_fecho).toBe('2026-11-16');
    expect(applyVuDfatChange(form({ status: 'QUENTE', dt_fecho: '2026-11-01' }), '2026-11-10', hoje).dt_fecho).toBe('2026-11-01');
  });
  it('mudar a data de um retail mantém o estado; um FATURA antigo também', () => {
    expect(applyVuDfatChange(form({ status: 'RETAIL', dfat: '2026-11-01' }), '2026-11-05', hoje).status).toBe('RETAIL');
    expect(applyVuDfatChange(form({ status: 'FATURA', dfat: '2026-11-01' }), '2026-11-05', hoje).status).toBe('FATURA');
  });
  it('apagar a data de um retail devolve-o à Carteira; noutros estados não mexe', () => {
    expect(applyVuDfatChange(form({ status: 'RETAIL', dfat: '2026-11-01' }), '', hoje)).toMatchObject({ status: 'CARTEIRA', dfat: '' });
    expect(applyVuDfatChange(form({ status: 'FRIO' }), '', hoje).status).toBe('FRIO');
  });
});

describe('validateVuForm', () => {
  it('exige estado', () => {
    expect(validateVuForm(form())).toMatch(/estado/i);
    expect(validateVuForm(form({ status: 'PERDIDO' }))).toMatch(/estado/i);
    expect(validateVuForm(form({ status: 'frio' }))).toBeNull();
  });
  it('um retail (ou fatura antiga) exige data de fatura', () => {
    expect(validateVuForm(form({ status: 'RETAIL' }))).toMatch(/DFAT/);
    expect(validateVuForm(form({ status: 'FATURA' }))).toMatch(/DFAT/);
    expect(validateVuForm(form({ status: 'RETAIL', dfat: '2026-11-01' }))).toBeNull();
  });
});

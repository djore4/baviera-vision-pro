import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ContratosPage from '@/pages/ContratosPage';
import { MANUTENCAO_BEV, MANUTENCAO_ICE, RI_CONTRATOS, RI_MODELOS } from '@/lib/contratos-data';
import { agruparManutencao, filtrarPorCodigo, fmtKm, fmtPreco, linhasDoModelo, precoDe } from '@/lib/contratos';
import { PERMISSION_TABS, TAB_BY_PATH } from '@/lib/permissions';

describe('dados dos contratos (ficheiros de 01/11/2026)', () => {
  it('tem a dimensão dos ficheiros originais e linhas alinhadas com os modelos', () => {
    expect(MANUTENCAO_ICE.linhas).toHaveLength(40);
    expect(MANUTENCAO_BEV.linhas).toHaveLength(15);
    expect(RI_CONTRATOS).toHaveLength(2);
    for (const t of [MANUTENCAO_ICE, MANUTENCAO_BEV]) {
      for (const l of t.linhas) {
        expect(l.sem).toHaveLength(t.modelos.length);
        expect(l.com).toHaveLength(t.modelos.length);
      }
    }
    for (const c of RI_CONTRATOS) expect(c.com).toHaveLength(RI_MODELOS.length);
  });

  it('valores conferem com os ficheiros (primeira linha ICE, BEV e RI)', () => {
    const ice = MANUTENCAO_ICE.linhas[0];
    expect([ice.codigo, ice.anos, ice.km, ice.intervalo]).toEqual(['07US', 3, 40000, '08KA']);
    expect(precoDe(ice, 0, 'sem')).toBe(442.35);
    expect(precoDe(ice, 0, 'com')).toBe(545);
    const bev = MANUTENCAO_BEV.linhas[0];
    expect([bev.codigo, bev.categoria, precoDe(bev, 0, 'com')]).toEqual(['U7JC', 'Next', 545]);
    expect([RI_CONTRATOS[0].codigo, RI_CONTRATOS[0].com[0], RI_CONTRATOS[1].com[1]]).toEqual(['07CH', 738, 3010]);
  });
});

describe('lib/contratos', () => {
  it('formata preços e km', () => {
    expect(fmtPreco(545)).toBe('545 €');
    expect(fmtPreco(442.35)).toBe('442,35 €');
    expect(fmtPreco(null)).toBe('—');
    expect(fmtKm(999999)).toBe('Sem limite');
  });

  it('esconde, por modelo, os contratos que o ficheiro deixa vazios (ex.: M2 sob 08KB)', () => {
    const m2 = MANUTENCAO_ICE.modelos.indexOf('M2');
    const l = linhasDoModelo(MANUTENCAO_ICE, m2, 'com');
    expect(l.length).toBeGreaterThan(0);
    expect(l.every(x => x.intervalo === '08KA')).toBe(true);
  });

  it('agrupa por tipo/categoria/intervalo e filtra por código sem distinguir maiúsculas', () => {
    expect(agruparManutencao(MANUTENCAO_ICE.linhas).map(s => s.titulo)).toEqual(['SI · B · 08KA', 'SI · B · 08KB', 'SI+ · S · 08KA', 'SI+ · S · 08KB']);
    expect(filtrarPorCodigo(MANUTENCAO_ICE.linhas, '07ng').map(l => l.codigo)).toEqual(['07NG', '07NG']);
  });
});

describe('tab Contratos', () => {
  it('está na secção Transversal e na matriz de permissões', () => {
    expect(TAB_BY_PATH['/contratos']?.area).toBe('apv');
    expect(PERMISSION_TABS.some(t => t.key === 'contratos')).toBe(true);
  });

  it('mostra o preço com IVA do modelo escolhido e alterna para sem IVA', () => {
    render(<ContratosPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Série 3/4' }));
    const linha = screen.getAllByText('07US')[0].closest('div')!.parentElement!;
    expect(within(linha).getByText('563 €')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'PVP sem IVA' }));
    expect(within(linha).getByText('457,65 €')).toBeTruthy();
  });

  it('pesquisa por código e mostra mensagem quando não há resultados', () => {
    render(<ContratosPage />);
    fireEvent.change(screen.getByLabelText('Pesquisar por código de opção'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Nenhum contrato com esse código.')).toBeTruthy();
  });

  it('mostra a extensão de garantia (RI)', () => {
    render(<ContratosPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Extensão de Garantia' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Extensão de Garantia' }));
    expect(screen.getByText('07CK')).toBeTruthy();
    expect(screen.getAllByText('4 anos / 200 000 km').length).toBeGreaterThan(0);
  });
});

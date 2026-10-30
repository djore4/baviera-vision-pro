import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { demoToRecordPatch, isDemoVehicle, demoLabel, type DemoVehicle } from '@/lib/demo-vehicles';
import { FunilBoard, type FunilRow } from '@/components/funil/FunilBoard';

const demo = (over: Partial<DemoVehicle> = {}): DemoVehicle => ({
  chassis: 'WBA12345678901234', matricula: 'aa00bb', modelo: 'Série 5', versao: '520d', encomenda: 'E123',
  data_matricula: '2026-03-10', tipologia: ['BEV'], marca: 'BMW', estado_negocio: 'VD', ...over,
});

describe('viaturas demo → negócio VD', () => {
  it('importa identificação, matrícula formatada e data de matrícula', () => {
    expect(demoToRecordPatch(demo())).toMatchObject({
      type: 'VD', model: 'Série 5', version: '520d', chas: 'WBA12345678901234',
      mat: 'AA-00-BB', enc: 'E123', dmat: '2026-03-10',
    });
  });

  it('BEV conta também como xEV; PHEV só xEV; ICE nenhum', () => {
    expect(demoToRecordPatch(demo({ tipologia: ['BEV'] }))).toMatchObject({ bev: 1, xev: 1 });
    expect(demoToRecordPatch(demo({ tipologia: ['PHEV'] }))).toMatchObject({ bev: 0, xev: 1 });
    expect(demoToRecordPatch(demo({ tipologia: ['ICE'] }))).toMatchObject({ bev: 0, xev: 0 });
  });

  it('lê as flags QoR e M e aceita tipologia em JSON', () => {
    expect(demoToRecordPatch(demo({ tipologia: '["M","QoR"]' }))).toMatchObject({ m: 1, qor: 1 });
  });

  it('campos em falta ficam vazios', () => {
    expect(demoToRecordPatch(demo({ matricula: null, encomenda: null, data_matricula: null })))
      .toMatchObject({ mat: '', enc: '', dmat: null });
  });

  it('exclui VU e motas da lista de demos', () => {
    expect(isDemoVehicle(demo())).toBe(true);
    expect(isDemoVehicle(demo({ estado_negocio: 'VU' }))).toBe(false);
    expect(isDemoVehicle(demo({ marca: 'BMW Motorrad' }))).toBe(false);
  });

  it('rótulo com modelo, versão, matrícula e chassis curto', () => {
    expect(demoLabel(demo())).toBe('Série 5 520d · AA-00-BB · 8901234');
  });
});

describe('Funil — editar negócio', () => {
  const rows: FunilRow[] = [{ id: 'abc', status: 'Quente', resp: 'JD', version: '520d', cliente: 'C1', obs: 'x' }];

  it('clicar numa linha chama onEdit com o id do registo', () => {
    const onEdit = vi.fn();
    render(<FunilBoard records={rows} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('520d'));
    expect(onEdit).toHaveBeenCalledWith('abc');
  });

  it('sem onEdit as linhas não são clicáveis', () => {
    render(<FunilBoard records={rows} />);
    expect(screen.getByText('520d').closest('tr')).not.toHaveClass('cursor-pointer');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ refresh: vi.fn(), data: null }) }));

import { RecordEditorProvider, useRecordEditor, ChoiceOrTypeField } from '@/components/RecordEditor';
import { modelOptions, versionOptions } from '@/lib/vehicle-options';
import { FunilBoard, type FunilRow } from '@/components/funil/FunilBoard';

const recs = [
  { model: 'X3', version: '20d' }, { model: 'X3', version: '30e' }, { model: 'X1', version: '18d' },
  { model: ' X3 ', version: '20d' }, { model: '', version: 'sem modelo' },
];

describe('opções de modelo e versão', () => {
  it('modelos únicos e ordenados, sem vazios', () => {
    expect(modelOptions(recs)).toEqual(['X1', 'X3']);
  });
  it('mantém o valor atual (registo antigo)', () => {
    expect(modelOptions(recs, 'Z4')).toEqual(['X1', 'X3', 'Z4']);
  });
  it('versões só do modelo escolhido', () => {
    expect(versionOptions(recs, 'X3')).toEqual(['20d', '30e']);
    expect(versionOptions(recs, 'X1')).toEqual(['18d']);
  });
  it('sem modelo mostra todas as versões', () => {
    expect(versionOptions(recs)).toEqual(['18d', '20d', '30e', 'sem modelo']);
  });
});

describe('ChoiceOrTypeField (modelo/versão)', () => {
  function Harness() {
    const [v, setV] = useState('');
    return <><ChoiceOrTypeField label="MODEL" inputLabel="Novo modelo" value={v} options={['X1', 'X3']} onChange={setV} /><output data-testid="v">{v}</output></>;
  }
  it('escolhe da lista ou escreve um novo, com espaços e minúsculas preservados', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('MODEL'), { target: { value: 'X3' } });
    expect(screen.getByTestId('v')).toHaveTextContent('X3');
    fireEvent.change(screen.getByLabelText('MODEL'), { target: { value: '__outro__' } });
    fireEvent.change(screen.getByLabelText('Novo modelo'), { target: { value: 'iX2 xDrive' } });
    expect(screen.getByTestId('v')).toHaveTextContent('iX2 xDrive');
  });
});

describe('Editor — escrever sem perder o foco', () => {
  function Opener() {
    const { openNew } = useRecordEditor();
    return <button onClick={() => openNew()}>abrir</button>;
  }
  it('o input do cliente mantém-se o mesmo elemento enquanto se escreve', () => {
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('abrir'));
    const input = screen.getByText('ID — Cliente').parentElement!.querySelector('input')!;
    input.focus();
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.change(input, { target: { value: 'Ab' } });
    const after = screen.getByText('ID — Cliente').parentElement!.querySelector('input')!;
    expect(after).toBe(input);
    expect(after).toHaveValue('Ab');
    expect(document.activeElement).toBe(input);
  });
});

describe('Funil — cabeçalho com Novo negócio', () => {
  const rows: FunilRow[] = [{ id: 'a', status: 'Frio', resp: 'JD', version: '520d', cliente: 'C1', obs: '' }];
  it('o botão ocupa a largura toda em mobile (w-full) e fica auto no desktop', () => {
    render(<FunilBoard records={rows} onNew={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Novo negócio/ });
    expect(btn).toHaveClass('w-full', 'sm:w-auto');
    expect(screen.getByText('Funil de vendas')).toBeInTheDocument();
    expect(screen.getByText('1 negócio')).toBeInTheDocument();
  });
});

describe('Editor — ordem dos campos do veículo', () => {
  function Opener() {
    const { openNew } = useRecordEditor();
    return <button onClick={() => openNew()}>abrir</button>;
  }
  it('a encomenda aparece antes da matrícula', () => {
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('abrir'));
    const enc = screen.getByText('ENC — Encomenda');
    const mat = screen.getByText('MAT — Matrícula');
    expect(enc.compareDocumentPosition(mat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

import { hojeIso } from '@/components/RecordEditor';

describe('Editor — campos do ficheiro e data 298', () => {
  function Opener() {
    const { openNew } = useRecordEditor();
    return <button onClick={() => openNew()}>abrir</button>;
  }
  const open = () => {
    render(<RecordEditorProvider><Opener /></RecordEditorProvider>);
    fireEvent.click(screen.getByText('abrir'));
  };
  const input = (label: string) => screen.getByText(label).parentElement!.querySelector('input')!;

  it('tem BIZ, CSC, CME e DFAT', () => {
    open();
    ['BIZ — Bizagi', 'CSC', 'CME', 'DFAT — Data da fatura'].forEach(l => expect(screen.getByText(l)).toBeInTheDocument());
  });

  it('hojeIso devolve o dia local em AAAA-MM-DD', () => {
    expect(hojeIso(new Date(2026, 9, 31, 23, 59))).toBe('2026-10-31');
    expect(hojeIso(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });

  it('ao passar a Retail a data 298 fica a data de hoje e continua editável', () => {
    open();
    expect(input('298 — Retail / Entrega cliente')).toHaveValue('');
    fireEvent.change(screen.getByText('STATUS').parentElement!.querySelector('select')!, { target: { value: 'Retail' } });
    expect(input('298 — Retail / Entrega cliente')).toHaveValue(hojeIso());
    fireEvent.change(input('298 — Retail / Entrega cliente'), { target: { value: '2026-10-15' } });
    expect(input('298 — Retail / Entrega cliente')).toHaveValue('2026-10-15');
  });

  it('sempre que o estado muda para Retail, a 298 passa a hoje (mesmo com valor anterior)', () => {
    open();
    const status = screen.getByText('STATUS').parentElement!.querySelector('select')!;
    fireEvent.change(input('298 — Retail / Entrega cliente'), { target: { value: '2026-01-02' } });
    fireEvent.change(status, { target: { value: 'Retail' } });
    expect(input('298 — Retail / Entrega cliente')).toHaveValue(hojeIso());
  });

  it('outras mudanças de estado não mexem na 298', () => {
    open();
    const status = screen.getByText('STATUS').parentElement!.querySelector('select')!;
    fireEvent.change(status, { target: { value: 'Carteira' } });
    expect(input('298 — Retail / Entrega cliente')).toHaveValue('');
  });
});

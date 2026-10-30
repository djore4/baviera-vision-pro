import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ refresh: vi.fn(), data: null }) }));

import { ResponsavelField } from '@/components/RecordEditor';
import { vendedorInitials } from '@/lib/team';

describe('vendedorInitials', () => {
  const recs = [{ resp: 'nc' }, { resp: 'FS' }, { resp: 'NC' }, { resp: ' br ' }, { resp: '' }, { resp: 'TS' }];

  it('únicas, em maiúsculas, ordenadas e sem vazios', () => {
    expect(vendedorInitials(recs.filter(r => r.resp !== 'TS'))).toEqual(['BR', 'FS', 'NC']);
  });

  it('exclui elementos que já saíram da equipa', () => {
    expect(vendedorInitials(recs)).not.toContain('TS');
  });

  it('mantém o valor atual mesmo que tenha saído (registo antigo)', () => {
    expect(vendedorInitials(recs, 'TS')).toContain('TS');
  });
});

describe('ResponsavelField', () => {
  function Harness({ initial = '' }: { initial?: string }) {
    const [v, setV] = useState(initial);
    return <><ResponsavelField value={v} options={['AL', 'JD']} onChange={setV} /><output data-testid="v">{v}</output></>;
  }

  it('escolhe as iniciais na lista', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('RESP — Vendedor'), { target: { value: 'JD' } });
    expect(screen.getByTestId('v')).toHaveTextContent('JD');
  });

  it('"Outro…" permite escrever, em maiúsculas e sem espaços', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('RESP — Vendedor'), { target: { value: '__outro__' } });
    fireEvent.change(screen.getByLabelText('Iniciais do vendedor'), { target: { value: 'x y' } });
    expect(screen.getByTestId('v')).toHaveTextContent('XY');
  });

  it('o campo de texto só aparece em "Outro…"', () => {
    render(<Harness initial="AL" />);
    expect(screen.queryByLabelText('Iniciais do vendedor')).toBeNull();
  });
});

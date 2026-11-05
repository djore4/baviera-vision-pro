import { describe, it, expect, vi } from 'vitest';

const update = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ update: (...a: unknown[]) => update(...a) }) },
}));

import { gravarAlteracoes, lerCaixa, paraRegistosVN, planear } from '@/lib/email-sync-browser';
import type { ControlRecord } from '@/types/data';

const cel = (v: string) => `<td><p>${v}</p></td>`;
const lin = (...v: string[]) => `<tr>${v.map(cel).join('')}</tr>`;
const DIARIO = `<table><tbody>${lin('Nº Encomenda', 'NºChassis', 'Line', 'Matrícula', 'Data Matrícula')}
  ${lin('9710001', 'WBA71BX0X07W88199', '220i', 'AA26BB', '02/11/2026', 'Cliente Um', 'NC')}</tbody></table>`;

const msg = (id: string, subject: string, from: string, body = '', recebido = '2026-11-03T08:00:00Z') =>
  ({ id, subject, receivedDateTime: recebido, from: { emailAddress: { address: from } }, body: { content: body } });

/** Graph falso: 2 páginas de lista + o HTML do email diário. */
function graphFalso(extra: Record<string, unknown> = {}) {
  const chamadas: { url: string; prefer: string }[] = [];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const prefer = String((init?.headers as Record<string, string>)?.Prefer ?? '');
    chamadas.push({ url, prefer });
    if (url.includes('/me/messages/')) return new Response(JSON.stringify({ body: { content: DIARIO } }), { status: 200 });
    if (url.includes('page2')) {
      return new Response(JSON.stringify({ value: [msg('3', 'Matriculas - Aveiro', 'Alexandre.Ferreira@Caetano.pt')] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      value: [
        msg('1', 'Pedido de matrícula | Cliente Um', 'consultor@x.pt', 'Cliente: Cliente Um\nEncomenda: 9710001'),
        msg('2', 'Reunião de equipa', 'chefe@x.pt', 'nada a ver'),
        msg('4', 'Matriculas - Aveiro', 'estranho@x.pt', 'spam'),
      ],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/page2',
    }), { status: 200 });
  }) as unknown as typeof fetch;
  void extra;
  return { f, chamadas };
}

describe('lerCaixa', () => {
  it('só traz conversas de matrícula, segue as páginas e lê o HTML dos diários do remetente certo', async () => {
    const { f, chamadas } = graphFalso();
    const r = await lerCaixa('tok', 30, ['alexandre.ferreira@caetano.pt'], f, Date.parse('2026-11-04T10:00:00Z'));
    expect(r.mensagens.map(m => m.id)).toEqual(['1', '4', '3']);          // "Reunião" ficou de fora
    expect(r.diarios.map(d => d.id)).toEqual(['3']);                       // o remetente "estranho" não conta
    expect(r.diarios[0].html).toContain('9710001');
    expect(chamadas[0].url).toContain('/me/mailFolders/inbox/messages');
    expect(chamadas[0].url).toContain(encodeURIComponent('receivedDateTime ge 2026-10-05'));
    expect(chamadas[0].prefer).toContain('"text"');
    expect(chamadas.at(-1)?.prefer).toContain('"html"');
  });

  it('sem remetentes indicados aceita qualquer remetente', async () => {
    const r = await lerCaixa('tok', 30, [], graphFalso().f);
    expect(r.diarios.map(d => d.id).sort()).toEqual(['3', '4']);
  });

  it('401, 403 e outros erros dão mensagens claras', async () => {
    const com = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(lerCaixa('t', 7, [], com(401))).rejects.toThrow(/recusou/);
    await expect(lerCaixa('t', 7, [], com(403))).rejects.toThrow(/bloqueado/);
    await expect(lerCaixa('t', 7, [], com(500))).rejects.toThrow(/\(500\)/);
  });
});

describe('plano e gravação', () => {
  const rec = (o: Partial<ControlRecord>): ControlRecord => ({
    id: 'r1', status: 'Carteira', enc: '9710001', cliente: 'Cliente Um', chas: '', mat: '', biz: '', dmat: null, matPedidaEm: null, ...o,
  } as ControlRecord);

  it('só considera Carteira/Matrícula e converte as datas', () => {
    const regs = paraRegistosVN([rec({}), rec({ id: 'r2', status: 'Retail' }), rec({ id: undefined }), rec({ id: 'r3', status: 'Matricula', dmat: new Date(2026, 10, 2, 0, 5), matPedidaEm: new Date('2026-11-02T17:00:00Z') })]);
    expect(regs.map(r => r.id)).toEqual(['r1', 'r3']);
    expect(regs[1]).toMatchObject({ dmat: '2026-11-02', mat_pedida_em: '2026-11-02T17:00:00.000Z' });
  });

  it('o email diário gera a pré-visualização e as alterações', () => {
    const { previa, alteracoes } = planear([], [{ id: 'd', recebidaEm: '2026-11-03T08:00:00Z', html: DIARIO }], paraRegistosVN([rec({})]));
    expect(alteracoes).toEqual([{ id: 'r1', mat: 'AA-26-BB', chas: 'WBA71BX0X07W88199', dmat: '2026-11-02' }]);
    expect(previa).toMatchObject({ matriculas: 1, chassis: 1, datas: 1, totalIgnoradas: 0 });
    expect(previa.detalhes[0].campos.map(c => c.campo)).toEqual(['Matrícula', 'Chassis', 'DMAT']);
  });

  it('gravarAlteracoes conta o que pegou e o que falhou', async () => {
    const q = (r: unknown) => ({ eq: () => ({ in: () => ({ select: async () => r }) }) });
    update
      .mockReturnValueOnce(q({ data: [{ id: 'a' }], error: null }))
      .mockReturnValueOnce(q({ data: [], error: null }))
      .mockReturnValueOnce(q({ data: null, error: { message: 'rls' } }));
    const r = await gravarAlteracoes([{ id: 'a', mat: 'AA-00-BB' }, { id: 'b', mat: 'CC-00-DD' }, { id: 'c', mat: 'EE-00-FF' }]);
    expect(r.aplicadas).toBe(1);
    expect(r.falhadas).toEqual(['o registo mudou entretanto', 'rls']);
    expect(update).toHaveBeenNthCalledWith(1, { mat: 'AA-00-BB' });          // o id não vai no update
  });
});

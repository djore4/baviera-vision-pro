/**
 * Sincronização VN lendo o email no PRÓPRIO browser (Microsoft Graph, permissão delegada
 * Mail.Read, caixa de quem iniciou sessão). Os emails não passam por nenhum servidor nosso:
 * lêem-se aqui, aplicam-se as regras partilhadas e só os campos atualizados vão para a base.
 *
 * As regras (ler a tabela diária, "matrícula pedida", emparelhar, nunca sobrescrever) são as
 * mesmas da edge function: ver supabase/functions/_shared/matriculas-email.ts.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  aplicarAlteracoes, detalhar, ehEmailDiario, juntarAlteracoes, processar, processarDiarios,
  type Alteracao, type Detalhe, type Diario, type Mensagem, type RegistoVN,
} from '../../supabase/functions/_shared/matriculas-email';
import type { ControlRecord } from '@/types/data';
import { toLocalIsoDay } from '@/lib/utils';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAX_MENSAGENS = 600;
const MAX_HTML = 300_000;

export interface PreviaSync {
  mensagens: number; pedidas: number; matriculas: number; chassis: number; datas: number;
  totalIgnoradas: number; ignoradas: { assunto: string; motivo: string }[];
  detalhes: Detalhe[];
}

type Fetch = typeof fetch;
interface GraphMsg {
  id: string; subject?: string; receivedDateTime: string;
  from?: { emailAddress?: { address?: string } }; body?: { content?: string };
}

async function graph(url: string, token: string, corpo: 'text' | 'html', f: Fetch): Promise<Record<string, unknown>> {
  const r = await f(url, { headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.body-content-type="${corpo}"` } });
  if (r.status === 401) throw new Error('A Microsoft recusou o acesso ao email. Tenta sincronizar outra vez.');
  if (r.status === 403) throw new Error('Sem permissão para ler o email: a tua organização pode ter bloqueado esta app.');
  if (!r.ok) throw new Error(`Não foi possível ler o email (${r.status}).`);
  return r.json();
}

/**
 * Lê da Caixa de Entrada (últimos `dias`) as conversas de matrícula e, à parte, o HTML dos
 * emails diários "Matriculas - Aveiro" (de `remetentes`, se indicados).
 */
export async function lerCaixa(token: string, dias: number, remetentes: string[] = [], f: Fetch = fetch, agora = Date.now()): Promise<{ mensagens: Mensagem[]; diarios: Diario[] }> {
  const desde = new Date(agora - dias * 86400000).toISOString();
  let url: string | null = `${GRAPH}/me/mailFolders/inbox/messages`
    + `?$filter=${encodeURIComponent(`receivedDateTime ge ${desde}`)}&$orderby=${encodeURIComponent('receivedDateTime desc')}`
    + `&$select=id,subject,receivedDateTime,from,body&$top=50`;
  const mensagens: Mensagem[] = [];
  while (url && mensagens.length < MAX_MENSAGENS) {
    const j = await graph(url, token, 'text', f);
    for (const m of (j.value as GraphMsg[] | undefined) ?? []) {
      const assunto = String(m.subject ?? '');
      if (!/matr[ií]cula/i.test(assunto.normalize('NFC'))) continue;
      mensagens.push({
        id: m.id, assunto, corpo: String(m.body?.content ?? ''), recebidaEm: m.receivedDateTime,
        de: String(m.from?.emailAddress?.address ?? '').toLowerCase(),
      });
    }
    url = (j['@odata.nextLink'] as string | undefined) ?? null;
  }

  const aceites = remetentes.map(s => s.trim().toLowerCase()).filter(Boolean);
  const diarios: Diario[] = [];
  for (const m of mensagens.filter(x => ehEmailDiario(x.assunto) && (aceites.length === 0 || aceites.includes(x.de ?? '')))) {
    const j = await graph(`${GRAPH}/me/messages/${encodeURIComponent(m.id)}?$select=body`, token, 'html', f);
    diarios.push({ id: m.id, recebidaEm: m.recebidaEm, html: String((j.body as { content?: string } | undefined)?.content ?? '').slice(0, MAX_HTML) });
  }
  return { mensagens, diarios };
}

/** Registos VN (Carteira/Matrícula) no formato das regras partilhadas. */
export function paraRegistosVN(control: ControlRecord[]): RegistoVN[] {
  return control
    .filter((r): r is ControlRecord & { id: string } => !!r.id && (r.status === 'Carteira' || r.status === 'Matricula'))
    .map(r => ({
      id: r.id, cliente: r.cliente || null, enc: r.enc || null, chas: r.chas || null, mat: r.mat || null, status: r.status,
      mat_pedida_em: r.matPedidaEm ? r.matPedidaEm.toISOString() : null,
      dmat: r.dmat ? toLocalIsoDay(r.dmat) : null,
    }));
}

/** Aplica as regras ao que se leu e devolve o plano (ainda nada gravado). */
export function planear(mensagens: Mensagem[], diarios: Diario[], registos: RegistoVN[]): { previa: PreviaSync; alteracoes: Alteracao[] } {
  const res = processar(mensagens.filter(m => !ehEmailDiario(m.assunto)), registos);
  const rd = processarDiarios(diarios, aplicarAlteracoes(registos, res.alteracoes));
  const alteracoes = juntarAlteracoes(res.alteracoes, rd.alteracoes);
  const ignoradas = [...res.ignoradas, ...rd.ignoradas];
  return {
    alteracoes,
    previa: {
      mensagens: mensagens.length, pedidas: res.pedidas, matriculas: res.matriculas + rd.matriculas,
      chassis: rd.chassis, datas: rd.datas, totalIgnoradas: ignoradas.length, ignoradas: ignoradas.slice(0, 20),
      detalhes: detalhar(alteracoes, registos).slice(0, 200),
    },
  };
}

/** Grava as alterações confirmadas. Só pega em registos ainda por entregar (Carteira/Matrícula). */
export async function gravarAlteracoes(alteracoes: Alteracao[]): Promise<{ aplicadas: number; falhadas: string[] }> {
  let aplicadas = 0;
  const falhadas: string[] = [];
  for (const a of alteracoes) {
    const { id, ...campos } = a;
    const { data, error } = await supabase.from('control_records').update(campos).eq('id', id).in('status', ['Carteira', 'Matricula']).select('id');
    if (error) falhadas.push(error.message);
    else if (!data || data.length === 0) falhadas.push('o registo mudou entretanto');
    else aplicadas++;
  }
  return { aplicadas, falhadas };
}

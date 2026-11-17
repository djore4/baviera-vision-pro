import { supabase } from '@/integrations/supabase/client';
import type { ControlRecord } from '@/types/data';
import { isRetailType } from '@/lib/viaturas';
import { chassisKey, type EntradasParque } from '@/lib/lead-time-entrega';
import { isNotificationVisible, type Notification } from '@/lib/notifications';

/* ── Painel do vendedor ──────────────────────────────────────────────────────
 * Ecrã inicial: o que está pendente e o que merece atenção HOJE. Tudo aqui é
 * calculado a partir dos dados que a app já tem (control_records, entradas em
 * parque) mais o registo de eventos `painel_eventos` (reduções de preço e
 * prémios, que o estado atual não permite deduzir). Funções puras: a página só
 * as chama e desenha. Os limiares estão em PRAZOS para se afinarem num só sítio.
 * ──────────────────────────────────────────────────────────────────────────── */

export const PRAZOS = {
  /** Matriculada e em parque há mais de N dias sem certificado de entrega. */
  certificadoDias: 2,
  /** Negócio fechado há N dias ou mais sem número Bizagi. */
  bizagiDias: 15,
  /** BEV fechado há N dias ou mais sem chassis associado → sugerir Lead CME. */
  bevCmeDias: 30,
  /** Quanto tempo uma redução de preço fica em destaque. */
  reducaoPrecoDias: 3,
  /** Quanto tempo um prémio de venda novo fica em destaque. */
  premioDias: 7,
  /** Em parque sem matrícula pedida: a partir daqui é urgente. */
  parqueUrgenteDias: 3,
  /** Entrega prevista este mês: avisa quando faltam N dias (ou menos) para o fim do mês. */
  fimMesDias: 7,
  /** Entrega em atraso há mais de N dias (desde o fim do mês previsto) é urgente. */
  atrasoUrgenteDias: 30,
} as const;

/** Mesmos critérios do tab Pendentes (BIZAGI): só negócios de 2026 em diante e sem o resp 'JD'. */
export const BIZAGI_DESDE = new Date(2026, 0, 1);
export const BIZAGI_RESP_EXCLUIDO = 'JD';

export type RegraId =
  | 'parque-sem-matricula'
  | 'matriculado-sem-certificado'
  | 'financiamento-bmw'
  | 'sem-bizagi'
  | 'bev-lead-cme'
  | 'entrega-atrasada'
  | 'entrega-fim-mes'
  | 'reducao-preco'
  | 'premio-venda';

export type Severidade = 'alta' | 'media' | 'info';

export interface RegraDef {
  id: RegraId;
  titulo: string;
  /** Uma frase: o que se pede à pessoa. */
  acao: string;
  /** Quem deve agir. */
  para: string;
  base: Severidade;
}

export const REGRAS: Record<RegraId, RegraDef> = {
  'parque-sem-matricula': {
    id: 'parque-sem-matricula', base: 'alta', para: 'Vendedor',
    titulo: 'Em parque sem matrícula pedida',
    acao: 'A viatura já está em parque e a matrícula ainda não foi pedida.',
  },
  'matriculado-sem-certificado': {
    id: 'matriculado-sem-certificado', base: 'alta', para: 'Vendedor',
    titulo: 'Matriculadas em parque sem certificado de entrega',
    acao: `Em parque, matriculada há mais de ${PRAZOS.certificadoDias} dias e sem certificado de entrega.`,
  },
  'financiamento-bmw': {
    id: 'financiamento-bmw', base: 'info', para: 'Vendedor · Financeiro',
    titulo: 'Oportunidade de financiamento BMW',
    acao: 'Carteira com pagamento PP ou sem informação: propor um contrato de financiamento BMW.',
  },
  'sem-bizagi': {
    id: 'sem-bizagi', base: 'media', para: 'Vendedor',
    titulo: 'Negócio fechado sem Bizagi',
    acao: `Fechado há ${PRAZOS.bizagiDias} dias ou mais e sem número Bizagi associado.`,
  },
  'bev-lead-cme': {
    id: 'bev-lead-cme', base: 'media', para: 'Vendedor',
    titulo: 'BEV sem chassis: abrir Lead CME?',
    acao: `Fechado há ${PRAZOS.bevCmeDias} dias ou mais e ainda sem chassis: sugerir a abertura de uma Lead CME.`,
  },
  'entrega-atrasada': {
    id: 'entrega-atrasada', base: 'media', para: 'Vendedor',
    titulo: 'Entrega prevista em atraso',
    acao: 'O mês previsto de entrega já passou e a viatura ainda não foi entregue: entregar ou reagendar.',
  },
  'entrega-fim-mes': {
    id: 'entrega-fim-mes', base: 'media', para: 'Vendedor',
    titulo: 'Entrega este mês sem matrícula pedida',
    acao: `Entrega prevista para este mês, faltam ${PRAZOS.fimMesDias} dias ou menos e a matrícula ainda não foi pedida.`,
  },
  'reducao-preco': {
    id: 'reducao-preco', base: 'info', para: 'Todos',
    titulo: 'Redução de PVP (Demos e Stock)',
    acao: `Preço baixou nos últimos ${PRAZOS.reducaoPrecoDias} dias.`,
  },
  'premio-venda': {
    id: 'premio-venda', base: 'info', para: 'Todos',
    titulo: 'Prémios de venda novos',
    acao: `Prémio de venda acrescentado nos últimos ${PRAZOS.premioDias} dias.`,
  },
};

/** Ordem de apresentação dos grupos (o que exige ação primeiro, as notas informativas no fim). */
export const ORDEM_REGRAS: RegraId[] = [
  'parque-sem-matricula', 'matriculado-sem-certificado', 'sem-bizagi', 'bev-lead-cme',
  'entrega-atrasada', 'entrega-fim-mes',
  'financiamento-bmw', 'reducao-preco', 'premio-venda',
];

export interface AlertaItem {
  /** Estável: serve de key e de chave de "feito". */
  id: string;
  regra: RegraId;
  severidade: Severidade;
  titulo: string;
  detalhe: string;
  resp: string | null;
  /** Dias que a situação dura (null = não se sabe, p. ex. viatura que já estava em parque antes do registo). */
  dias: number | null;
  /** Para abrir o registo (control_records.id), quando há. */
  recordId?: string;
  /** O registo de origem (para as ações do vendedor). */
  registo?: ControlRecord;
  /** Substitui o contador de dias (p. ex. "faltam 3 d"). */
  chip?: string;
  /** Dias que FALTAM (regras com prazo a contar para o fim); ordena do mais perto para o mais longe. */
  restam?: number;
  /** Rótulo livre à direita (p. ex. "−1.500 €"). */
  nota?: string;
}

export interface AlertaGrupo {
  regra: RegraDef;
  itens: AlertaItem[];
  urgentes: number;
}

/* ── Datas ─────────────────────────────────────────────────────────────────── */

const DAY = 24 * 60 * 60 * 1000;
const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Dias de calendário entre `d` e `hoje` (0 = hoje). Nunca negativo. */
export function diasDesde(d: Date | null | undefined, hoje: Date): number | null {
  if (!d || isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((inicioDoDia(hoje).getTime() - inicioDoDia(d).getTime()) / DAY));
}

export const mesmoDia = (a: Date | null | undefined, b: Date) =>
  !!a && inicioDoDia(a).getTime() === inicioDoDia(b).getTime();

/* ── Regras sobre control_records ──────────────────────────────────────────── */

/** Mesma regra do filtro "Em parque" (ExtraFilters.isParked), sem importar a UI. */
const emParque = (r: ControlRecord) => r.week198.toUpperCase().includes('P') && r.status !== 'Retail';
const ABERTO = new Set(['Carteira', 'Matricula']);          // fechado e ainda por entregar
const FECHADO = new Set(['Carteira', 'Matricula', 'Retail']); // negócio fechado (carteira ou além)

const descVeiculo = (r: ControlRecord) =>
  [r.model, r.version].map(s => s.trim()).filter(Boolean).join(' ') || 'Viatura';
const descCliente = (r: ControlRecord) => r.cliente.trim() || 'sem cliente';
const chassiCurto = (r: ControlRecord) => (r.chas.trim() ? `…${r.chas.trim().slice(-7)}` : 'sem chassis');

const maisAntigoPrimeiro = (a: AlertaItem, b: AlertaItem) => {
  if (a.dias === null && b.dias === null) return a.titulo.localeCompare(b.titulo, 'pt');
  if (a.dias === null) return 1;
  if (b.dias === null) return -1;
  return b.dias - a.dias;
};

export interface ContextoPainel {
  hoje: Date;
  /** Datas de entrada em parque; null = migração por aplicar. */
  entradas: EntradasParque | null;
  /** Eventos de preço/prémio; vazio se a migração ainda não foi aplicada. */
  eventos: EventoPainel[];
  /** Avisos a que já se deu baixa: `${regra}:${id do registo}` (ver chaveBaixa). */
  baixas?: Set<string>;
  /** Só os negócios deste comercial (iniciais); null = todos. Os eventos de Demos/Stock não têm dono. */
  resp: string | null;
}

/** Chave de uma baixa: a regra e o registo (control_records.id). */
export const chaveBaixa = (regra: RegraId | string, recordId: string | undefined) => `${regra}:${recordId ?? ''}`;

/** Último dia do mês previsto ('AAAA/MM'), ou null se o mês não estiver definido. */
function fimDoMes(mes1: string): Date | null {
  const m = mes1.trim().match(/^(\d{4})\/(\d{1,2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]), 0) : null;
}

export function calcAlertas(control: ControlRecord[], ctx: ContextoPainel): AlertaGrupo[] {
  const { hoje, entradas } = ctx;
  const meus = ctx.resp ? control.filter(r => r.resp === ctx.resp) : control;
  const out: Record<RegraId, AlertaItem[]> = {
    'parque-sem-matricula': [], 'matriculado-sem-certificado': [], 'financiamento-bmw': [],
    'sem-bizagi': [], 'bev-lead-cme': [], 'entrega-atrasada': [], 'entrega-fim-mes': [],
    'reducao-preco': [], 'premio-venda': [],
  };
  const baixado = (regra: RegraId, r: ControlRecord) => !!r.id && !!ctx.baixas?.has(chaveBaixa(regra, r.id));
  const entradaDe = (r: ControlRecord) => entradas?.get(chassisKey(r.chas)) ?? null;

  for (const r of meus) {
    const resp = r.resp || null;
    const base = { resp, recordId: r.id, registo: r };

    // 1. Em parque, sem matrícula pedida (nem matriculada, nem email "matrícula pedida" recebido).
    if (emParque(r) && !r.mat.trim() && !r.matPedidaEm && !baixado('parque-sem-matricula', r)) {
      const dias = diasDesde(entradaDe(r), hoje);
      out['parque-sem-matricula'].push({
        ...base, id: `parque:${r.id ?? r.chas}`, regra: 'parque-sem-matricula',
        severidade: dias === null || dias >= PRAZOS.parqueUrgenteDias ? 'alta' : 'media',
        titulo: descVeiculo(r), detalhe: `${descCliente(r)} · ${chassiCurto(r)}`, dias,
      });
    }

    // 2. Matriculada, em parque e sem certificado de entrega (data 298) há mais de N dias.
    //    O relógio é o mais recente entre a matrícula e a entrada em parque (só conta quando as duas coisas se verificam).
    if (emParque(r) && r.mat.trim() && !r.date298) {
      const datas = [r.dmat, entradaDe(r)].filter((d): d is Date => !!d);
      const ref = datas.length ? new Date(Math.max(...datas.map(d => d.getTime()))) : null;
      const dias = diasDesde(ref, hoje);
      if (dias === null || dias > PRAZOS.certificadoDias) {
        out['matriculado-sem-certificado'].push({
          ...base, id: `cert:${r.id ?? r.chas}`, regra: 'matriculado-sem-certificado',
          severidade: dias === null || dias >= PRAZOS.certificadoDias * 2 ? 'alta' : 'media',
          titulo: descVeiculo(r), detalhe: `${descCliente(r)} · ${r.mat.trim()}`, dias,
        });
      }
    }

    // 3. Carteira com pagamento PP ou sem informação → financiamento BMW.
    if (ABERTO.has(r.status) && isRetailType(r.type)) {
      const fin = r.fin.trim().toUpperCase();
      if ((fin === '' || fin === 'PP') && !baixado('financiamento-bmw', r)) {
        out['financiamento-bmw'].push({
          ...base, id: `fin:${r.id ?? r.chas}`, regra: 'financiamento-bmw', severidade: 'info',
          titulo: descVeiculo(r), detalhe: descCliente(r), dias: diasDesde(r.neg, hoje),
          nota: fin === 'PP' ? 'PP' : 'sem info',
        });
      }
    }

    // 4. Negócio fechado há N dias ou mais sem número Bizagi.
    const diasNeg = diasDesde(r.neg, hoje);
    if (
      FECHADO.has(r.status) && !r.biz.trim() && r.neg && r.neg >= BIZAGI_DESDE &&
      r.resp !== BIZAGI_RESP_EXCLUIDO && diasNeg !== null && diasNeg >= PRAZOS.bizagiDias
    ) {
      out['sem-bizagi'].push({
        ...base, id: `bizagi:${r.id ?? r.chas}`, regra: 'sem-bizagi',
        severidade: diasNeg >= PRAZOS.bizagiDias * 2 ? 'alta' : 'media',
        titulo: descVeiculo(r), detalhe: descCliente(r), dias: diasNeg,
      });
    }

    // 5. BEV fechado há 30+ dias, ainda sem chassis → sugerir Lead CME.
    if (r.bev === 1 && ABERTO.has(r.status) && !r.chas.trim() && diasNeg !== null && diasNeg >= PRAZOS.bevCmeDias && !baixado('bev-lead-cme', r)) {
      out['bev-lead-cme'].push({
        ...base, id: `cme:${r.id ?? r.enc}`, regra: 'bev-lead-cme', severidade: 'media',
        titulo: descVeiculo(r), detalhe: `${descCliente(r)}${r.enc.trim() ? ` · enc. ${r.enc.trim()}` : ''}`, dias: diasNeg,
      });
    }

    // 8/9. Entregas por confirmar (o mês previsto, MÊS1, só tem precisão de mês).
    if (ABERTO.has(r.status) && isRetailType(r.type)) {
      const fim = fimDoMes(r.mes1);
      if (fim) {
        const hojeIni = inicioDoDia(hoje);
        if (fim < hojeIni) {
          const atraso = diasDesde(fim, hoje) ?? 0;
          if (!baixado('entrega-atrasada', r)) out['entrega-atrasada'].push({
            ...base, id: `atraso:${r.id ?? r.chas}`, regra: 'entrega-atrasada',
            severidade: atraso >= PRAZOS.atrasoUrgenteDias ? 'alta' : 'media',
            titulo: descVeiculo(r), detalhe: `${descCliente(r)} · previsto ${r.mes1.trim()}`, dias: atraso,
          });
        } else if (
          fim.getTime() - hojeIni.getTime() <= PRAZOS.fimMesDias * DAY &&
          !r.mat.trim() && !r.matPedidaEm && !emParque(r) && !baixado('entrega-fim-mes', r)
        ) {
          const restam = Math.round((fim.getTime() - hojeIni.getTime()) / DAY);
          out['entrega-fim-mes'].push({
            ...base, id: `fimmes:${r.id ?? r.chas}`, regra: 'entrega-fim-mes',
            severidade: restam <= 2 ? 'alta' : 'media',
            titulo: descVeiculo(r), detalhe: `${descCliente(r)} · previsto ${r.mes1.trim()}`, dias: null,
            restam, chip: restam === 0 ? 'último dia' : `faltam ${restam} d`,
          });
        }
      }
    }
  }

  // 6/7. Eventos (preço e prémio) dentro da janela de cada um.
  for (const e of ctx.eventos) {
    const dias = diasDesde(new Date(e.created_at), hoje);
    if (dias === null) continue;
    const origem = e.origem === 'stock' ? 'Stock' : 'Demo';
    if (e.tipo === 'preco_reducao' && dias < PRAZOS.reducaoPrecoDias) {
      const antes = e.valor_antes ?? 0, depois = e.valor_depois ?? 0;
      out['reducao-preco'].push({
        id: `preco:${e.id}`, regra: 'reducao-preco', severidade: 'info', resp: null, dias,
        titulo: e.descricao?.trim() || (e.origem === 'stock' ? 'Viatura de stock' : 'Demo'),
        detalhe: `${origem} · ${eur(antes)} → ${eur(depois)}`,
        nota: `−${eur(antes - depois)}`,
      });
    }
    if (e.tipo === 'premio' && dias < PRAZOS.premioDias) {
      out['premio-venda'].push({
        id: `premio:${e.id}`, regra: 'premio-venda', severidade: 'info', resp: null, dias,
        titulo: e.descricao?.trim() || 'Demo',
        detalhe: e.valor_antes ? `Prémio ${eur(e.valor_antes)} → ${eur(e.valor_depois ?? 0)}` : `Prémio de ${eur(e.valor_depois ?? 0)}`,
        nota: eur(e.valor_depois ?? 0),
      });
    }
  }

  return ORDEM_REGRAS.map(id => {
    const itens = out[id].sort(
      id === 'reducao-preco' || id === 'premio-venda' ? (a, b) => (a.dias ?? 0) - (b.dias ?? 0)   // eventos: o mais recente primeiro
      : id === 'entrega-fim-mes' ? (a, b) => (a.restam ?? 0) - (b.restam ?? 0)                    // o prazo mais curto primeiro
      : maisAntigoPrimeiro);
    return { regra: REGRAS[id], itens, urgentes: itens.filter(i => i.severidade === 'alta').length };
  });
}

const eur = (n: number) => `${Math.round(n).toLocaleString('pt-PT')} €`;

/** As tarefas que pedem ação (exclui as informativas), as mais urgentes e antigas primeiro. */
export function principaisTarefas(grupos: AlertaGrupo[], max = 6): AlertaItem[] {
  const rank: Record<Severidade, number> = { alta: 0, media: 1, info: 2 };
  return grupos
    .flatMap(g => g.itens)
    .filter(i => i.severidade !== 'info')
    .sort((a, b) => rank[a.severidade] - rank[b.severidade] || maisAntigoPrimeiro(a, b))
    .slice(0, max);
}

/* ── Resumo do dia ─────────────────────────────────────────────────────────── */

export interface ResumoDia {
  negociosHoje: number;
  entregasHoje: number;
  matriculasHoje: number;
  emParque: number;
  carteira: number;
}

export type TileKey = 'negocios' | 'matriculas' | 'entregas' | 'parque' | 'carteira';

/** As viaturas por trás de cada número do resumo do dia (a mesma regra dos totais). */
export function calcDetalheDia(control: ControlRecord[], hoje: Date, resp: string | null): Record<TileKey, ControlRecord[]> {
  const veic = (resp ? control.filter(r => r.resp === resp) : control).filter(r => isRetailType(r.type));
  const porData = (campo: 'neg' | 'date298' | 'dmat') => (a: ControlRecord, b: ControlRecord) =>
    (b[campo]?.getTime() ?? 0) - (a[campo]?.getTime() ?? 0);
  return {
    negocios: veic.filter(r => FECHADO.has(r.status) && mesmoDia(r.neg, hoje)),
    entregas: veic.filter(r => r.status === 'Retail' && mesmoDia(r.date298, hoje)),
    matriculas: veic.filter(r => mesmoDia(r.dmat, hoje)),
    parque: veic.filter(emParque),
    carteira: veic.filter(r => ABERTO.has(r.status)).sort((a, b) => a.mes1.localeCompare(b.mes1) || porData('neg')(a, b)),
  };
}

export function calcResumoDia(control: ControlRecord[], hoje: Date, resp: string | null): ResumoDia {
  const d = calcDetalheDia(control, hoje, resp);
  return {
    negociosHoje: d.negocios.length, entregasHoje: d.entregas.length, matriculasHoje: d.matriculas.length,
    emParque: d.parque.length, carteira: d.carteira.length,
  };
}

/* ── "Os meus": do utilizador para as iniciais do comercial ─────────────────── */

/** As iniciais usadas em control_records.resp (primeira e última palavra do nome) — só se
 *  existirem nos dados; não se inventa um comercial. */
export function meuResp(nome: string | null | undefined, resps: string[]): string | null {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  const ini = (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  return resps.find(r => r.trim().toUpperCase() === ini) ?? null;
}

/* ── Mensagens da administração no Painel ──────────────────────────────────── */

/** Mensagens fixadas no Painel: marcadas `painel`, por expirar e destinadas a esta pessoa. */
export function mensagensDoPainel(
  todas: Notification[], email: string | null, canView: (tab: string) => boolean, agora: Date = new Date(),
): Notification[] {
  return todas
    .filter(n => n.painel === true)
    .filter(n => !n.expira_em || new Date(n.expira_em).getTime() > agora.getTime())
    .filter(n => isNotificationVisible(n, email, canView));
}

/* ── Dados: eventos de preço e prémio ──────────────────────────────────────── */

export interface EventoPainel {
  id: number;
  tipo: 'preco_reducao' | 'premio';
  origem: 'demo' | 'stock';
  chave: string;
  descricao: string | null;
  valor_antes: number | null;
  valor_depois: number | null;
  created_at: string;
}

/** Eventos dos últimos dias que o painel ainda mostra. Vazio se a tabela não existir (migração por aplicar). */
export async function carregarEventosPainel(): Promise<EventoPainel[]> {
  const dias = Math.max(PRAZOS.reducaoPrecoDias, PRAZOS.premioDias) + 1;
  const desde = new Date(Date.now() - dias * DAY).toISOString();
  const { data, error } = await supabase
    .from('painel_eventos')
    .select('id, tipo, origem, chave, descricao, valor_antes, valor_depois, created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw new Error(error.message);
  }
  return (data ?? []) as EventoPainel[];
}

/* ── Nome ──────────────────────────────────────────────────────────────────── */

const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

/** "Primeiro Último" a partir do nome completo; sem nome, deduz-se do email (joao.duarte@x.pt → Joao Duarte). */
export function nomeCurto(nome: string | null | undefined, email: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length > 0) return partes.length === 1 ? partes[0] : `${partes[0]} ${partes[partes.length - 1]}`;
  const local = (email ?? '').split('@')[0].split(/[._-]+/).filter(w => /^\p{L}+$/u.test(w));
  if (local.length === 0) return '';
  return local.length === 1 ? cap(local[0]) : `${cap(local[0])} ${cap(local[local.length - 1])}`;
}

/* ── Baixas e ações do vendedor ────────────────────────────────────────────── */

export interface Baixa {
  id: number;
  regra: string;
  chave: string;
  motivo: string;
  nota: string | null;
  descricao: string | null;
  created_by: string;
  created_at: string;
}

const tabelaEmFalta = (e: { code?: string }) => e.code === '42P01' || e.code === 'PGRST205';
const funcaoEmFalta = (e: { code?: string }) => e.code === 'PGRST202' || e.code === '42883';
const MIGRACAO = 'Falta aplicar a migração do Diário na base de dados.';

/** Baixas dos últimos 60 dias. Vazio se a tabela não existir. */
export async function carregarBaixas(): Promise<Baixa[]> {
  const desde = new Date(Date.now() - 60 * DAY).toISOString();
  const { data, error } = await supabase.from('painel_baixas').select('*').gte('created_at', desde).order('created_at', { ascending: false });
  if (error) {
    if (tabelaEmFalta(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as Baixa[];
}

/** Dá baixa a um aviso: sai da lista de toda a equipa e fica registado quem e porquê. */
export async function darBaixa(input: {
  regra: RegraId; recordId: string; motivo: string; nota?: string; descricao?: string; email: string;
}): Promise<void> {
  const { error } = await supabase.from('painel_baixas').insert({
    regra: input.regra, chave: input.recordId, motivo: input.motivo,
    nota: input.nota?.trim() || null, descricao: input.descricao ?? null, created_by: input.email.toLowerCase(),
  });
  if (error) {
    if (error.code === '23505') return;                       // já tinha baixa: o objetivo está cumprido
    throw new Error(tabelaEmFalta(error) ? MIGRACAO : error.message);
  }
}

export async function reporBaixa(id: number): Promise<void> {
  const { error } = await supabase.from('painel_baixas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

const MSG_RPC: Record<string, string> = {
  sem_acesso: 'Sem acesso ao Diário.',
  biz_invalido: 'Número Bizagi inválido.',
  data_invalida: 'Data inválida (até 30 dias atrás, não no futuro).',
  mes_invalido: 'Mês inválido.',
  registo_invalido: 'O registo mudou entretanto (já tem Bizagi, já foi entregue, ou não está matriculado). Atualiza a página.',
};

async function rpc(fn: string, args: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc(fn as never, args as never);
  if (!error) return;
  if (funcaoEmFalta(error)) throw new Error(MIGRACAO);
  const chave = Object.keys(MSG_RPC).find(k => error.message.includes(k));
  throw new Error(chave ? MSG_RPC[chave] : error.message);
}

export const registarBizagi = (id: string, biz: string) => rpc('painel_registar_biz', { p_id: id, p_biz: biz });
export const registarEntrega = (id: string, dataIso: string) => rpc('painel_registar_entrega', { p_id: id, p_data: dataIso });
export const reagendarEntrega = (id: string, mes: string) => rpc('painel_reagendar', { p_id: id, p_mes: mes });

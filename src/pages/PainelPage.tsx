import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CalendarCheck, FileSignature, Handshake, ParkingSquare, Briefcase, Sparkles, Flame, ChevronDown } from 'lucide-react';
import { useAuth } from '@/App';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useRecordEditor } from '@/components/RecordEditor';
import { AlertaCard, DiasChip, REGRA_ICONS, SEV_STYLE } from '@/components/painel/AlertaCard';
import { ComporMensagem, MensagensLista } from '@/components/painel/MensagensPainel';
import { AcaoSheet } from '@/components/painel/AcaoSheet';
import { BaixasRecentes } from '@/components/painel/BaixasRecentes';
import { DetalheDia } from '@/components/painel/DetalheDia';
import { carregarEntradasParque, type EntradasParque } from '@/lib/lead-time-entrega';
import { listNotifications, type Notification } from '@/lib/notifications';
import { isRetailType } from '@/lib/viaturas';
import { isRetiredMember } from '@/lib/team';
import { cn } from '@/lib/utils';
import {
  calcAlertas, calcDetalheDia, calcResumoDia, carregarBaixas, carregarEventosPainel, chaveBaixa, mensagensDoPainel, meuResp, nomeCurto,
  principaisTarefas, REGRAS, type AlertaItem, type Baixa, type EventoPainel, type RegraId, type TileKey,
} from '@/lib/painel';

/* ── Painel ──────────────────────────────────────────────────────────────────
 * Ecrã de abertura: resume o dia, indica as principais tarefas, mostra as
 * mensagens da administração e as pendências/alertas por regra (ver lib/painel).
 * Mostra a equipa toda ou só os negócios de um comercial ("Os meus"); os avisos de
 * Demos/Stock (preço, prémios) não têm dono e aparecem sempre.
 * ──────────────────────────────────────────────────────────────────────────── */

const REFRESH_MS = 2 * 60 * 1000;
const DISPENSADAS_KEY = 'painel:dispensadas';

/** Para onde cada cartão leva (só se a pessoa tem acesso ao tab). */
const DESTINO: Record<RegraId, { tab: string; path: string; label: string }> = {
  'parque-sem-matricula': { tab: 'producao', path: '/producao', label: 'Produção' },
  'matriculado-sem-certificado': { tab: 'producao', path: '/producao', label: 'Produção' },
  'financiamento-bmw': { tab: 'carteira', path: '/carteira', label: 'Carteira' },
  'sem-bizagi': { tab: 'carteira', path: '/carteira', label: 'Carteira' },
  'bev-lead-cme': { tab: 'carteira', path: '/carteira', label: 'Carteira' },
  'entrega-atrasada': { tab: 'carteira', path: '/carteira', label: 'Carteira' },
  'entrega-fim-mes': { tab: 'carteira', path: '/carteira', label: 'Carteira' },
  'reducao-preco': { tab: 'demos', path: '/demos', label: 'Demos' },
  'premio-venda': { tab: 'demos', path: '/demos', label: 'Demos' },
};

const saudacao = (h: number) => (h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite');

function lerDispensadas(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISPENSADAS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}

type Escopo = 'equipa' | 'meus' | string;

export default function PainelPage() {
  const { session } = useAuth();
  const { data, refresh } = useData();
  const { isAdmin, canView, canEdit, me, effectiveEmail } = usePermissions();
  const { openEditor } = useRecordEditor();
  const email = effectiveEmail ?? session?.user.email ?? null;
  const nome = me?.nome ?? email;
  const podeAbrirRegistos = canEdit('dados') || canEdit('database');
  const [acao, setAcao] = useState<AlertaItem | null>(null);
  // Quadrado do resumo selecionado: abre a lista por baixo e desloca a página até lá.
  const [tile, setTile] = useState<TileKey | null>(null);
  const detalheRef = useRef<HTMLElement>(null);
  const escolherTile = (k: TileKey) => {
    const fechar = tile === k;
    setTile(fechar ? null : k);
    if (!fechar) requestAnimationFrame(() => detalheRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  };

  const [entradas, setEntradas] = useState<EntradasParque | null>(null);
  const [eventos, setEventos] = useState<EventoPainel[]>([]);
  const [baixas, setBaixas] = useState<Baixa[]>([]);
  const [notificacoes, setNotificacoes] = useState<Notification[]>([]);
  const [dispensadas, setDispensadas] = useState<Set<string>>(lerDispensadas);
  // "Hoje" refresca com os dados (a página pode ficar aberta de um dia para o outro).
  const [hoje, setHoje] = useState(() => new Date());

  const carregar = useCallback(async () => {
    const [ent, ev, notif, bx] = await Promise.all([
      carregarEntradasParque().catch(() => null),
      carregarEventosPainel().catch(() => [] as EventoPainel[]),
      listNotifications(60).catch(() => [] as Notification[]),
      carregarBaixas().catch(() => [] as Baixa[]),
    ]);
    setEntradas(ent); setEventos(ev); setNotificacoes(notif); setBaixas(bx); setHoje(new Date());
  }, []);

  useEffect(() => {
    carregar();
    const id = window.setInterval(carregar, REFRESH_MS);
    const onFocus = () => carregar();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [carregar]);

  const control = useMemo(() => data?.control ?? [], [data]);
  const resps = useMemo(
    () => Array.from(new Set(control.filter(r => isRetailType(r.type) && r.resp.trim()).map(r => r.resp.trim())))
      .filter(r => !isRetiredMember(r)).sort((a, b) => a.localeCompare(b, 'pt')),
    [control]);
  const eu = useMemo(() => meuResp(nome, resps), [nome, resps]);

  // Por omissão, quem é comercial vê "Os meus"; os restantes (chefia, financeiro) veem a equipa.
  const [escopo, setEscopo] = useState<Escopo | null>(null);
  const escopoAtual: Escopo = escopo ?? (eu ? 'meus' : 'equipa');
  const respFiltro = escopoAtual === 'equipa' ? null : escopoAtual === 'meus' ? eu : escopoAtual;

  const chavesBaixa = useMemo(() => new Set(baixas.map(b => chaveBaixa(b.regra, b.chave))), [baixas]);
  const grupos = useMemo(
    () => calcAlertas(control, { hoje, entradas, eventos, baixas: chavesBaixa, resp: respFiltro }),
    [control, hoje, entradas, eventos, chavesBaixa, respFiltro]);
  const resumo = useMemo(() => calcResumoDia(control, hoje, respFiltro), [control, hoje, respFiltro]);
  const detalheDia = useMemo(() => calcDetalheDia(control, hoje, respFiltro), [control, hoje, respFiltro]);
  const principais = useMemo(() => principaisTarefas(grupos), [grupos]);
  const mensagens = useMemo(() => mensagensDoPainel(notificacoes, email, canView), [notificacoes, email, canView]);

  const comItens = grupos.filter(g => g.itens.length > 0);
  const emDia = grupos.filter(g => g.itens.length === 0);
  const urgentes = grupos.reduce((s, g) => s + g.urgentes, 0);
  const acionaveis = grupos.reduce((s, g) => s + g.itens.filter(i => i.severidade !== 'info').length, 0);
  const avisos = grupos.reduce((s, g) => s + g.itens.filter(i => i.severidade === 'info').length, 0);

  const dispensar = (id: string) => {
    setDispensadas(prev => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem(DISPENSADAS_KEY, JSON.stringify([...next].slice(-200))); } catch { /* ignora */ }
      return next;
    });
  };

  if (!data) {
    return <div className="grid h-96 place-items-center text-sm text-muted-foreground">A carregar o diário…</div>;
  }

  const dataLonga = hoje.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  // Cada quadrado desloca a página para a lista que está por trás do número.
  const tiles: { key: TileKey; label: string; valor: number; icon: typeof Handshake; titulo: string; descricao: string }[] = [
    { key: 'negocios', label: 'Negócios hoje', valor: resumo.negociosHoje, icon: Handshake, titulo: 'Negócios fechados hoje', descricao: 'Negócios que entraram em carteira hoje.' },
    { key: 'matriculas', label: 'Matrículas hoje', valor: resumo.matriculasHoje, icon: FileSignature, titulo: 'Matrículas de hoje', descricao: 'Viaturas cuja matrícula tem data de hoje.' },
    { key: 'entregas', label: 'Entregas hoje', valor: resumo.entregasHoje, icon: CalendarCheck, titulo: 'Entregas de hoje', descricao: 'Viaturas com certificado de entrega (retail) de hoje.' },
    { key: 'parque', label: 'Em parque', valor: resumo.emParque, icon: ParkingSquare, titulo: 'Viaturas em parque', descricao: 'Em parque e ainda por entregar.' },
    { key: 'carteira', label: 'Carteira', valor: resumo.carteira, icon: Briefcase, titulo: 'Carteira por entregar', descricao: 'Negócios fechados ainda por entregar, por mês previsto.' },
  ];
  const tileAtivo = tiles.find(t => t.key === tile) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-fade-in" data-testid="painel">
      {/* Cabeçalho do dia */}
      <section className="relative overflow-hidden rounded-2xl bg-brand-dark p-5 text-white shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-brand-primary/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-white/60">{dataLonga}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {saudacao(hoje.getHours())}{nomeCurto(me?.nome, email) ? `, ${nomeCurto(me?.nome, email)}` : ''}
            </h1>
            <p className="mt-1.5 text-sm text-white/75" data-testid="painel-resumo">
              {acionaveis === 0 && avisos === 0
                ? 'Tudo em dia. Bom trabalho!'
                : <>
                    {acionaveis === 0 ? 'Nada a exigir ação' : <><b className="text-white">{acionaveis}</b> pendência{acionaveis !== 1 ? 's' : ''} a tratar</>}
                    {urgentes > 0 && <> · <b className="text-red-300">{urgentes} urgente{urgentes !== 1 ? 's' : ''}</b></>}
                    {avisos > 0 && <> · {avisos} aviso{avisos !== 1 ? 's' : ''}</>}
                  </>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="painel-escopo">Ver</label>
            <select id="painel-escopo" value={escopoAtual} onChange={e => setEscopo(e.target.value)}
              className="h-8 rounded-md border border-white/20 bg-white/10 px-2 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/40">
              <option value="equipa" className="text-foreground">Toda a equipa</option>
              {eu && <option value="meus" className="text-foreground">Os meus ({eu})</option>}
              {resps.filter(r => r !== eu).map(r => <option key={r} value={r} className="text-foreground">{r}</option>)}
            </select>
            {isAdmin && <ComporMensagem autorEmail={email} autorNome={nome} onEnviada={carregar} />}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {tiles.map(t => {
            const ativo = tile === t.key;
            return (
              <button key={t.key} type="button" onClick={() => escolherTile(t.key)} aria-pressed={ativo} aria-controls="painel-detalhe"
                data-testid={`tile-${t.key}`} title={ativo ? 'Fechar a lista' : 'Ver a lista'}
                className={cn(
                  'group rounded-xl border px-3 py-2.5 text-left backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                  ativo ? 'border-white/50 bg-white/20' : 'border-white/10 bg-white/[0.07] hover:border-white/30 hover:bg-white/[0.14]')}>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/60"><t.icon className="h-3.5 w-3.5" />{t.label}
                  <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', ativo ? 'rotate-180 opacity-100' : 'opacity-0 group-hover:opacity-100')} />
                </span>
                <span className="mt-0.5 block text-2xl font-bold tabular-nums">{t.valor}</span>
              </button>
            );
          })}
        </div>
      </section>

      {tileAtivo && (
        <DetalheDia ref={detalheRef} titulo={tileAtivo.titulo} descricao={tileAtivo.descricao} registos={detalheDia[tileAtivo.key]}
          mostrarResp={!respFiltro} onAbrir={podeAbrirRegistos ? openEditor : undefined} onFechar={() => setTile(null)} />
      )}

      {/* Mensagens da administração */}
      <MensagensLista mensagens={mensagens} isAdmin={isAdmin} dispensadas={dispensadas}
        onDispensar={dispensar} onApagada={id => setNotificacoes(prev => prev.filter(n => n.id !== id))} />

      {/* Principais tarefas */}
      {principais.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="painel-prioridades">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Flame className="h-4 w-4 text-destructive" /> Para tratar primeiro</h2>
          <ol className="mt-2 divide-y divide-border/60">
            {principais.map((t, i) => {
              const Icon = REGRA_ICONS[t.regra];
              const st = SEV_STYLE[t.severidade];
              const abre = !!t.registo;
              const corpo = (
                <>
                  <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', st.icone)}><Icon className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium">{t.titulo} <span className="font-normal text-muted-foreground">· {t.detalhe}</span></div>
                    <div className="truncate text-xs text-muted-foreground">{REGRAS[t.regra].titulo}</div>
                  </div>
                  {!respFiltro && t.resp && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{t.resp}</span>}
                  <DiasChip item={t} />
                </>
              );
              return (
                <li key={t.id}>
                  {abre ? (
                    <button type="button" onClick={() => setAcao(t)}
                      className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{corpo}</button>
                  ) : <div className="flex items-center gap-2.5 px-1 py-2">{corpo}</div>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Pendências e alertas, por regra */}
      {comItens.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {comItens.map(g => {
            const d = DESTINO[g.regra.id];
            return (
              <AlertaCard key={g.regra.id} grupo={g} mostrarResp={!respFiltro}
                onAbrir={setAcao}
                destino={canView(d.tab) ? { path: d.path, label: d.label } : null} />
            );
          })}
        </div>
      )}

      {comItens.length === 0 && (
        <section className="grid place-items-center rounded-xl border border-dashed border-border bg-card/50 px-4 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Sparkles className="h-6 w-6" /></span>
          <p className="mt-3 text-base font-semibold">Sem pendências</p>
          <p className="text-sm text-muted-foreground">Nenhuma das regras de acompanhamento tem nada a assinalar.</p>
        </section>
      )}

      <BaixasRecentes baixas={baixas} email={email} isAdmin={isAdmin} onMudou={carregar} />

      <AcaoSheet item={acao} email={email} podeEditor={podeAbrirRegistos} onAbrirFicha={openEditor}
        onClose={() => setAcao(null)} onFeito={async () => { await Promise.all([refresh(), carregar()]); }} />

      {/* Regras sem nada a assinalar: uma linha, para não ocupar espaço. */}
      {comItens.length > 0 && emDia.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground" data-testid="painel-em-dia">
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Em dia:</span>
          {emDia.map(g => <span key={g.regra.id}>{g.regra.titulo}</span>)}
        </p>
      )}
    </div>
  );
}

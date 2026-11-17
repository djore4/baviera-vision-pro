import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, ExternalLink, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toLocalIsoDay } from '@/lib/utils';
import { buildMatriculaMailto, buildMatriculaRequest } from '@/lib/matricula';
import {
  darBaixa, reagendarEntrega, registarBizagi, registarEntrega, REGRAS, type AlertaItem,
} from '@/lib/painel';
import { DiasChip, REGRA_ICONS, SEV_STYLE } from '@/components/painel/AlertaCard';

/* Ações do vendedor sobre um aviso, ao alcance de quem não edita Dados/Database:
 * cada regra oferece o passo seguinte (pedir a matrícula, registar o Bizagi, dar baixa da
 * Lead CME…). Tudo o que grava passa por funções da base de dados com validação própria. */

interface Props {
  item: AlertaItem | null;
  email: string | null;
  /** Pode abrir a ficha completa (edita Dados/Database). */
  podeEditor: boolean;
  onAbrirFicha: (recordId: string) => void;
  onClose: () => void;
  /** Depois de gravar: recarregar dados e baixas. */
  onFeito: () => Promise<void> | void;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Os próximos 7 meses (incluindo o atual), 'AAAA/MM'. */
export function proximosMeses(hoje: Date = new Date(), n = 7): { valor: string; rotulo: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    return { valor: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MESES[d.getMonth()]} ${d.getFullYear()}` };
  });
}

export function AcaoSheet({ item, email, podeEditor, onAbrirFicha, onClose, onFeito }: Props) {
  return (
    <Sheet open={!!item} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {item?.registo && (
          <Corpo key={item.id} item={item} email={email} podeEditor={podeEditor}
            onAbrirFicha={onAbrirFicha} onClose={onClose} onFeito={onFeito} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  if (!v.trim()) return null;
  return <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}

function Corpo({ item, email, podeEditor, onAbrirFicha, onClose, onFeito }: Omit<Props, 'item'> & { item: AlertaItem }) {
  const r = item.registo!;
  const regra = REGRAS[item.regra];
  const Icon = REGRA_ICONS[item.regra];
  const st = SEV_STYLE[item.severidade];
  const [busy, setBusy] = useState(false);
  const [nota, setNota] = useState('');
  const [biz, setBiz] = useState('');
  const [data, setData] = useState(() => toLocalIsoDay(new Date()));
  const [mes, setMes] = useState(() => proximosMeses()[1].valor);
  const [enviado, setEnviado] = useState(false);

  /** Corre uma gravação: avisa, recarrega e fecha. */
  const correr = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await onFeito(); onClose(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const baixa = (motivo: string, ok: string) => correr(
    () => darBaixa({ regra: item.regra, recordId: r.id!, motivo, nota, descricao: `${item.titulo} · ${item.detalhe}`, email: email ?? '' }), ok);

  const campos = { cliente: r.cliente, enc: r.enc, chas: r.chas, biz: r.biz, fin: r.fin, ret: r.ret };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(buildMatriculaRequest(campos)); toast.success('Pedido copiado.'); }
    catch { toast.error('Não foi possível copiar.'); }
  };

  const pedirMatricula = (
    <div className="space-y-2">
      <Button asChild className="w-full gap-2" onClick={() => setEnviado(true)}>
        <a href={buildMatriculaMailto(campos)}><Mail className="h-4 w-4" /> Pedir matrícula por email</a>
      </Button>
      <Button variant="outline" className="w-full gap-2" onClick={copiar}><Copy className="h-4 w-4" /> Copiar o texto do pedido</Button>
      {enviado && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <p className="text-muted-foreground">O aviso mantém-se até chegar a confirmação "matrícula pedida". Já enviaste o pedido?</p>
          <Button size="sm" className="mt-2 gap-1.5" disabled={busy} onClick={() => baixa('pedido-enviado', 'Pedido registado; aviso removido.')}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Sim, dar baixa do aviso
          </Button>
        </div>
      )}
    </div>
  );

  const notaCampo = (
    <Textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} maxLength={300} aria-label="Nota (opcional)"
      placeholder="Nota (opcional): p. ex. nº da lead, motivo…" />
  );

  return (
    <>
      <SheetHeader className="text-left">
        <div className="flex items-start gap-3">
          <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', st.icone)}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <SheetTitle className="text-base leading-snug">{item.titulo}</SheetTitle>
            <SheetDescription>{regra.titulo}</SheetDescription>
          </div>
          <div className="ml-auto"><DiasChip item={item} /></div>
        </div>
      </SheetHeader>

      <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">{regra.acao}</p>

      <dl className="mt-3 divide-y divide-border/60">
        <Linha k="Cliente" v={r.cliente} />
        <Linha k="Comercial" v={r.resp} />
        <Linha k="Encomenda" v={r.enc} />
        <Linha k="Chassis" v={r.chas} />
        <Linha k="Matrícula" v={r.mat} />
        <Linha k="Bizagi" v={r.biz} />
        <Linha k="Pagamento" v={r.fin} />
        <Linha k="Mês previsto" v={r.mes1} />
      </dl>

      <div className="mt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximo passo</h3>

        {(item.regra === 'parque-sem-matricula' || item.regra === 'entrega-fim-mes') && pedirMatricula}

        {item.regra === 'matriculado-sem-certificado' && (
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">Data do certificado de entrega
              <Input type="date" value={data} max={toLocalIsoDay(new Date())} onChange={e => setData(e.target.value)} className="mt-1" />
            </label>
            <Button className="w-full gap-2" disabled={busy || !data}
              onClick={() => correr(() => registarEntrega(r.id!, data), 'Entrega registada.')}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Registar entrega (certificado emitido)
            </Button>
            <p className="text-[11px] text-muted-foreground">Passa o negócio a Retail com esta data.</p>
          </div>
        )}

        {item.regra === 'entrega-atrasada' && (
          <div className="space-y-2">
            <Button className="w-full gap-2" disabled={busy || !r.mat.trim()}
              onClick={() => correr(() => registarEntrega(r.id!, data), 'Entrega registada.')}
              title={r.mat.trim() ? undefined : 'Só é possível registar a entrega de viaturas já matriculadas'}>
              <CheckCircle2 className="h-4 w-4" /> Já foi entregue (hoje)
            </Button>
            <label className="block text-xs text-muted-foreground">Ou reagendar para
              <select value={mes} onChange={e => setMes(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {proximosMeses().map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
              </select>
            </label>
            <Button variant="outline" className="w-full" disabled={busy}
              onClick={() => correr(() => reagendarEntrega(r.id!, mes), 'Entrega reagendada.')}>Reagendar entrega</Button>
          </div>
        )}

        {item.regra === 'sem-bizagi' && (
          <div className="space-y-2">
            <Input value={biz} onChange={e => setBiz(e.target.value)} placeholder="Nº Bizagi" maxLength={40} aria-label="Nº Bizagi" />
            <Button className="w-full gap-2" disabled={busy || !biz.trim()}
              onClick={() => correr(() => registarBizagi(r.id!, biz), 'Bizagi registado.')}>
              <CheckCircle2 className="h-4 w-4" /> Guardar nº Bizagi
            </Button>
          </div>
        )}

        {item.regra === 'bev-lead-cme' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Abre a Lead CME para este cliente. Depois, dá baixa aqui para remover o aviso.</p>
            {notaCampo}
            <Button className="w-full gap-2" disabled={busy} onClick={() => baixa('lead-aberta', 'Baixa registada: Lead CME aberta.')}>
              <CheckCircle2 className="h-4 w-4" /> Lead CME aberta — dar baixa
            </Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => baixa('nao-aplicavel', 'Aviso removido (não aplicável).')}>
              Não aplicável (p. ex. chassis a caminho)
            </Button>
          </div>
        )}

        {item.regra === 'financiamento-bmw' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Propõe ao cliente um contrato de financiamento BMW e regista o resultado.</p>
            {notaCampo}
            <Button className="w-full gap-2" disabled={busy} onClick={() => baixa('proposta-feita', 'Registado: proposta de financiamento feita.')}>
              <CheckCircle2 className="h-4 w-4" /> Proposta feita — dar baixa
            </Button>
            <Button variant="outline" className="w-full" disabled={busy} onClick={() => baixa('nao-pretende', 'Registado: cliente não pretende financiamento.')}>
              Cliente não pretende
            </Button>
          </div>
        )}

        {item.regra === 'entrega-fim-mes' && (
          <Button variant="ghost" size="sm" className="w-full" disabled={busy} onClick={() => baixa('ja-tratado', 'Aviso removido.')}>
            Já está tratado fora da app — dar baixa
          </Button>
        )}

        {podeEditor && (
          <Button variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground" onClick={() => { onClose(); onAbrirFicha(r.id!); }}>
            <ExternalLink className="h-3.5 w-3.5" /> Abrir a ficha completa
          </Button>
        )}
      </div>
    </>
  );
}

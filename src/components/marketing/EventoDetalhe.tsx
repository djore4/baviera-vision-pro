import { useState } from 'react';
import { CalendarDays, Clock, MapPin, MessageCircle, Pencil, Shirt, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  COR_SEM_CATEGORIA, fmtEuro, formatarIntervaloComAno, linkWhatsApp, resumoOrcamento, textoConvite, textoRelativo,
  type Categoria, type Convidado, type MarketingEvento, type Orcamento as OrcamentoDados,
} from '@/lib/marketing';
import { deleteEvento } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';
import { ConvidadosPanel } from './ConvidadosPanel';
import { DocumentosPanel } from './DocumentosPanel';
import { ViaturasPanel } from './ViaturasPanel';
import { useUrlFicheiro } from './useUrlFicheiro';
import { LocalMapa } from './LocalMapa';

interface Props {
  evento: MarketingEvento | null;
  categoria: Categoria | null;
  /** Quem edita o tab: gere o evento, vê o orçamento e todos os convidados. */
  canEdit: boolean;
  orcamento: OrcamentoDados | null;
  meuEmail: string | null;
  meuNome: string | null;
  hoje: string;
  onClose: () => void;
  onEdit: (ev: MarketingEvento) => void;
  onDeleted: (id: string) => void;
  onConvidados: (eventoId: string, lista: Convidado[]) => void;
}

function Orcamento({ previsto, real }: { previsto: number | null; real: number | null }) {
  const r = resumoOrcamento(previsto, real);
  const cor = r.estado === 'acima' ? 'bg-destructive' : r.estado === 'proximo' ? 'bg-warning' : 'bg-success';
  return (
    <div data-testid="orcamento" className="rounded-md border p-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Previsto</div><div className="font-semibold tabular-nums">{fmtEuro(r.previsto)}</div></div>
        <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Real</div><div className="font-semibold tabular-nums">{fmtEuro(r.real)}</div></div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Desvio</div>
          <div className={cn('font-semibold tabular-nums', r.estado === 'acima' && 'text-destructive', r.estado === 'dentro' && 'text-success')}>
            {r.desvio == null ? '—' : `${r.desvio > 0 ? '+' : ''}${fmtEuro(r.desvio)}`}
          </div>
        </div>
      </div>
      {r.usado != null && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Orçamento utilizado" aria-valuenow={Math.round(r.usado * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full rounded-full transition-all duration-700', cor)} style={{ width: `${Math.min(r.usado, 1) * 100}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{Math.round(r.usado * 100)}% do previsto{r.estado === 'acima' ? ' — acima do orçamento' : ''}</div>
        </div>
      )}
    </div>
  );
}

export function EventoDetalhe({ evento, categoria, canEdit, orcamento, meuEmail, meuNome, hoje, onClose, onEdit, onDeleted, onConvidados }: Props) {
  const [apagar, setApagar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const capa = useUrlFicheiro(evento?.imagem_path);
  const cor = `hsl(${categoria?.cor ?? COR_SEM_CATEGORIA})`;

  const confirmarApagar = async () => {
    if (!evento) return;
    setApagando(true);
    try { await deleteEvento(evento); onDeleted(evento.id); setApagar(false); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível apagar o evento.'); }
    finally { setApagando(false); }
  };

  return (
    <>
      <Sheet open={!!evento} onOpenChange={o => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-background/85 [&>button]:p-1.5 [&>button]:shadow">
          {evento && (
            <div data-testid="evento-detalhe">
              {capa ? (
                <img src={capa} alt="" className="h-44 w-full object-cover sm:h-56" />
              ) : (
                <div className="h-24 w-full" style={{ background: `linear-gradient(135deg, hsl(${categoria?.cor ?? COR_SEM_CATEGORIA} / 0.25), hsl(${categoria?.cor ?? COR_SEM_CATEGORIA} / 0.05))` }} />
              )}

              <div className="space-y-4 p-5">
                <SheetHeader className="space-y-2 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    {categoria && (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `hsl(${categoria.cor} / 0.12)`, color: cor }}>{categoria.nome}</span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{textoRelativo(evento, hoje)}</span>
                  </div>
                  <SheetTitle className="text-xl">{evento.titulo}</SheetTitle>
                  <SheetDescription asChild>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatarIntervaloComAno(evento)}</span>
                      {evento.hora && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{evento.hora}</span>}
                      <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{evento.local}</span>
                    </div>
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-wrap gap-2">
                  {canEdit && <Button size="sm" variant="outline" onClick={() => onEdit(evento)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar</Button>}
                  <Button asChild size="sm" variant="outline" title="Abre o WhatsApp com o convite escrito, para escolheres o contacto">
                    <a href={linkWhatsApp(textoConvite(evento))} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Partilhar convite</a>
                  </Button>
                  {canEdit && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setApagar(true)}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Apagar</Button>}
                </div>

                <Tabs defaultValue="resumo" key={evento.id}>
                  <TabsList className="grid h-auto w-full grid-cols-4 [&>button]:px-1 [&>button]:text-xs sm:[&>button]:text-sm">
                    <TabsTrigger value="resumo">Resumo</TabsTrigger>
                    <TabsTrigger value="viaturas">Viaturas</TabsTrigger>
                    <TabsTrigger value="documentos">Documentos</TabsTrigger>
                    <TabsTrigger value="convidados">Convidados</TabsTrigger>
                  </TabsList>

                  <TabsContent value="resumo" className="mt-4 space-y-5">
                    <section>
                      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que vai acontecer</h4>
                      {evento.descricao
                        ? <p className="whitespace-pre-line text-sm">{evento.descricao}</p>
                        : <p className="text-sm text-muted-foreground">{canEdit ? 'Sem descrição. Usa “Editar” para a acrescentar.' : 'Sem descrição.'}</p>}
                    </section>
                    <section>
                      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Localização</h4>
                      <LocalMapa local={evento.local} />
                    </section>
                    {evento.dress_code && (
                      <section>
                        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dress code</h4>
                        <p className="inline-flex items-center gap-2 text-sm"><Shirt className="h-4 w-4 text-muted-foreground" />{evento.dress_code}</p>
                      </section>
                    )}
                    {evento.highlights.length > 0 && (
                      <section>
                        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">A ter em conta</h4>
                        <ul className="space-y-1.5" data-testid="highlights">
                          {evento.highlights.map((h, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: cor }} />{h}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {canEdit && (
                      <section>
                        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Orçamento</h4>
                        <Orcamento previsto={orcamento?.previsto ?? null} real={orcamento?.real ?? null} />
                      </section>
                    )}
                  </TabsContent>

                  <TabsContent value="viaturas" className="mt-4"><ViaturasPanel eventoId={evento.id} readOnly={!canEdit} /></TabsContent>
                  <TabsContent value="documentos" className="mt-4"><DocumentosPanel eventoId={evento.id} readOnly={!canEdit} /></TabsContent>
                  <TabsContent value="convidados" className="mt-4">
                    <ConvidadosPanel evento={evento} onChange={lista => onConvidados(evento.id, lista)} podeGerirTodos={canEdit} meuEmail={meuEmail} meuNome={meuNome} />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={apagar} onOpenChange={setApagar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar “{evento?.titulo}”?</AlertDialogTitle>
            <AlertDialogDescription>Apaga também as viaturas, documentos e a lista de convidados. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); confirmarApagar(); }} disabled={apagando} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

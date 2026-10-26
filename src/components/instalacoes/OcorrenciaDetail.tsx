import { useEffect, useState } from 'react';
import { CalendarDays, Send, Pencil, Trash2, X, History, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  ESTADOS, categoriaLabel, diasDesde, estadoDef, fmtDia, historicoLabel, isAtiva, listHistorico, prioridadeDef,
  type Estado, type HistoricoItem, type Ocorrencia,
} from '@/lib/instalacoes';

const fmtQuando = (iso: string): string =>
  new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Props {
  o: Ocorrencia;
  pisoLabel: string;
  canEdit: boolean;
  busy: boolean;
  /** Muda quando a ocorrência é alterada, para recarregar o histórico. */
  historyKey: string;
  onEstado: (e: Estado) => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function OcorrenciaDetail({ o, pisoLabel, canEdit, busy, historyKey, onEstado, onEdit, onDelete, onClose }: Props) {
  const [hist, setHist] = useState<HistoricoItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    listHistorico(o.id).then(h => { if (alive) setHist(h); });
    return () => { alive = false; };
  }, [o.id, historyKey]);

  const est = estadoDef(o.estado);
  const pri = prioridadeDef(o.prioridade);
  const dias = diasDesde(o.data_ocorrencia);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight">{o.titulo}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-medium', est.cls)}>{est.label}</span>
            <span className={cn('rounded-full px-2 py-0.5 font-medium', pri.badge)}>{pri.label}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{categoriaLabel(o.categoria)}</span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <section>
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Intervenção necessária</h4>
        <p className="whitespace-pre-wrap text-sm">{o.intervencao}</p>
      </section>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"><MapPin className="h-3 w-3" /> Local</dt>
          <dd>{pisoLabel}{o.zona ? ` · ${o.zona}` : ''}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3 w-3" /> Ocorrência</dt>
          <dd>
            {fmtDia(o.data_ocorrencia)}
            {isAtiva(o) && <span className="ml-1 text-xs text-muted-foreground">({dias === 0 ? 'hoje' : `há ${dias} d`})</span>}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"><Send className="h-3 w-3" /> Reportada a</dt>
          <dd>
            {o.interlocutor
              ? <>{o.interlocutor}{o.data_reporte && <span className="ml-1 text-xs text-muted-foreground">({fmtDia(o.data_reporte)})</span>}</>
              : <span className="font-medium text-amber-600 dark:text-amber-400">Por reportar</span>}
          </dd>
        </div>
        {o.resolvida_em && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Resolvida em</dt>
            <dd>{fmtDia(o.resolvida_em)}</dd>
          </div>
        )}
      </dl>

      {o.obs && (
        <section>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observações</h4>
          <p className="whitespace-pre-wrap text-sm">{o.obs}</p>
        </section>
      )}

      {canEdit && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estado</h4>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mudar estado">
            {ESTADOS.map(s => (
              <Button key={s.value} type="button" size="sm" disabled={busy || s.value === o.estado}
                variant={s.value === o.estado ? 'default' : 'outline'} onClick={() => onEstado(s.value)}
                className={cn(s.value === o.estado && 'disabled:opacity-100')} aria-current={s.value === o.estado}>
                {s.label}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <History className="h-3 w-3" /> Histórico
        </h4>
        {hist.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem registos.</p>
        ) : (
          <ol className="space-y-1.5 border-l pl-3">
            {hist.map(h => (
              <li key={h.id} className="text-xs">
                <span className="font-medium">{historicoLabel(h)}</span>
                <span className="block text-muted-foreground">{fmtQuando(h.created_at)}{h.autor ? ` · ${h.autor}` : ''}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {canEdit && (
        <div className="flex items-center justify-between border-t pt-3">
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Apagar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={busy}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar ocorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              “{o.titulo}” e o seu histórico são removidos de forma definitiva. Se o problema ficou resolvido,
              marca-a antes como “Resolvida” para manter o registo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDelete(false); onDelete(); }}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Trash2, Check, Plus, Phone, Mail, MapPin, Car, CalendarClock,
  Gauge, Euro, Clock, User,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  updateEotContract, assignEotOwner, listActivities, createActivity, setActivityDone, deleteActivity,
  FASES, faseLabel, faseCls, ACT_TIPOS, actTipoLabel, isOverdue, daysToEnd, eur,
  type EotContract, type EotActivity, type EotOwner, type Fase, type ActTipo,
} from '@/lib/eot';
import { relativeLabel } from '@/components/prospecao/ui';

/* datetime-local <-> ISO */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: EotContract | null;
  canEdit: boolean;
  isDirector: boolean;
  owners: EotOwner[];
  autor: string | null;
  ownerEmail: string | null;
  onChanged: () => void;
}

const UNASSIGNED = '__none__';

export function ContractDialog({ open, onOpenChange, contract, canEdit, isDirector, owners, autor, ownerEmail, onChanged }: Props) {
  const [fase, setFase] = useState<Fase>('pendente');
  const [obs, setObs] = useState('');
  const [savingState, setSavingState] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const [activities, setActivities] = useState<EotActivity[]>([]);
  const [loadingActs, setLoadingActs] = useState(false);

  // Nova atividade
  const [novoTipo, setNovoTipo] = useState<ActTipo>('chamada');
  const [novaDesc, setNovaDesc] = useState('');
  const [novoQuando, setNovoQuando] = useState('');
  const [novoDone, setNovoDone] = useState(false);
  const [addingAct, setAddingAct] = useState(false);

  const contrato = contract?.contrato ?? null;

  const loadActs = useCallback(async () => {
    if (!contrato) return;
    setLoadingActs(true);
    try {
      setActivities(await listActivities(contrato));
    } finally {
      setLoadingActs(false);
    }
  }, [contrato]);

  useEffect(() => {
    if (!open || !contract) return;
    setFase(contract.fase);
    setObs(contract.obs ?? '');
    setNovoTipo('chamada'); setNovaDesc(''); setNovoQuando(''); setNovoDone(false);
    loadActs();
  }, [open, contract, loadActs]);

  if (!contract) return null;

  const dEnd = daysToEnd(contract.data_fim);

  const saveState = async () => {
    setSavingState(true);
    try {
      await updateEotContract(contract.contrato, { fase, obs: obs.trim() || null });
      toast.success('Acompanhamento atualizado.');
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingState(false); }
  };

  const changeOwner = async (value: string) => {
    setAssigning(true);
    try {
      const owner = value === UNASSIGNED ? null : owners.find(o => o.email === value) ?? null;
      await assignEotOwner(contract.contrato, owner);
      toast.success(owner ? `Atribuído a ${owner.nome}.` : 'Atribuição removida.');
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setAssigning(false); }
  };

  const addActivity = async () => {
    if (!novoDone && !novoQuando) {
      toast.error('Agende uma data ou marque como já realizada.');
      return;
    }
    setAddingAct(true);
    try {
      await createActivity({
        contrato: contract.contrato,
        tipo: novoTipo,
        descricao: novaDesc.trim() || null,
        due_at: novoQuando ? new Date(novoQuando).toISOString() : null,
        done: novoDone,
        autor,
        // A atividade pertence ao responsável do contrato (para entrar na agenda
        // do vendedor); se não houver responsável, fica com o autor.
        owner_email: contract.owner_email ?? ownerEmail,
        created_by: autor,
      });
      toast.success(novoDone ? 'Atividade registada.' : 'Atividade agendada.');
      setNovaDesc(''); setNovoQuando(''); setNovoDone(false);
      await loadActs();
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setAddingAct(false); }
  };

  const toggleDone = async (a: EotActivity) => {
    try {
      await setActivityDone(a.id, !a.done);
      await loadActs();
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };

  const removeAct = async (a: EotActivity) => {
    try {
      await deleteActivity(a.id);
      await loadActs();
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 flex-wrap pr-6 text-base sm:text-lg text-left">
            <span className="min-w-0 break-words">{contract.cliente || 'Cliente sem nome'}</span>
            <span className={cn('shrink-0 rounded-full text-[11px] font-semibold px-2 py-0.5 self-center', faseCls(contract.fase))}>
              {faseLabel(contract.fase)}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Ficha do contrato */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <Info icon={Car} label="Viatura" value={[contract.marca, contract.modelo].filter(Boolean).join(' ') || '—'} />
          <Info icon={Gauge} label="Matrícula" value={contract.matricula || '—'} />
          <Info icon={User} label="Vendedor" value={contract.vendedor || '—'} />
          <Info icon={CalendarClock} label="Fim de contrato" value={fmtDate(contract.data_fim) + (dEnd != null ? ` (${dEnd < 0 ? 'terminado' : dEnd + ' dias'})` : '')} tone={dEnd != null && dEnd < 30 ? 'danger' : 'default'} />
          <Info icon={Clock} label="Contrato / Prazo" value={`${contract.contrato}${contract.prazo ? ` · ${contract.prazo}m` : ''} · ${contract.tipo ?? ''}`} />
          <Info icon={Euro} label="Prestação" value={eur(contract.prestacao)} />
          <Info icon={Euro} label="Valor residual" value={eur(contract.valor_residual)} />
          <Info icon={Euro} label="Total a pagar" value={eur(contract.valor_total)} />
          <Info icon={Car} label="Seguro / Manut." value={`${contract.seguro === 'S' ? 'Seguro' : 'S/seguro'} · ${contract.manutencao === 'S' ? 'C/manut.' : 'S/manut.'}`} />
          {contract.telefone && <Info icon={Phone} label="Telefone" value={contract.telefone} />}
          {contract.telemovel && <Info icon={Phone} label="Telemóvel" value={contract.telemovel} />}
          {contract.contacto && <Info icon={User} label="Contacto" value={contract.contacto} />}
          {contract.morada && <Info icon={MapPin} label="Morada" value={[contract.morada, contract.codigo_postal].filter(Boolean).join(', ')} className="col-span-2 sm:col-span-3" />}
        </div>

        {/* Atribuição a um vendedor (só o chefe de vendas). O contrato passa a
            aparecer no "mapa" do vendedor e o follow-up é feito na vista dele. */}
        {isDirector && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsável de follow-up</Label>
            <Select value={contract.owner_email ?? UNASSIGNED} onValueChange={changeOwner} disabled={assigning}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
                {owners.map(o => <SelectItem key={o.email} value={o.email}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Atribuir faz o contrato aparecer no mapa do vendedor. O vendedor precisa de acesso ao tab End-of-Term (tab Utilizadores).
            </p>
          </div>
        )}
        {!isDirector && contract.owner_nome && (
          <p className="text-xs text-muted-foreground">Responsável: <span className="font-medium text-foreground">{contract.owner_nome}</span></p>
        )}

        {/* Estado de acompanhamento */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={fase} onValueChange={(v) => setFase(v as Fase)} disabled={!canEdit}>
              <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FASES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Notas de acompanhamento…"
              className="flex-1 min-h-[38px] text-sm"
              disabled={!canEdit}
            />
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button size="sm" onClick={saveState} disabled={savingState} className="gap-1.5">
                {savingState ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Guardar estado
              </Button>
            </div>
          )}
        </div>

        {/* Nova atividade / agendamento */}
        {canEdit && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registar / agendar atividade</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as ActTipo)}>
                <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACT_TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="datetime-local"
                value={novoQuando}
                onChange={(e) => setNovoQuando(e.target.value)}
                className="sm:w-52"
              />
            </div>
            <Input
              value={novaDesc}
              onChange={(e) => setNovaDesc(e.target.value)}
              placeholder="Detalhe (opcional) — ex.: proposta de renovação enviada"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={novoDone} onChange={(e) => setNovoDone(e.target.checked)} className="rounded border-border" />
                Já realizada (histórico). Caso contrário, fica agendada.
              </label>
              <Button size="sm" onClick={addActivity} disabled={addingAct} className="gap-1.5">
                {addingAct ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar
              </Button>
            </div>
          </div>
        )}

        {/* Histórico + agenda */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Atividades {activities.length > 0 && <span className="text-muted-foreground/60">({activities.length})</span>}
          </Label>
          {loadingActs ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : activities.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Sem atividades registadas.</p>
          ) : (
            <ul className="space-y-1.5">
              {activities.map(a => {
                const overdue = isOverdue(a);
                const when = a.due_at ? relativeLabel(a.due_at, a.done) : null;
                return (
                  <li key={a.id} className={cn(
                    'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs',
                    a.done ? 'border-border bg-muted/20' : overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border',
                  )}>
                    <button
                      onClick={() => canEdit && toggleDone(a)}
                      disabled={!canEdit}
                      className={cn(
                        'mt-0.5 grid place-items-center h-4 w-4 rounded border shrink-0',
                        a.done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40',
                        canEdit && 'cursor-pointer',
                      )}
                      title={a.done ? 'Marcar como pendente' : 'Marcar como realizada'}
                    >
                      {a.done && <Check className="h-3 w-3" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground">{actTipoLabel(a.tipo)}</span>
                        {when && (
                          <span className={cn('text-[11px]', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                            · {a.done ? 'agendado ' : ''}{when.text}
                          </span>
                        )}
                        {a.done && <span className="text-[11px] text-emerald-600 dark:text-emerald-400">· feito</span>}
                      </div>
                      {a.descricao && <p className="text-muted-foreground mt-0.5 break-words">{a.descricao}</p>}
                    </div>
                    {canEdit && (
                      <button onClick={() => removeAct(a)} className="text-muted-foreground/50 hover:text-destructive shrink-0" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon: Icon, label, value, tone = 'default', className }: {
  icon: typeof Car; label: string; value: string; tone?: 'default' | 'danger'; className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn('truncate font-medium', tone === 'danger' ? 'text-destructive' : 'text-foreground')} title={value}>
        {value}
      </div>
    </div>
  );
}

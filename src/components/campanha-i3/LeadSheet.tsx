import { useEffect, useState } from 'react';
import { History, Loader2, Mail, MessageCircle, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  ESTADOS, diasDesde, estadoDef, fmtDia, historicoLabel, isAtrasada, isParada, listHistorico, parseDia, cleanPhone,
  telHref, updateAcompanhamento, updateDados, whatsappHref,
  type Estado, type HistoricoItem, type Lead,
} from '@/lib/campanha-i3';

const fmtQuando = (iso: string): string =>
  new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Props {
  lead: Lead | null;
  /** Pode guardar o acompanhamento (vendedor com edição no tab, ou administrador). */
  canEdit: boolean;
  /** Administrador: corrige os dados do contacto e apaga. */
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (l: Lead) => void;
  onDelete: (l: Lead) => void;
}

export function LeadSheet({ lead, canEdit, isAdmin, onClose, onSaved, onDelete }: Props) {
  return (
    <Sheet open={!!lead} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {lead && (
          <LeadForm key={`${lead.id}-${lead.updated_at}`} lead={lead} canEdit={canEdit} isAdmin={isAdmin} onSaved={onSaved} onDelete={onDelete} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeadForm({ lead, canEdit, isAdmin, onSaved, onDelete }: Omit<Props, 'lead' | 'onClose'> & { lead: Lead }) {
  const [estado, setEstado] = useState<Estado>(lead.estado);
  const [ponto, setPonto] = useState(lead.ponto_situacao ?? '');
  const [obs, setObs] = useState(lead.observacoes ?? '');
  const [proximo, setProximo] = useState(lead.proximo_contacto ?? '');
  const [saving, setSaving] = useState(false);
  const [hist, setHist] = useState<HistoricoItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Dados do contacto (administrador)
  const [nome, setNome] = useState(lead.nome);
  const [email, setEmail] = useState(lead.email ?? '');
  const [contacto, setContacto] = useState(lead.contacto ?? '');
  const [data, setData] = useState(lead.data_contacto ?? '');
  const [polo, setPolo] = useState(lead.polo ?? '');

  useEffect(() => {
    let alive = true;
    listHistorico(lead.id).then(h => { if (alive) setHist(h); });
    return () => { alive = false; };
  }, [lead.id, lead.updated_at]);

  const dirty = estado !== lead.estado || ponto.trim() !== (lead.ponto_situacao ?? '') || obs.trim() !== (lead.observacoes ?? '')
    || proximo !== (lead.proximo_contacto ?? '');
  const dadosDirty = isAdmin && (nome.trim() !== lead.nome || email.trim().toLowerCase() !== (lead.email ?? '')
    || (cleanPhone(contacto) ?? '') !== (lead.contacto ?? '') || data !== (lead.data_contacto ?? '') || polo.trim() !== (lead.polo ?? ''));

  const guardar = async () => {
    setSaving(true);
    try {
      let l = lead;
      if (dirty) l = await updateAcompanhamento(lead.id, { estado, ponto_situacao: ponto, observacoes: obs, proximo_contacto: proximo || null });
      toast.success('Acompanhamento guardado.');
      onSaved(l);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar.');
    } finally {
      setSaving(false);
    }
  };

  const guardarDados = async () => {
    if (!nome.trim()) { toast.error('O nome é obrigatório.'); return; }
    setSaving(true);
    try {
      const l = await updateDados(lead.id, {
        nome: nome.trim(), email: email.trim() || null, contacto: cleanPhone(contacto),
        data_contacto: data ? (parseDia(data) ?? null) : null, polo: polo.trim() || null,
      });
      toast.success('Dados guardados.');
      onSaved(l);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar.');
    } finally {
      setSaving(false);
    }
  };

  const tel = telHref(lead.contacto);
  const wa = whatsappHref(lead.contacto);
  const atrasada = isAtrasada(lead);
  const parada = isParada(lead);
  const est = estadoDef(lead.estado);

  return (
    <div className="space-y-5">
      <SheetHeader className="text-left">
        <SheetTitle>{lead.nome}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-medium', est.cls)}>{est.label}</span>
            {atrasada && <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">Contacto atrasado</span>}
            {parada && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">Sem acompanhamento</span>}
            {lead.polo && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{lead.polo}</span>}
          </div>
        </SheetDescription>
      </SheetHeader>

      <section className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-2">
          {tel && <Button asChild size="sm" variant="outline"><a href={tel}><Phone className="mr-1.5 h-4 w-4" />{lead.contacto}</a></Button>}
          {wa && <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>}
          {lead.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${lead.email}`}><Mail className="mr-1.5 h-4 w-4" />{lead.email}</a></Button>}
        </div>
        <p className="text-xs text-muted-foreground">
          Contactou em {fmtDia(lead.data_contacto)}
          {lead.data_contacto ? ` (há ${diasDesde(lead.data_contacto)} d)` : ''}
          {lead.owner_nome || lead.owner_email ? ` · Delegada a ${lead.owner_nome ?? lead.owner_email}` : ' · Por delegar'}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Acompanhamento</h3>
        <div className="space-y-1.5">
          <Label htmlFor="estado">Estado</Label>
          <Select value={estado} onValueChange={v => setEstado(v as Estado)} disabled={!canEdit}>
            <SelectTrigger id="estado" aria-label="Estado"><SelectValue /></SelectTrigger>
            <SelectContent>{ESTADOS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ponto">Ponto de situação</Label>
          <Textarea id="ponto" value={ponto} onChange={e => setPonto(e.target.value)} rows={3} disabled={!canEdit}
            placeholder="Onde está este contacto? Ex.: liguei, ficou de ver com a mulher; marcado test drive sábado…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="obs">Observações</Label>
          <Textarea id="obs" value={obs} onChange={e => setObs(e.target.value)} rows={3} disabled={!canEdit} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proximo">Próximo contacto</Label>
          <Input id="proximo" type="date" value={proximo} onChange={e => setProximo(e.target.value)} disabled={!canEdit} />
        </div>
        {canEdit && (
          <Button type="button" onClick={() => void guardar()} disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Guardar
          </Button>
        )}
      </section>

      {isAdmin && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Dados do contacto</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label htmlFor="d-nome">Nome</Label><Input id="d-nome" value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="d-email">E-mail</Label><Input id="d-email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="d-contacto">Contacto</Label><Input id="d-contacto" value={contacto} onChange={e => setContacto(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="d-data">Data contacto</Label><Input id="d-data" type="date" value={data} onChange={e => setData(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="d-polo">Polo</Label><Input id="d-polo" value={polo} onChange={e => setPolo(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={() => void guardarDados()} disabled={saving || !dadosDirty}>Guardar dados</Button>
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Apagar
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2 border-t pt-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" /> Histórico</h3>
        {hist.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem registos.</p>
        ) : (
          <ul className="space-y-2">
            {hist.map(h => (
              <li key={h.id} className="text-xs">
                <span>{historicoLabel(h)}</span>
                <span className="block text-muted-foreground">{fmtQuando(h.created_at)}{h.autor ? ` · ${h.autor}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta oportunidade?</AlertDialogTitle>
            <AlertDialogDescription>
              {lead.nome} e o respetivo histórico deixam de existir. Se a lista for importada outra vez, volta a entrar como nova.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(lead)}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

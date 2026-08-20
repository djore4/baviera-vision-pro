import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Phone, Mail, Building2, Check, CalendarClock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  FASES, FONTES, FLEET_TIERS, INTERACTION_TIPOS, computeScore,
  type Account, type AccountPatch, type Contact, type Interaction, type Task,
  type Fase, type Fonte, type InteractionTipo,
  createAccount, updateAccount, deleteAccount,
  listContacts, createContact, deleteContact,
  listInteractions, createInteraction, deleteInteraction,
  listTasks, createTask, setTaskDone, deleteTask,
} from '@/lib/prospec';

/* Seletor 1–5 (potencial / relação). */
function Score15({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-7 w-7 rounded text-xs font-semibold border transition-colors ${
            (value ?? 0) >= n
              ? 'bg-bmw-blue text-white border-bmw-blue'
              : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
/* datetime-local <-> ISO */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: Account | null;               // null → criar nova
  myEmail: string | null;
  myNome: string | null;
  onChanged: () => void;                 // pai recarrega listas
}

export function AccountDialog({ open, onOpenChange, account, myEmail, myNome, onChanged }: Props) {
  const isNew = !account;

  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState('');
  const [potencial, setPotencial] = useState<number | null>(null);
  const [frota, setFrota] = useState<number | null>(null);
  const [relacao, setRelacao] = useState<number | null>(null);
  const [fase, setFase] = useState<Fase>('novo');
  const [fonte, setFonte] = useState<Fonte | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(account?.nome ?? '');
    setSetor(account?.setor ?? '');
    setPotencial(account?.potencial ?? null);
    setFrota(account?.dimensao_frota ?? null);
    setRelacao(account?.relacao ?? null);
    setFase(account?.fase ?? 'novo');
    setFonte((account?.fonte ?? '') as Fonte | '');
  }, [open, account]);

  const liveScore = computeScore(potencial, frota, relacao);

  const saveAccount = async () => {
    if (!nome.trim()) { toast.error('Indica o nome da empresa.'); return; }
    setSaving(true);
    try {
      const patch: AccountPatch = {
        nome: nome.trim(), setor: setor.trim() || null,
        potencial, dimensao_frota: frota, relacao,
        fase, fonte: (fonte || null) as Fonte | null,
      };
      if (isNew) {
        await createAccount({
          ...patch, nome: nome.trim(),
          owner_email: myEmail, owner_nome: myNome, created_by: myEmail,
        });
        toast.success('Conta criada.');
        onChanged();
        onOpenChange(false);
      } else {
        await updateAccount(account!.id, patch);
        toast.success('Conta atualizada.');
        onChanged();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeAccount = async () => {
    if (!account) return;
    if (!confirm(`Eliminar a conta "${account.nome}" e todos os dados associados?`)) return;
    try {
      await deleteAccount(account.id);
      toast.success('Conta eliminada.');
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-bmw-blue" />
            {isNew ? 'Nova conta' : account!.nome}
          </DialogTitle>
        </DialogHeader>

        {/* ── Formulário da conta ── */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Empresa</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da empresa" />
            </div>
            <div className="space-y-1">
              <Label>Setor / indústria</Label>
              <Input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex.: Construção" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Potencial</Label>
              <Score15 value={potencial} onChange={setPotencial} />
            </div>
            <div className="space-y-1">
              <Label>Relação</Label>
              <Score15 value={relacao} onChange={setRelacao} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Dimensão da frota</Label>
            <div className="flex flex-wrap gap-1.5">
              {FLEET_TIERS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setFrota(t.value)}
                  className={`h-8 px-3 rounded text-xs font-medium border transition-colors ${
                    frota === t.value
                      ? 'bg-bmw-blue text-white border-bmw-blue'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Score composto: <span className="font-semibold text-foreground">{liveScore.toFixed(2)}</span>
            <span className="ml-1">(pesos 0.5 · 0.3 · 0.2)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Fase no funil</Label>
              <Select value={fase} onValueChange={v => setFase(v as Fase)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FASES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fonte do lead</Label>
              <Select value={fonte || undefined} onValueChange={v => setFonte(v as Fonte)}>
                <SelectTrigger><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {FONTES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            {!isNew && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={removeAccount}>
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
            )}
            <div className="ml-auto">
              <Button onClick={saveAccount} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {isNew ? 'Criar conta' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Sub-secções (só após a conta existir) ── */}
        {!isNew && (
          <Tabs defaultValue="contactos" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="contactos" className="flex-1">Contactos</TabsTrigger>
              <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
              <TabsTrigger value="proxima" className="flex-1">Próxima ação</TabsTrigger>
            </TabsList>
            <TabsContent value="contactos"><ContactsSection accountId={account!.id} /></TabsContent>
            <TabsContent value="historico"><InteractionsSection accountId={account!.id} autor={myNome ?? myEmail} /></TabsContent>
            <TabsContent value="proxima">
              <NextActionsSection accountId={account!.id} myEmail={myEmail} myNome={myNome} onChanged={onChanged} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Contactos ───────────────────────────────────────────────────────────────── */
function ContactsSection({ accountId }: { accountId: string }) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [fonte, setFonte] = useState('');

  const load = useCallback(async () => {
    try { setRows(await listContacts(accountId)); } catch (e) { toast.error((e as Error).message); }
  }, [accountId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!nome.trim()) { toast.error('Nome do contacto?'); return; }
    try {
      await createContact({ account_id: accountId, nome: nome.trim(), cargo: cargo.trim() || undefined, email: email.trim() || undefined, telefone: telefone.trim() || undefined, fonte: fonte.trim() || undefined });
      setNome(''); setCargo(''); setEmail(''); setTelefone(''); setFonte('');
      load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (id: string) => { try { await deleteContact(id); load(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Sem contactos.</p>}
        {rows.map(c => (
          <div key={c.id} className="flex items-start justify-between gap-2 rounded border border-border p-2 text-sm">
            <div>
              <div className="font-medium">{c.nome}{c.cargo && <span className="text-muted-foreground font-normal"> · {c.cargo}</span>}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                {c.telefone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefone}</span>}
                {c.fonte && <span className="rounded bg-muted px-1.5 py-0.5">{c.fonte}</span>}
              </div>
            </div>
            <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" />
        <Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Cargo" />
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <Input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="Telefone" />
        <Input value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Fonte (ex.: Lusha)" />
        <Button variant="secondary" onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
      </div>
    </div>
  );
}

/* ── Histórico de interações ─────────────────────────────────────────────────── */
function InteractionsSection({ accountId, autor }: { accountId: string; autor: string | null }) {
  const [rows, setRows] = useState<Interaction[]>([]);
  const [tipo, setTipo] = useState<InteractionTipo>('chamada');
  const [nota, setNota] = useState('');
  const [quando, setQuando] = useState(toLocalInput(new Date().toISOString()));

  const load = useCallback(async () => {
    try { setRows(await listInteractions(accountId)); } catch (e) { toast.error((e as Error).message); }
  }, [accountId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    try {
      await createInteraction({ account_id: accountId, tipo, autor: autor ?? undefined, nota: nota.trim() || undefined, occurred_at: quando ? new Date(quando).toISOString() : undefined });
      setNota('');
      load();
    } catch (e) { toast.error((e as Error).message); }
  };
  const remove = async (id: string) => { try { await deleteInteraction(id); load(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Sem interações registadas.</p>}
        {rows.map(i => (
          <div key={i.id} className="flex items-start justify-between gap-2 rounded border border-border p-2 text-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-bmw-blue/10 text-bmw-blue px-1.5 py-0.5 text-xs font-medium capitalize">
                  {INTERACTION_TIPOS.find(t => t.value === i.tipo)?.label ?? i.tipo}
                </span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(i.occurred_at)}</span>
              </div>
              {i.nota && <p className="text-xs mt-1 whitespace-pre-wrap">{i.nota}</p>}
              {i.autor && <p className="text-[10px] text-muted-foreground mt-0.5">{i.autor}</p>}
            </div>
            <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Select value={tipo} onValueChange={v => setTipo(v as InteractionTipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INTERACTION_TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} />
        </div>
        <Textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota…" rows={2} />
        <Button variant="secondary" onClick={add}><Plus className="h-4 w-4 mr-1" />Registar interação</Button>
      </div>
    </div>
  );
}

/* ── Próxima ação (tarefas type=next_action ligadas à conta) ─────────────────── */
function NextActionsSection({ accountId, myEmail, myNome, onChanged }: {
  accountId: string; myEmail: string | null; myNome: string | null; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Task[]>([]);
  const [descricao, setDescricao] = useState('');
  const [quando, setQuando] = useState('');

  const load = useCallback(async () => {
    try {
      // Escopo direto por conta (o dono já vê as suas; admin vê todas as da conta).
      setRows(await listTasks({ isDirector: true, email: myEmail }, { types: ['next_action'], accountId, done: false }));
    } catch (e) { toast.error((e as Error).message); }
  }, [accountId, myEmail]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!descricao.trim()) { toast.error('Descreve a próxima ação.'); return; }
    try {
      await createTask({ type: 'next_action', account_id: accountId, descricao: descricao.trim(), due_at: quando ? new Date(quando).toISOString() : null, owner_email: myEmail, owner_nome: myNome, created_by: myEmail });
      setDescricao(''); setQuando('');
      load(); onChanged();
    } catch (e) { toast.error((e as Error).message); }
  };
  const complete = async (id: string) => { try { await setTaskDone(id, true); load(); onChanged(); } catch (e) { toast.error((e as Error).message); } };
  const remove = async (id: string) => { try { await deleteTask(id); load(); onChanged(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">Sem próxima ação definida.</p>}
        {rows.map(t => {
          const overdue = t.due_at && new Date(t.due_at).getTime() < Date.now();
          return (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded border border-border p-2 text-sm">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarClock className={`h-4 w-4 ${overdue ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <span>{t.descricao}</span>
                </div>
                <span className={`text-xs ${overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{fmtDate(t.due_at)}{overdue && ' · atrasada'}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => complete(t.id)} className="text-muted-foreground hover:text-green-600" title="Concluir"><Check className="h-4 w-4" /></button>
                <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição da próxima ação" />
        <div className="flex gap-2">
          <Input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} />
          <Button variant="secondary" onClick={add}><Plus className="h-4 w-4 mr-1" />Definir</Button>
        </div>
      </div>
    </div>
  );
}

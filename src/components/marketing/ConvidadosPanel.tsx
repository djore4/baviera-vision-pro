import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listUsers, type AppUser } from '@/lib/permissions';
import {
  ESTADOS_CONVIDADO, agruparPorVendedor, linkWhatsApp, resumoConvidados, telefoneWhatsApp, textoConvite,
  type Convidado, type EstadoConvidado, type MarketingEvento,
} from '@/lib/marketing';
import { addConvidado, deleteConvidado, listConvidados, updateConvidado } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/* Convidados do evento por vendedor, com controlo de presença e convite por WhatsApp. */
interface Props {
  evento: MarketingEvento;
  onChange?: (lista: Convidado[]) => void;
  /** Quem edita o tab gere os convidados de todos; os outros só os seus. */
  podeGerirTodos: boolean;
  meuEmail: string | null;
  meuNome: string | null;
}

export function ConvidadosPanel({ evento, onChange, podeGerirTodos, meuEmail, meuNome }: Props) {
  const [lista, setLista] = useState<Convidado[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [vendedor, setVendedor] = useState('');
  const [nome, setNome] = useState('');
  const [contacto, setContacto] = useState('');
  const [busy, setBusy] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLista([]); setPronto(false);
    listConvidados(evento.id).then(l => { if (vivo) { setLista(l); setPronto(true); } });
    return () => { vivo = false; };
  }, [evento.id]);
  useEffect(() => { if (podeGerirTodos) listUsers().then(setUsers).catch(() => setUsers([])); }, [podeGerirTodos]);
  // Só avisa a página depois de carregar (senão os totais piscavam a zero).
  useEffect(() => { if (pronto) onChange?.(lista); }, [pronto, lista, onChange]);

  const vendedores = useMemo(
    () => users.filter(u => u.email).sort((a, b) => (a.nome ?? a.email ?? '').localeCompare(b.nome ?? b.email ?? '', 'pt')),
    [users],
  );
  const grupos = useMemo(() => agruparPorVendedor(lista), [lista]);
  const total = useMemo(() => resumoConvidados(lista), [lista]);

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = podeGerirTodos
      ? vendedores.find(x => x.email === vendedor)
      : (meuEmail ? { email: meuEmail, nome: meuNome } : undefined);
    if (!u?.email) { toast.error('Escolhe o vendedor a quem o convidado pertence.'); return; }
    if (!nome.trim()) { toast.error('Indica o nome do convidado.'); return; }
    setBusy(true);
    try {
      const c = await addConvidado(evento.id, { vendedor_email: u.email, vendedor_nome: u.nome, nome, contacto });
      setLista(l => [...l, c]);
      setNome(''); setContacto('');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível adicionar.'); }
    finally { setBusy(false); }
  };

  const mudarEstado = async (c: Convidado, estado: EstadoConvidado) => {
    const anterior = c.estado;
    setLista(l => l.map(x => (x.id === c.id ? { ...x, estado } : x)));
    try { await updateConvidado(c.id, { estado }); }
    catch (err) {
      setLista(l => l.map(x => (x.id === c.id ? { ...x, estado: anterior } : x)));
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar.');
    }
  };

  const remover = async (c: Convidado) => {
    try { await deleteConvidado(c.id); setLista(l => l.filter(x => x.id !== c.id)); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível remover.'); }
  };

  return (
    <section data-testid="convidados" className="space-y-4">
      {/* Totais */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Convidados', String(total.total)],
          ['Confirmados', String(total.confirmados)],
          ['Compareceram', String(total.compareceram)],
          ['Assiduidade', pct(total.assiduidade)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border bg-card px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
            <div className="text-lg font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {/* Novo convidado */}
      <form onSubmit={adicionar} className={cn('grid gap-2 rounded-md border p-3', podeGerirTodos ? 'sm:grid-cols-[1fr_1.4fr_1fr_auto]' : 'sm:grid-cols-[1.4fr_1fr_auto]')}>
        {podeGerirTodos && (
          <Select value={vendedor} onValueChange={setVendedor}>
            <SelectTrigger aria-label="Vendedor"><SelectValue placeholder="Vendedor…" /></SelectTrigger>
            <SelectContent>
              {vendedores.map(u => <SelectItem key={u.email!} value={u.email!}>{u.nome || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Convidado" aria-label="Nome do convidado" />
        <Input value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Telemóvel" inputMode="tel" aria-label="Telemóvel" />
        <Button type="submit" disabled={busy}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
      </form>

      {grupos.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {podeGerirTodos ? 'Ainda sem convidados.' : 'Ainda não tens convidados neste evento.'}
        </p>
      )}

      {grupos.map(g => (
        <div key={g.email} className="overflow-hidden rounded-md border" data-testid="grupo-vendedor">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2 text-sm">
            <span className="font-semibold">{g.nome}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {plural(g.resumo.total, 'convidado', 'convidados')} · {plural(g.resumo.confirmados, 'confirmado', 'confirmados')} · {plural(g.resumo.compareceram, 'compareceu', 'compareceram')} · {pct(g.resumo.assiduidade)}
            </span>
          </div>
          <ul className="divide-y">
            {g.convidados.map(c => {
              const est = ESTADOS_CONVIDADO.find(x => x.value === c.estado)!;
              const tel = telefoneWhatsApp(c.contacto);
              const link = linkWhatsApp(textoConvite(evento, c.nome, g.nome), c.contacto);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.contacto || 'Sem contacto'}</span>
                  </span>
                  <Select value={c.estado} onValueChange={v => mudarEstado(c, v as EstadoConvidado)}>
                    <SelectTrigger aria-label={`Estado de ${c.nome}`} className={cn('h-8 w-[8.5rem] border-0 text-xs font-medium', est.cls)}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_CONVIDADO.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-success hover:text-success"
                    title={tel ? 'Enviar convite por WhatsApp' : 'Sem telemóvel válido: abre o WhatsApp para escolher o contacto'}>
                    <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Convidar ${c.nome} por WhatsApp`}><MessageCircle className="h-4 w-4" /></a>
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remover(c)} aria-label={`Remover ${c.nome}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

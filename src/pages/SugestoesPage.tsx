import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Lightbulb, RefreshCw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePermissions } from '@/contexts/PermissionsContext';
import { cn } from '@/lib/utils';
import { TABS } from '@/lib/permissions';
import {
  ESTADOS, TIPOS, atualizarSugestao, eliminarSugestao, estadoDef, fmtData, listarSugestoes, tipoDef,
  type Estado, type Sugestao,
} from '@/lib/sugestoes';

/* ── Tab Sugestões (Administração) ────────────────────────────────────────────
 * O que os utilizadores sugeriram, corrigiram ou reportaram. 'view' lê todas;
 * 'edit' muda o estado, responde ao autor (que vê a resposta em Definições) e apaga.
 * ──────────────────────────────────────────────────────────────────────────── */

const paginaLabel = (p: string | null) => (p ? TABS.find(t => t.path === p)?.label ?? p : null);

export default function SugestoesPage() {
  const { canEdit } = usePermissions();
  const editable = canEdit('sugestoes');

  const [lista, setLista] = useState<Sugestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado | 'ativas' | 'todas'>('ativas');
  const [tipo, setTipo] = useState<string>('all');
  const [q, setQ] = useState('');
  const [aberta, setAberta] = useState<Sugestao | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLista(await listarSugestoes()); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    lista.forEach(s => { c[s.estado] = (c[s.estado] ?? 0) + 1; });
    return c;
  }, [lista]);

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return lista.filter(s => {
      if (estado === 'ativas' ? (s.estado === 'feita' || s.estado === 'recusada') : estado !== 'todas' && s.estado !== estado) return false;
      if (tipo !== 'all' && s.tipo !== tipo) return false;
      if (!t) return true;
      return [s.titulo, s.descricao, s.autor_nome, s.autor_email, s.resposta].some(v => (v ?? '').toLowerCase().includes(t));
    });
  }, [lista, estado, tipo, q]);

  const chip = (value: typeof estado, label: string, n?: number) => (
    <button
      key={value} type="button" onClick={() => setEstado(value)}
      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        estado === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
    >
      {label}{n !== undefined && <span className="ml-1 opacity-70">{n}</span>}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Sugestões</h1>
        <span className="text-xs text-muted-foreground">· {lista.length} no total</span>
        <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={load} aria-label="Atualizar" disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chip('ativas', 'Por tratar', (contagem.nova ?? 0) + (contagem.em_analise ?? 0) + (contagem.planeada ?? 0))}
        {ESTADOS.map(e => chip(e.value, e.label, contagem[e.value] ?? 0))}
        {chip('todas', 'Todas', lista.length)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar título, detalhes, autor…" className="h-9 pl-8" />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {erro && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</div>}
      {loading && lista.length === 0 && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {!loading && !erro && visiveis.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {lista.length === 0 ? 'Ainda ninguém enviou sugestões.' : 'Nenhuma sugestão com estes filtros.'}
        </div>
      )}

      <div className="space-y-2">
        {visiveis.map(s => (
          <button
            key={s.id} type="button" onClick={() => setAberta(s)}
            className="block w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tipoDef(s.tipo).cls}`}>{tipoDef(s.tipo).label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${estadoDef(s.estado).cls}`}>{estadoDef(s.estado).label}</span>
              {paginaLabel(s.pagina) && <span className="text-[10px] text-muted-foreground">em {paginaLabel(s.pagina)}</span>}
              <span className="ml-auto text-[10px] text-muted-foreground">{fmtData(s.created_at)}</span>
            </div>
            <p className="mt-1 text-sm font-semibold">{s.titulo}</p>
            {s.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.descricao}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">{s.autor_nome || s.autor_email}{s.resposta && ' · respondida'}</p>
          </button>
        ))}
      </div>

      <DetalheDialog sugestao={aberta} editable={editable} onClose={() => setAberta(null)} onChanged={load} />
    </div>
  );
}

function DetalheDialog({ sugestao, editable, onClose, onChanged }: {
  sugestao: Sugestao | null; editable: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [estado, setEstado] = useState<Estado>('nova');
  const [resposta, setResposta] = useState('');
  const [saving, setSaving] = useState(false);
  const [apagar, setApagar] = useState(false);

  useEffect(() => {
    if (sugestao) { setEstado(sugestao.estado); setResposta(sugestao.resposta ?? ''); }
  }, [sugestao]);

  const alterado = !!sugestao && (estado !== sugestao.estado || resposta.trim() !== (sugestao.resposta ?? ''));

  const guardar = async () => {
    if (!sugestao) return;
    setSaving(true);
    try {
      await atualizarSugestao(sugestao.id, { estado, resposta: resposta.trim() || null });
      toast.success('Guardado.');
      onClose();
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
    finally { setSaving(false); }
  };

  const eliminar = async () => {
    if (!sugestao) return;
    setSaving(true);
    try {
      await eliminarSugestao(sugestao.id);
      toast.success('Sugestão eliminada.');
      setApagar(false);
      onClose();
      await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível eliminar.'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <Dialog open={!!sugestao} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {sugestao && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="pr-6">{sugestao.titulo}</DialogTitle>
                <DialogDescription>
                  {tipoDef(sugestao.tipo).label} · {sugestao.autor_nome || sugestao.autor_email} · {fmtData(sugestao.created_at)}
                  {paginaLabel(sugestao.pagina) && ` · em ${paginaLabel(sugestao.pagina)}`}
                </DialogDescription>
              </DialogHeader>
              {sugestao.descricao
                ? <p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm">{sugestao.descricao}</p>
                : <p className="text-sm text-muted-foreground">Sem detalhes.</p>}
              {sugestao.autor_nome && <p className="text-xs text-muted-foreground">{sugestao.autor_email}</p>}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={estado} onValueChange={v => setEstado(v as Estado)} disabled={!editable}>
                    <SelectTrigger aria-label="Estado"><SelectValue /></SelectTrigger>
                    <SelectContent>{ESTADOS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sug-resposta">Resposta ao autor</Label>
                  <Textarea id="sug-resposta" value={resposta} onChange={e => setResposta(e.target.value)} rows={3}
                    disabled={!editable} placeholder={editable ? 'O autor vê isto em Definições.' : ''} />
                </div>
              </div>

              {editable && (
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button variant="ghost" className="gap-1.5 text-destructive" onClick={() => setApagar(true)} disabled={saving}>
                    <Trash2 className="h-4 w-4" /> Eliminar
                  </Button>
                  <Button onClick={guardar} disabled={saving || !alterado} className="gap-1.5">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={apagar} onOpenChange={setApagar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar esta sugestão?</AlertDialogTitle>
            <AlertDialogDescription>Deixa também de aparecer ao autor. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void eliminar(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

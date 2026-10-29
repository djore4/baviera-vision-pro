import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { assignLeads, distribuir, isAtiva, polosUsados, type Lead, type Vendedor } from '@/lib/campanha-i3';

interface Props {
  open: boolean;
  leads: Lead[];
  vendedores: Vendedor[];
  onClose: () => void;
  onDone: (atualizadas: Lead[]) => void;
}

/* Reparte equitativamente as oportunidades por delegar pelos vendedores escolhidos (os
 * que já têm menos recebem primeiro). Cada vendedor recebe um único aviso. */
export function DistribuirDialog({ open, leads, vendedores, onClose, onDone }: Props) {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [polo, setPolo] = useState('all');
  const [busy, setBusy] = useState(false);

  const porDelegar = useMemo(
    () => leads.filter(l => isAtiva(l) && !l.owner_email && (polo === 'all' || l.polo === polo)),
    [leads, polo]);

  const carga = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) if (l.owner_email && isAtiva(l)) c[l.owner_email] = (c[l.owner_email] ?? 0) + 1;
    return c;
  }, [leads]);

  const quem = useMemo(() => vendedores.filter(v => escolhidos.has(v.email)), [vendedores, escolhidos]);
  const plano = useMemo(() => distribuir(porDelegar.map(l => l.id), quem, carga), [porDelegar, quem, carga]);

  const toggle = (email: string, on: boolean) =>
    setEscolhidos(s => { const n = new Set(s); if (on) n.add(email); else n.delete(email); return n; });

  const confirm = async () => {
    setBusy(true);
    try {
      const atualizadas: Lead[] = [];
      for (const v of quem) {
        const ids = plano.get(v.email) ?? [];
        if (ids.length) atualizadas.push(...await assignLeads(ids, v));
      }
      toast.success(`${atualizadas.length} oportunidades delegadas.`);
      onDone(atualizadas);
      setEscolhidos(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível delegar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribuir oportunidades</DialogTitle>
          <DialogDescription>
            Reparte por igual as oportunidades por delegar pelos vendedores escolhidos, tendo em conta o que cada um já tem em curso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Polo</Label>
            <Select value={polo} onValueChange={setPolo}>
              <SelectTrigger className="w-[200px]" aria-label="Polo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {polosUsados(leads).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground" data-testid="por-delegar-n">
              {porDelegar.length} por delegar
            </span>
          </div>

          <ul className="space-y-1.5">
            {vendedores.map(v => {
              const on = escolhidos.has(v.email);
              const novas = plano.get(v.email)?.length ?? 0;
              return (
                <li key={v.email} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Checkbox id={`v-${v.email}`} checked={on} onCheckedChange={c => toggle(v.email, c === true)} />
                  <Label htmlFor={`v-${v.email}`} className="flex-1 cursor-pointer text-sm">{v.nome}</Label>
                  <span className="text-xs text-muted-foreground">
                    {carga[v.email] ?? 0} em curso{on && novas > 0 ? ` · +${novas}` : ''}
                  </span>
                </li>
              );
            })}
            {vendedores.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Nenhuma função com acesso ao tab. Dá acesso em Utilizadores → Funções.
              </li>
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || quem.length === 0 || porDelegar.length === 0}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Delegar {porDelegar.length > 0 && quem.length > 0 ? porDelegar.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { TABS } from '@/lib/permissions';
import { DESCRICAO_MAX, TIPOS, TITULO_MAX, criarSugestao, type Tipo } from '@/lib/sugestoes';

/* Partilhar uma ideia, pedir uma correção ou reportar um problema, a partir de
 * qualquer página. Regista a página em que estava, para a gestão saber a que se
 * refere. */
export function SugestaoDialog({ open, onOpenChange, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSent?: () => void;
}) {
  const { pathname } = useLocation();
  const [tipo, setTipo] = useState<Tipo>('ideia');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [saving, setSaving] = useState(false);

  const pagina = TABS.find(t => t.path === pathname)?.label ?? (pathname === '/definicoes' ? 'Definições' : pathname);

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { setTipo('ideia'); setTitulo(''); setDescricao(''); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      await criarSugestao({ tipo, titulo, descricao, pagina: pathname });
      toast.success('Obrigado! A tua sugestão foi enviada.');
      close(false);
      onSent?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar a sugestão.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Sugerir uma melhoria</DialogTitle>
          <DialogDescription>Uma ideia, uma correção ou algo que não funciona. A equipa lê tudo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tipo">
            {TIPOS.map(t => (
              <button
                key={t.value} type="button" role="radio" aria-checked={tipo === t.value} onClick={() => setTipo(t.value)}
                className={cn('rounded-md border px-2 py-2 text-left transition-colors',
                  tipo === t.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted')}
              >
                <span className="block text-xs font-semibold">{t.label}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sug-titulo">Título</Label>
            <Input id="sug-titulo" value={titulo} maxLength={TITULO_MAX} onChange={e => setTitulo(e.target.value)}
              placeholder="Em poucas palavras" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sug-desc">Detalhes <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="sug-desc" value={descricao} maxLength={DESCRICAO_MAX} onChange={e => setDescricao(e.target.value)}
              rows={4} placeholder="O que acontece, o que gostavas que acontecesse, porque ajudava…" />
          </div>
          <p className="text-[11px] text-muted-foreground">Enviado a partir de: <b>{pagina}</b></p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !titulo.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CORES_CATEGORIA, type Categoria } from '@/lib/marketing';
import { deleteCategoria, saveCategoria } from '@/lib/marketing-data';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categorias: Categoria[];
  onChange: (lista: Categoria[]) => void;
}

/* Gestão das categorias: renomear, mudar a cor, acrescentar e apagar (só se não tiverem eventos). */
export function CategoriasDialog({ open, onOpenChange, categorias, onChange }: Props) {
  const [novo, setNovo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const erro = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Não foi possível guardar.');

  const guardar = async (c: Categoria, patch: Partial<Pick<Categoria, 'nome' | 'cor'>>) => {
    const nome = (patch.nome ?? c.nome).trim();
    if (!nome) return;
    if (nome === c.nome && (patch.cor ?? c.cor) === c.cor) return;
    setBusy(c.id);
    try {
      const nova = await saveCategoria({ id: c.id, nome, cor: patch.cor ?? c.cor });
      onChange(categorias.map(x => (x.id === c.id ? nova : x)));
    } catch (e) { erro(e); } finally { setBusy(null); }
  };

  const apagar = async (c: Categoria) => {
    setBusy(c.id);
    try {
      await deleteCategoria(c.id);
      onChange(categorias.filter(x => x.id !== c.id));
    } catch (e) { erro(e); } finally { setBusy(null); }
  };

  const adicionar = async () => {
    const nome = novo.trim();
    if (!nome) return;
    setBusy('novo');
    try {
      const cor = CORES_CATEGORIA[categorias.length % CORES_CATEGORIA.length].hsl;
      const ordem = categorias.reduce((m, c) => Math.max(m, c.ordem), 0) + 1;
      const c = await saveCategoria({ nome, cor, ordem });
      onChange([...categorias, c]);
      setNovo('');
    } catch (e) { erro(e); } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Categorias</DialogTitle>
          <DialogDescription>Usadas para agrupar e filtrar os eventos. Só se apaga uma categoria sem eventos.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {categorias.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Input
                defaultValue={c.nome}
                aria-label={`Nome da categoria ${c.nome}`}
                className="h-8 min-w-[8rem] flex-1"
                disabled={busy === c.id}
                onBlur={e => guardar(c, { nome: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
              <div className="flex gap-1" role="group" aria-label={`Cor de ${c.nome}`}>
                {CORES_CATEGORIA.map(cor => (
                  <button
                    key={cor.hsl}
                    type="button"
                    title={cor.nome}
                    aria-label={cor.nome}
                    aria-pressed={c.cor === cor.hsl}
                    disabled={busy === c.id}
                    onClick={() => guardar(c, { cor: cor.hsl })}
                    className={cn('h-5 w-5 rounded-full border-2 transition-transform hover:scale-110', c.cor === cor.hsl ? 'border-foreground' : 'border-transparent')}
                    style={{ background: `hsl(${cor.hsl})` }}
                  />
                ))}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                aria-label={`Apagar ${c.nome}`} disabled={busy === c.id} onClick={() => apagar(c)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>

        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); adicionar(); }}>
          <Input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nova categoria…" aria-label="Nova categoria" />
          <Button type="submit" disabled={!novo.trim() || busy === 'novo'}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

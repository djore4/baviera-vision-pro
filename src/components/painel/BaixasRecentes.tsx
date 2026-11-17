import { useState } from 'react';
import { History, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { REGRAS, reporBaixa, type Baixa, type RegraId } from '@/lib/painel';

const MOTIVOS: Record<string, string> = {
  'lead-aberta': 'Lead CME aberta', 'nao-aplicavel': 'Não aplicável', 'pedido-enviado': 'Pedido enviado',
  'proposta-feita': 'Proposta feita', 'nao-pretende': 'Cliente não pretende', 'ja-tratado': 'Já tratado',
};

/** Lista das baixas recentes: quem tem dúvidas ou se enganou repõe o aviso (só as suas; o admin, todas). */
export function BaixasRecentes({ baixas, email, isAdmin, onMudou }: { baixas: Baixa[]; email: string | null; isAdmin: boolean; onMudou: () => void }) {
  const [open, setOpen] = useState(false);
  if (baixas.length === 0) return null;

  const repor = async (id: number) => {
    try { await reporBaixa(id); toast.success('Aviso reposto.'); onMudou(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground">
        <History className="h-3.5 w-3.5" /> Baixas recentes ({baixas.length})
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Baixas recentes</DialogTitle>
            <DialogDescription>Avisos que foram dados como tratados nos últimos 60 dias.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] divide-y divide-border/60 overflow-auto">
            {baixas.map(b => {
              const minha = isAdmin || b.created_by === (email ?? '').toLowerCase();
              return (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{b.descricao || 'Registo'}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {REGRAS[b.regra as RegraId]?.titulo ?? b.regra} · {MOTIVOS[b.motivo] ?? b.motivo} · {b.created_by.split('@')[0]} · {new Date(b.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                      {b.nota ? ` · “${b.nota}”` : ''}
                    </div>
                  </div>
                  {minha && <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => repor(b.id)}><Undo2 className="h-3 w-3" /> Repor</Button>}
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

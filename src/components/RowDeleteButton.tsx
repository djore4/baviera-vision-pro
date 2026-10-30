import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

/* Botão de eliminar de uma linha de tabela, com confirmação em dois passos
 * (ícone → "Eliminar? Sim / Não") para não apagar um registo por engano. Não
 * propaga o clique, para não abrir o editor da linha. */
export function RowDeleteButton({ onDelete }: { onDelete: () => Promise<unknown> | void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const confirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); setConfirming(false); }
  };

  if (busy) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="A eliminar" />;

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap" onClick={stop}>
        <span className="text-[10px] text-muted-foreground">Eliminar?</span>
        <button type="button" onClick={confirm} className="px-1.5 py-0.5 text-[10px] bg-destructive text-white rounded hover:bg-destructive/90">Sim</button>
        <button type="button" onClick={e => { e.stopPropagation(); setConfirming(false); }} className="px-1.5 py-0.5 text-[10px] border border-border rounded hover:bg-muted">Não</button>
      </span>
    );
  }

  return (
    <button type="button" title="Eliminar" aria-label="Eliminar" onClick={e => { e.stopPropagation(); setConfirming(true); }}
      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

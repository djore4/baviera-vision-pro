import { useEffect, useMemo, useState } from 'react';
import { Car, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addViaturaEvento, deleteViaturaEvento, descreverViatura, listParque, listViaturasEvento,
  type ViaturaEvento, type ViaturaParque,
} from '@/lib/marketing-data';

/* Viaturas do evento: escolhidas do parque (qualquer local, incluindo demos) ou
 * escritas à mão — uma viatura nova que ainda não está no parque não bloqueia. */
export function ViaturasPanel({ eventoId, readOnly = false }: { eventoId: string; readOnly?: boolean }) {
  const [lista, setLista] = useState<ViaturaEvento[]>([]);
  const [parque, setParque] = useState<ViaturaParque[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLista([]); setParque(null); setQ('');
    listViaturasEvento(eventoId).then(l => { if (vivo) setLista(l); });
    if (!readOnly) listParque().then(p => { if (vivo) setParque(p); });
    return () => { vivo = false; };
  }, [eventoId, readOnly]);

  const jaNoEvento = useMemo(() => new Set(lista.map(v => v.chassis).filter(Boolean)), [lista]);

  const sugestoes = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t || !parque) return [];
    return parque
      .filter(v => !jaNoEvento.has(v.chassis))
      .filter(v => `${descreverViatura(v)} ${v.chassis} ${v.local}`.toLowerCase().includes(t))
      .slice(0, 6);
  }, [q, parque, jaNoEvento]);

  const adicionar = async (v: { chassis?: string | null; descricao: string; local?: string | null }) => {
    setBusy(true);
    try {
      const nova = await addViaturaEvento(eventoId, v);
      setLista(l => [...l, nova]);
      setQ('');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível adicionar a viatura.'); }
    finally { setBusy(false); }
  };

  const remover = async (v: ViaturaEvento) => {
    try { await deleteViaturaEvento(v.id); setLista(l => l.filter(x => x.id !== v.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível remover a viatura.'); }
  };

  return (
    <section data-testid="viaturas" className="space-y-3">
      {lista.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Ainda sem viaturas neste evento.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map(v => (
            <li key={v.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <Car className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{v.descricao}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {v.chassis ? 'Do parque' : 'Adicionada à mão'}{v.local ? ` · ${v.local}` : ''}
                </span>
              </span>
              {!readOnly && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remover(v)} aria-label={`Remover ${v.descricao}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (q.trim()) adicionar({ descricao: q }); }}>
        <div className="flex gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} aria-label="Procurar ou escrever viatura"
            placeholder="Procurar no parque (modelo, matrícula, chassis) ou escrever uma viatura nova…" />
          <Button type="submit" variant="outline" disabled={!q.trim() || busy} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
        {q.trim() && (
          <ul className="overflow-hidden rounded-md border text-sm" aria-label="Viaturas do parque">
            {sugestoes.map(v => (
              <li key={v.chassis}>
                <button type="button" disabled={busy} onClick={() => adicionar({ chassis: v.chassis, descricao: descreverViatura(v) || v.chassis, local: v.local })}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted">
                  <span className="truncate">{descreverViatura(v) || v.chassis}</span>
                  {v.local && <span className="shrink-0 text-xs text-muted-foreground">{v.local}</span>}
                </button>
              </li>
            ))}
            <li className="bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
              {parque === null ? 'A procurar no parque…' : sugestoes.length === 0 ? 'Sem resultados no parque. ' : ''}
              Carrega em “Adicionar” para juntar “{q.trim()}” tal como escreveste.
            </li>
          </ul>
        )}
      </form>}
    </section>
  );
}

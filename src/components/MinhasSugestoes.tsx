import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/App';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SugestaoDialog } from '@/components/SugestaoDialog';
import { estadoDef, fmtData, listarMinhas, tipoDef, type Sugestao } from '@/lib/sugestoes';

/* As sugestões do próprio utilizador e o que a equipa respondeu (Definições). */
export function MinhasSugestoes() {
  const { session } = useAuth();
  const email = session?.user.email ?? null;
  const [lista, setLista] = useState<Sugestao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const load = useCallback(async () => {
    if (!email) return;
    try { setLista(await listarMinhas(email)); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar.'); setLista([]); }
  }, [email]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4" /> As minhas sugestões</span>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setNovaAberta(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {lista === null && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        {lista?.length === 0 && !erro && (
          <p className="text-sm text-muted-foreground">Ainda não enviaste nenhuma. Tens uma ideia ou viste algo que podia melhorar?</p>
        )}
        {lista?.map(s => (
          <div key={s.id} className="rounded-md border border-border p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tipoDef(s.tipo).cls}`}>{tipoDef(s.tipo).label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${estadoDef(s.estado).cls}`}>{estadoDef(s.estado).label}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{fmtData(s.created_at)}</span>
            </div>
            <p className="mt-1 text-sm font-medium">{s.titulo}</p>
            {s.resposta && (
              <p className="mt-1.5 rounded bg-muted/60 px-2 py-1.5 text-xs"><span className="font-semibold">Resposta: </span>{s.resposta}</p>
            )}
          </div>
        ))}
      </CardContent>
      <SugestaoDialog open={novaAberta} onOpenChange={setNovaAberta} onSent={load} />
    </Card>
  );
}

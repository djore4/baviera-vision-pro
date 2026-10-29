import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { fmtDataHora } from '@/lib/atividade';
import {
  TABELAS_IMPORTACAO, listarImportacoes, restaurarImportacao, type Importacao,
} from '@/lib/importacoes';

/* Histórico das importações (quem, quando, de que ficheiro, quantos registos) e restauro
 * do que cada uma substituiu. As cópias são as últimas 10 por tabela. */

const quem = (por: string) => por.split('@')[0] || '—';

interface Props {
  /** Chamado depois de restaurar, para a app recarregar os dados. */
  onRestored?: () => void;
}

export function ImportHistory({ onRestored }: Props) {
  const [lista, setLista] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Importacao | null>(null);
  const [aRestaurar, setARestaurar] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLista(await listarImportacoes()); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const restaurar = async () => {
    if (!alvo) return;
    setARestaurar(true);
    try {
      const n = await restaurarImportacao(alvo.id);
      toast.success(`Repostos ${n} registos (${TABELAS_IMPORTACAO[alvo.tabela]}).`);
      setAlvo(null);
      await load();
      onRestored?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível restaurar.');
    } finally {
      setARestaurar(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Histórico de importações">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Histórico de importações</h2>
      </div>

      {erro ? (
        <p className="text-xs text-muted-foreground">{erro}</p>
      ) : loading && !lista.length ? (
        <div className="flex justify-center p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : lista.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ainda não há importações registadas. As próximas ficam aqui.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Dados</th>
                <th className="px-3 py-2">Ficheiro</th>
                <th className="px-3 py-2">Quem</th>
                <th className="px-3 py-2 text-right">Registos</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map(i => {
                const delta = i.linhas - i.linhas_anteriores;
                return (
                  <tr key={i.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDataHora(i.created_at)}</td>
                    <td className="px-3 py-2">
                      {TABELAS_IMPORTACAO[i.tabela]}
                      {i.origem === 'restauro' && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">restauro</span>}
                      {i.origem === 'automatica' && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">automática</span>}
                      {i.forcada && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" title={i.avisos.join('\n')}>forçada</span>}
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate" title={i.ficheiro ?? undefined}>{i.ficheiro ?? '—'}</td>
                    <td className="px-3 py-2">{quem(i.por)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title={i.avisos.join('\n') || undefined}>
                      {i.linhas}
                      <span className={delta < 0 ? 'ml-1 text-destructive' : 'ml-1 text-muted-foreground'}>
                        ({delta > 0 ? '+' : ''}{delta})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {i.temCopia && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setAlvo(i)}>
                          <RotateCcw className="h-3 w-3" />Voltar a antes
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!alvo} onOpenChange={o => { if (!o && !aRestaurar) setAlvo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar ao estado anterior a esta importação?</AlertDialogTitle>
            <AlertDialogDescription>
              {alvo && (
                <>
                  {TABELAS_IMPORTACAO[alvo.tabela]} volta a ter os <strong>{alvo.linhas_anteriores} registos</strong> que
                  existiam antes da importação de {fmtDataHora(alvo.created_at)}
                  {alvo.ficheiro ? <> ({alvo.ficheiro})</> : null}. Os dados atuais ficam guardados e podes desfazer o restauro
                  da mesma forma. Os objetivos mensais não fazem parte da cópia.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aRestaurar}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={aRestaurar} onClick={e => { e.preventDefault(); void restaurar(); }}>
              {aRestaurar ? 'A restaurar…' : 'Restaurar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

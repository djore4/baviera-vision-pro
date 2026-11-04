import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { client } from '@/clients';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { RECORDS_CHANGED_EVENT } from '@/components/RecordEditor';
import { aplicarPlano, EmailSyncError, planearSincronizacao } from '@/lib/email-sync-client';
import type { SyncIssue, SyncPatch, SyncPlan } from '@/lib/email-sync';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ROTULO: Record<keyof SyncPatch, string> = { status: 'Estado', mat: 'Matrícula', chas: 'Chassis', dmat: 'DMAT' };
const ORIGEM = { matriculas: 'Email das matrículas', pedido: 'Pedido confirmado' } as const;
const ISSUE: Record<SyncIssue['kind'], string> = {
  sem_registo: 'Sem registo', ambiguo: 'Ambíguo', conflito: 'Conflito', estado: 'Estado',
};

const fmt = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '—');

/**
 * "Sincronizar": puxa do email as matrículas atribuídas e os pedidos de matrícula
 * confirmados, mostra o que mudaria e só grava depois de o administrador confirmar.
 * Só existe nas páginas de Vendas VN e só para administradores.
 */
export default function SincronizarEmailButton() {
  const { isAdmin } = usePermissions();
  const { data, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [plano, setPlano] = useState<(SyncPlan & { desde: string }) | null>(null);
  const [aplicando, setAplicando] = useState(false);

  if (!isAdmin || !client.emailSync) return null;

  async function sincronizar() {
    setBusy(true);
    try {
      const p = await planearSincronizacao(data?.control ?? []);
      if (p.changes.length === 0 && p.issues.length === 0) {
        toast('Tudo em dia', { description: `Nada para atualizar nos emails desde ${fmt(p.desde)}.` });
      } else {
        setPlano(p);
      }
    } catch (e) {
      toast.error(e instanceof EmailSyncError ? e.message : 'Não foi possível sincronizar com o email.');
    } finally {
      setBusy(false);
    }
  }

  async function aplicar() {
    if (!plano) return;
    setAplicando(true);
    try {
      const r = await aplicarPlano(plano.changes);
      setPlano(null);
      if (r.aplicadas > 0) {
        await refresh();
        window.dispatchEvent(new CustomEvent(RECORDS_CHANGED_EVENT));
      }
      if (r.falhadas.length === 0) toast.success(`${r.aplicadas} registo${r.aplicadas === 1 ? '' : 's'} atualizado${r.aplicadas === 1 ? '' : 's'}.`);
      else toast.error(`${r.aplicadas} atualizados, ${r.falhadas.length} falharam (${r.falhadas.map(f => f.enc).join(', ')}): ${r.falhadas[0].motivo}`);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={sincronizar} disabled={busy} title="Puxar matrículas e pedidos de matrícula do email">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Sincronizar
      </Button>

      <Dialog open={!!plano} onOpenChange={o => { if (!o && !aplicando) setPlano(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sincronizar com o email</DialogTitle>
            <DialogDescription>
              Emails desde {fmt(plano?.desde)}. Confirma as alterações antes de gravar; o que não bate certo fica por tratar.
            </DialogDescription>
          </DialogHeader>

          {plano && (
            <div className="space-y-4 text-xs">
              <section>
                <h4 className="mb-1 font-semibold">Alterações ({plano.changes.length})</h4>
                {plano.changes.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma alteração a gravar.</p>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[10px] uppercase text-muted-foreground">
                        <th className="py-1 pr-2">Encomenda</th><th className="pr-2">Cliente</th><th className="pr-2">Alteração</th><th>Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.changes.map(c => (
                        <tr key={c.recordId} className="border-t border-border align-top">
                          <td className="py-1 pr-2 whitespace-nowrap">{c.enc || '—'}</td>
                          <td className="pr-2">{c.cliente || '—'}</td>
                          <td className="pr-2">
                            {(Object.keys(c.patch) as (keyof SyncPatch)[]).map(k => (
                              <div key={k}>
                                <span className="text-muted-foreground">{ROTULO[k]}: </span>
                                {fmt(k === 'dmat' ? c.antes.dmat : c.antes[k])} → <strong>{k === 'dmat' ? fmt(c.patch[k]) : c.patch[k]}</strong>
                              </div>
                            ))}
                          </td>
                          <td>{c.origem.map(o => ORIGEM[o]).join(' + ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {plano.issues.length > 0 && (
                <section>
                  <h4 className="mb-1 font-semibold">Por tratar ({plano.issues.length})</h4>
                  <ul className="space-y-1">
                    {plano.issues.map((i, n) => (
                      <li key={n} className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1">
                        <strong>{ISSUE[i.kind]}</strong> · {ORIGEM[i.origem]} · {i.ref || '—'} — {i.detalhe}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {plano.jaAtualizados > 0 && <p className="text-muted-foreground">{plano.jaAtualizados} item(ns) do email já estavam refletidos nos registos.</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPlano(null)} disabled={aplicando}>Cancelar</Button>
            <Button onClick={aplicar} disabled={aplicando || !plano || plano.changes.length === 0}>
              {aplicando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Gravar {plano?.changes.length ?? 0} alteraç{(plano?.changes.length ?? 0) === 1 ? 'ão' : 'ões'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

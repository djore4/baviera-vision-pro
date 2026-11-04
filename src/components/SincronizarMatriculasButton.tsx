import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';

interface Detalhe { id: string; enc: string; cliente: string; campos: { campo: string; de: string; para: string }[] }
interface Resposta {
  mensagens: number; pedidas: number; matriculas: number; totalIgnoradas: number;
  ignoradas: { assunto: string; motivo: string }[];
  /** Matrículas completadas / datas de matrícula acertadas pelo email diário. */
  chassis?: number; datas?: number;
  /** Só na pré-visualização e na resposta da gravação: o que muda (ou mudou). */
  detalhes?: Detalhe[];
  simulado?: boolean;
}

/** Descrição do resultado em português (separada para ser testável). */
export function resumoSync(r: Pick<Resposta, 'pedidas' | 'matriculas' | 'totalIgnoradas' | 'mensagens' | 'chassis' | 'datas'>): string {
  const partes = [
    `${r.pedidas} pedido${r.pedidas === 1 ? '' : 's'} confirmado${r.pedidas === 1 ? '' : 's'}`,
    `${r.matriculas} matrícula${r.matriculas === 1 ? '' : 's'} preenchida${r.matriculas === 1 ? '' : 's'}`,
  ];
  if (r.chassis) partes.push(`${r.chassis} chassis completo${r.chassis === 1 ? '' : 's'}`);
  if (r.datas) partes.push(`${r.datas} DMAT atualizada${r.datas === 1 ? '' : 's'}`);
  if (r.totalIgnoradas > 0) partes.push(`${r.totalIgnoradas} por tratar`);
  return `${partes.join(' · ')} (${r.mensagens} emails lidos).`;
}

const DIAS = 30;

async function chamar(simular: boolean): Promise<Resposta> {
  const { data, error } = await supabase.functions.invoke<Resposta & { error?: string }>('sync-matriculas', { body: { dias: DIAS, ...(simular ? { simular: true } : {}) } });
  if (error) {
    // Respostas não-2xx trazem a mensagem no corpo.
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? (await ctx.json().catch(() => null))?.error : null;
    throw new Error(msg ?? error.message);
  }
  if (!data || data.error) throw new Error(data?.error ?? 'Resposta inválida.');
  return data;
}

/**
 * "Sincronizar": puxa do email (Outlook) as respostas ao pedido de matrícula e o email diário
 * de matrículas. Mostra primeiro o que mudaria e só grava depois de confirmar.
 * Só administrador, só VN.
 */
export default function SincronizarMatriculasButton({ className }: { className?: string }) {
  const { isAdmin } = usePermissions();
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [previa, setPrevia] = useState<Resposta | null>(null);
  if (!isAdmin) return null;

  const erro = (err: unknown) => toast.error('Não foi possível sincronizar', { description: err instanceof Error ? err.message : undefined });

  const sincronizar = async () => {
    setBusy(true);
    try {
      const r = await chamar(true);
      if ((r.detalhes ?? []).length === 0 && r.totalIgnoradas === 0) {
        toast.success('Tudo em dia', { description: `Nada para atualizar (${r.mensagens} emails lidos).` });
      } else {
        setPrevia(r);
      }
    } catch (err) {
      erro(err);
    } finally {
      setBusy(false);
    }
  };

  const gravar = async () => {
    setBusy(true);
    try {
      const r = await chamar(false);
      setPrevia(null);
      toast.success('Sincronizado', {
        description: resumoSync(r) + (r.ignoradas.length ? `\n${r.ignoradas.slice(0, 3).map(i => `• ${i.assunto}: ${i.motivo}`).join('\n')}` : ''),
      });
      await refresh();
    } catch (err) {
      erro(err);
    } finally {
      setBusy(false);
    }
  };

  const detalhes = previa?.detalhes ?? [];
  return (
    <>
      <Button variant="outline" size="sm" className={`h-7 gap-1 text-[11px] ${className ?? ''}`} onClick={sincronizar} disabled={busy}
        title="Puxar do email as respostas ao pedido de matrícula e as matrículas atribuídas (Aveiro)">
        {busy && !previa ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Sincronizar
      </Button>

      <Dialog open={!!previa} onOpenChange={o => { if (!o && !busy) setPrevia(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sincronizar com o email</DialogTitle>
            <DialogDescription>
              {previa && resumoSync(previa)} Confirma antes de gravar; nada é sobrescrito, o que não bate certo fica por tratar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <section>
              <h4 className="mb-1 font-semibold">Alterações ({detalhes.length})</h4>
              {detalhes.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma alteração a gravar.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-muted-foreground"><th className="py-1 pr-2">Encomenda</th><th className="pr-2">Cliente</th><th>Alteração</th></tr>
                  </thead>
                  <tbody>
                    {detalhes.map(d => (
                      <tr key={d.id} className="border-t border-border align-top">
                        <td className="py-1 pr-2 whitespace-nowrap">{d.enc || '—'}</td>
                        <td className="pr-2">{d.cliente || '—'}</td>
                        <td>
                          {d.campos.map(c => (
                            <div key={c.campo}><span className="text-muted-foreground">{c.campo}: </span>{c.de} → <strong>{c.para}</strong></div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {previa && previa.ignoradas.length > 0 && (
              <section>
                <h4 className="mb-1 font-semibold">Por tratar ({previa.totalIgnoradas})</h4>
                <ul className="space-y-1">
                  {previa.ignoradas.map((i, n) => (
                    <li key={n} className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1"><strong>{i.assunto}</strong> — {i.motivo}</li>
                  ))}
                </ul>
                {previa.totalIgnoradas > previa.ignoradas.length && (
                  <p className="mt-1 text-muted-foreground">+ {previa.totalIgnoradas - previa.ignoradas.length} não mostrados.</p>
                )}
              </section>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={gravar} disabled={busy || detalhes.length === 0}>
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Gravar {detalhes.length} alteraç{detalhes.length === 1 ? 'ão' : 'ões'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';

interface Resposta {
  mensagens: number; pedidas: number; matriculas: number; totalIgnoradas: number;
  ignoradas: { assunto: string; motivo: string }[];
}

/** Descrição do resultado em português (separada para ser testável). */
export function resumoSync(r: Pick<Resposta, 'pedidas' | 'matriculas' | 'totalIgnoradas' | 'mensagens'>): string {
  const partes = [
    `${r.pedidas} pedido${r.pedidas === 1 ? '' : 's'} confirmado${r.pedidas === 1 ? '' : 's'}`,
    `${r.matriculas} matrícula${r.matriculas === 1 ? '' : 's'} preenchida${r.matriculas === 1 ? '' : 's'}`,
  ];
  if (r.totalIgnoradas > 0) partes.push(`${r.totalIgnoradas} por tratar`);
  return `${partes.join(' · ')} (${r.mensagens} emails lidos).`;
}

/** "Sincronizar": puxa do email (Outlook) as respostas ao pedido de matrícula. Só administrador, só VN. */
export default function SincronizarMatriculasButton({ className }: { className?: string }) {
  const { isAdmin } = usePermissions();
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return null;

  const sincronizar = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<Resposta & { error?: string }>('sync-matriculas', { body: { dias: 30 } });
      if (error) {
        // Respostas não-2xx trazem a mensagem no corpo.
        const ctx = (error as { context?: Response }).context;
        const msg = ctx ? (await ctx.json().catch(() => null))?.error : null;
        throw new Error(msg ?? error.message);
      }
      if (!data || data.error) throw new Error(data?.error ?? 'Resposta inválida.');
      toast.success('Sincronizado', {
        description: resumoSync(data) + (data.ignoradas.length ? `\n${data.ignoradas.slice(0, 3).map(i => `• ${i.assunto}: ${i.motivo}`).join('\n')}` : ''),
      });
      await refresh();
    } catch (err) {
      toast.error('Não foi possível sincronizar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className={`h-7 gap-1 text-[11px] ${className ?? ''}`} onClick={sincronizar} disabled={busy}
      title="Puxar do email as respostas ao pedido de matrícula (Aveiro)">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      Sincronizar
    </Button>
  );
}

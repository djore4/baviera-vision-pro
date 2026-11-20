import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  aplicaCartaoGo, equipaDe, lerAlertas, listarObjetivos, listarRegistosDoMes, objetivoDe, OBJETIVO_MENSAL, podeAlertar, registarAlerta,
} from '@/lib/cartao-go';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/* Lembrete do Cartão Caetano Go para o 'Vendedor VN' de Aveiro.
 *
 * Insistência INTENCIONAL mas limitada: não há "lembrar mais tarde" nem "já tenho". Fecha-se,
 * e volta a abrir na entrada na plataforma, ao mudar de página ou quando o separador volta a
 * ficar visível — no máximo MAX_ALERTAS_HORA vezes por hora (senão era exaustivo). Só deixa
 * de aparecer de vez quando o administrador regista os cartões do mês (objetivo da equipa).
 *
 * Se não for possível saber (erro de rede, migração por aplicar) não incomoda: fica calado. */
export function CartaoGoReminder() {
  const { me, effectiveEmail } = usePermissions();
  const { pathname } = useLocation();
  const aplica = aplicaCartaoGo(me) && !!effectiveEmail;
  const equipa = equipaDe(me);
  const [feitos, setFeitos] = useState(0);
  const [objetivo, setObjetivo] = useState(OBJETIVO_MENSAL);
  const [open, setOpen] = useState(false);
  const aberto = useRef(false);
  const pedido = useRef(0);   // só conta a resposta mais recente

  const verificar = useCallback(async () => {
    if (!aplica || !effectiveEmail) { aberto.current = false; setOpen(false); return; }
    const id = ++pedido.current;
    try {
      // O objetivo é da equipa; se não der para o ler, vale o objetivo por omissão.
      const [regs, obj] = await Promise.all([
        listarRegistosDoMes(effectiveEmail),
        listarObjetivos().then(o => objetivoDe(equipa, o)).catch(() => OBJETIVO_MENSAL),
      ]);
      if (id !== pedido.current) return;
      setFeitos(regs.length);
      setObjetivo(obj);
      if (regs.length >= obj) { aberto.current = false; setOpen(false); return; }
      // Já aberto: mantém-se. Fechado: só reabre se ainda houver alertas na hora.
      if (!aberto.current) {
        if (!podeAlertar(lerAlertas(effectiveEmail), Date.now())) return;
        registarAlerta(effectiveEmail);
        aberto.current = true;
      }
      setOpen(true);
    } catch (e) {
      if (id === pedido.current) { aberto.current = false; setOpen(false); }
      console.error(e);
    }
  }, [aplica, effectiveEmail, equipa]);

  // Entrada na plataforma e cada mudança de página.
  useEffect(() => { void verificar(); }, [verificar, pathname]);

  // Voltar ao separador (também conta como "usar a plataforma").
  useEffect(() => {
    if (!aplica) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void verificar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [aplica, verificar]);

  if (!aplica) return null;
  const faltam = Math.max(objetivo - feitos, 0);

  return (
    <Dialog open={open} onOpenChange={o => { aberto.current = o; setOpen(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-brand-primary" />
            Cartão Caetano Go
          </DialogTitle>
          <DialogDescription>
            O objetivo são <strong>{objetivo} cartões por mês</strong>. Este mês tens{' '}
            <strong>{feitos}</strong> registado{feitos === 1 ? '' : 's'}
            {faltam > 0 ? <> — {faltam === 1 ? 'falta' : 'faltam'} <strong>{faltam}</strong>.</> : '.'}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Não te esqueças de fazer o Cartão Caetano Go. Este aviso só desaparece quando a gestão
          confirmar os {objetivo} cartões do mês.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => { aberto.current = false; setOpen(false); }}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

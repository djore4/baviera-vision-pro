import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { AppUser } from '@/lib/permissions';
import {
  apagarRegisto, aplicaCartaoGo, isVendedorVN, LOCAL_CARTAO_GO, listarRegistosDoMes, OBJETIVO_MENSAL, registarCartao,
  type CartaoGoRegisto,
} from '@/lib/cartao-go';
import { locaisDoPerfil } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/* Cartão Caetano Go — acompanhamento do mês (só administradores, via tab Utilizadores).
 * Mostra cada 'Vendedor VN' com os cartões do mês e o objetivo; "+" regista um cartão
 * (hoje), "−" desfaz o último. É o registo daqui que faz o aviso deixar de aparecer. */
export function CartaoGoPanel({ users, loading }: { users: AppUser[]; loading: boolean }) {
  const [registos, setRegistos] = useState<CartaoGoRegisto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try { setRegistos(await listarRegistosDoMes()); setErro(null); }
    catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const vendedores = useMemo(
    () => users
      .filter(u => aplicaCartaoGo(u) && !!u.email)
      .sort((a, b) => (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt', { sensitivity: 'base' })),
    [users],
  );
  // 'Vendedor VN' sem local definido: não recebem o aviso até se lhes atribuir um local.
  const semLocal = useMemo(
    () => users.filter(u => isVendedorVN(u.perfil) && locaisDoPerfil(u.local).length === 0).length,
    [users],
  );
  const doVendedor = (email: string) =>
    registos.filter(r => r.vendedor_email === email.toLowerCase());

  const acao = async (email: string, fn: () => Promise<void>) => {
    setBusy(email);
    try { await fn(); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const completos = vendedores.filter(v => doVendedor(v.email!).length >= OBJETIVO_MENSAL).length;
  const mes = new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Cartão Caetano Go — {mes}</h2>
          <p className="text-xs text-muted-foreground">
            Objetivo: {OBJETIVO_MENSAL} por vendedor VN de {LOCAL_CARTAO_GO}. O aviso mantém-se até estarem registados aqui.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {completos}/{vendedores.length} com o objetivo cumprido
        </span>
      </div>

      {semLocal > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:bg-amber-500/15 dark:text-amber-100">
          {semLocal} “Vendedor VN” sem local definido ficam de fora. Se algum for de {LOCAL_CARTAO_GO}, atribui-lhe o local em Contas.
        </div>
      )}

      {erro && <div className="rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</div>}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : vendedores.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Não há utilizadores “Vendedor VN” com o local {LOCAL_CARTAO_GO}.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {vendedores.map(v => {
            const email = v.email!.toLowerCase();
            const regs = doVendedor(email);
            const ok = regs.length >= OBJETIVO_MENSAL;
            const ocupado = busy === email;
            return (
              <li key={email} className="flex items-center gap-3 px-3 py-2.5">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  ok ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200')}>
                  {ok ? <Check className="h-3.5 w-3.5" /> : regs.length}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{v.nome || email}</div>
                  <div className="truncate text-xs text-muted-foreground">{email}</div>
                </div>
                <span className="text-sm tabular-nums">{regs.length}/{OBJETIVO_MENSAL}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={ocupado || regs.length === 0}
                    aria-label={`Desfazer o último cartão de ${v.nome || email}`} title="Desfazer o último"
                    onClick={() => acao(email, () => apagarRegisto(regs[0].id))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button size="icon" className="h-8 w-8" disabled={ocupado}
                    aria-label={`Registar um cartão a ${v.nome || email}`} title="Registar um cartão (hoje)"
                    onClick={() => acao(email, () => registarCartao(email))}>
                    {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

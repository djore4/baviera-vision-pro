import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Minus, Plus, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import { type AppUser, listUsers } from '@/lib/permissions';
import {
  apagarRegisto, definirObjetivo, EQUIPAS, equipaDe, listarObjetivos, listarRegistosDoMes, objetivoDe, progresso,
  registarCartao, type CartaoGoRegisto, type Equipa, type Objetivos,
} from '@/lib/cartao-go';
import { locaisDoPerfil } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/* ── Tab Caetano Go (CCGo) ─────────────────────────────────────────────
 * Cartões feitos por responsável e por equipa (BMW VN, BMW VU, Motorrad, APV), mês a mês.
 * 'view': consulta; 'edit': regista/desfaz cartões (só no mês corrente) e define os objetivos
 * por equipa. A tipificação dos colaboradores (Equipa) e as contas gerem-se no tab Utilizadores (só administrador).
 * ──────────────────────────────────────────────────────────────────────────── */

const SEM_EQUIPA = 'Por tipificar';
type Filtro = Equipa | 'todas';

const mesRef = (off: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return d; };

export default function CcgoPage() {
  const { canEdit, isAdmin } = usePermissions();
  const gere = canEdit('ccgo');
  const [off, setOff] = useState(0);              // 0 = mês corrente, -1 = anterior…
  const ref = useMemo(() => mesRef(off), [off]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [registos, setRegistos] = useState<CartaoGoRegisto[]>([]);
  const [objetivos, setObjetivos] = useState<Objetivos>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [q, setQ] = useState('');
  const [aEditarObj, setAEditarObj] = useState(false);

  const carregarUsers = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (e) { console.error(e); toast.error('Não foi possível carregar os colaboradores.'); }
  }, []);

  const carregarCartoes = useCallback(async () => {
    try {
      const [rg, ob] = await Promise.all([listarRegistosDoMes(undefined, ref), listarObjetivos()]);
      setRegistos(rg); setObjetivos(ob); setErro(null);
    } catch (e) { setErro((e as Error).message); }
  }, [ref]);

  useEffect(() => { setLoading(true); void Promise.all([carregarUsers(), carregarCartoes()]).finally(() => setLoading(false)); }, [carregarUsers, carregarCartoes]);

  const linhas = useMemo(() => users.filter(u => !!u.email).map(u => {
    const equipa = equipaDe(u);
    const email = u.email!.toLowerCase();
    const regs = registos.filter(r => r.vendedor_email === email);
    return { u, email, equipa, regs, ...progresso(regs.length, objetivoDe(equipa, objetivos)) };
  }), [users, registos, objetivos]);

  // Só entra no controlo quem tem equipa; os por tipificar só os vê quem gere.
  const visiveis = useMemo(() => linhas
    .filter(l => (l.equipa ? true : gere))
    .filter(l => filtro === 'todas' || l.equipa === filtro)
    .filter(l => !q.trim() || `${l.u.nome ?? ''} ${l.email}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.u.nome || a.email).localeCompare(b.u.nome || b.email, 'pt', { sensitivity: 'base' })), [linhas, gere, filtro, q]);

  const resumo = (eq: Equipa) => {
    const ls = linhas.filter(l => l.equipa === eq);
    const obj = objetivoDe(eq, objetivos);
    return { eq, pessoas: ls.length, cumpridos: ls.filter(l => l.cumprido).length, feitos: ls.reduce((n, l) => n + l.feitos, 0), obj };
  };
  const nSem = linhas.filter(l => !l.equipa).length;
  const mesLabel = ref.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const podeRegistar = gere && off === 0;   // os cartões registam-se com a data de hoje

  const acao = async (email: string, fn: () => Promise<void>) => {
    setBusy(email);
    try { await fn(); await carregarCartoes(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const grupos: (Equipa | typeof SEM_EQUIPA)[] = [...EQUIPAS, SEM_EQUIPA];

  return (
    <div className="mx-auto max-w-5xl space-y-3 animate-fade-in">
      <Titulo />

    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Mês anterior" onClick={() => setOff(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[130px] text-center text-sm font-semibold capitalize">{mesLabel}</span>
          <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Mês seguinte" disabled={off >= 0} onClick={() => setOff(o => Math.min(0, o + 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {gere && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAEditarObj(o => !o)}>
            <Settings2 className="h-4 w-4" />Objetivos por equipa
          </Button>
        )}
      </div>

      {aEditarObj && gere && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 sm:grid-cols-4">
          {EQUIPAS.map(eq => (
            <label key={eq} className="space-y-1 text-xs text-muted-foreground">{eq}
              <Input type="number" min={0} max={99} className="h-8" defaultValue={objetivoDe(eq, objetivos)}
                aria-label={`Objetivo mensal ${eq}`}
                onBlur={async e => {
                  const n = Math.round(Number(e.target.value));
                  if (!Number.isFinite(n) || n < 0 || n > 99 || n === objetivoDe(eq, objetivos)) return;
                  try { await definirObjetivo(eq, n); await carregarCartoes(); toast.success(`${eq}: objetivo ${n}/mês`); }
                  catch (err) { toast.error((err as Error).message); }
                }} />
            </label>
          ))}
          <p className="col-span-full text-[11px] text-muted-foreground">Cartões por colaborador e por mês. Aplica-se a todos os meses (também aos já passados).</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {EQUIPAS.map(eq => {
          const r = resumo(eq);
          const alvo = r.pessoas * r.obj;
          const ativo = filtro === eq;
          return (
            <button key={eq} type="button" onClick={() => setFiltro(ativo ? 'todas' : eq)} aria-pressed={ativo}
              className={cn('rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/40', ativo && 'border-primary ring-1 ring-primary')}>
              <div className="text-xs font-semibold text-muted-foreground">{eq}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{r.feitos}<span className="text-sm font-normal text-muted-foreground">/{alvo}</span></div>
              <div className="text-[11px] text-muted-foreground">{r.cumpridos}/{r.pessoas} com objetivo ({r.obj}/mês)</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${alvo ? Math.min(100, (r.feitos / alvo) * 100) : 0}%` }} /></div>
            </button>
          );
        })}
      </div>

      {gere && nSem > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs text-amber-950 dark:bg-amber-500/15 dark:text-amber-100">
          {nSem} {nSem === 1 ? 'colaborador sem equipa' : 'colaboradores sem equipa'} (não entram nos totais). {isAdmin ? 'Define a equipa no tab Utilizadores.' : 'Pede ao administrador para os tipificar.'}
        </div>
      )}
      {erro && <div className="rounded border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</div>}

      <div className="relative max-w-xs">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Pesquisar responsável…" value={q} onChange={e => setQ(e.target.value)} className="h-8 pl-7 text-sm" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visiveis.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem colaboradores para mostrar.</p>
      ) : grupos.map(g => {
        const ls = visiveis.filter(l => (l.equipa ?? SEM_EQUIPA) === g);
        if (ls.length === 0) return null;
        return (
          <section key={g} className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g} <span className="font-normal">· {ls.length}</span></h3>
            <ul className="divide-y rounded-lg border bg-card">
              {ls.map(l => {
                const ocupado = busy === l.email;
                return (
                  <li key={l.email} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      l.cumprido ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200')}>
                      {l.cumprido ? <Check className="h-3.5 w-3.5" /> : l.feitos}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.u.nome || l.email}</div>
                      <div className="truncate text-xs text-muted-foreground">{[l.u.perfil, locaisDoPerfil(l.u.local).join(', ')].filter(Boolean).join(' · ') || l.email}</div>
                    </div>
                    <span className="text-sm tabular-nums">{l.feitos}/{l.objetivo}</span>
                    {podeRegistar && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={ocupado || l.feitos === 0}
                          aria-label={`Desfazer o último cartão de ${l.u.nome || l.email}`} title="Desfazer o último"
                          onClick={() => acao(l.email, () => apagarRegisto(l.regs[0].id))}><Minus className="h-4 w-4" /></Button>
                        <Button size="icon" className="h-8 w-8" disabled={ocupado}
                          aria-label={`Registar um cartão a ${l.u.nome || l.email}`} title="Registar um cartão (hoje)"
                          onClick={() => acao(l.email, () => registarCartao(l.email))}>
                          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
    </div>
  );
}

const Titulo = () => (
  <div>
    <h1 className="text-base font-semibold">Caetano Go</h1>
    <p className="text-xs text-muted-foreground">Cartões feitos por responsável e por equipa.</p>
  </div>
);

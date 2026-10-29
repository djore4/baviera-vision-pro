import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TABS } from '@/lib/permissions';
import {
  fmtDataHora, haQuanto, listarEventos, listarResumo,
  type EventoAtividade, type ResumoUtilizador,
} from '@/lib/atividade';

/* ── Tab Logs (Administração, só administradores) ─────────────────────────────
 * Uma linha por utilizador: último login, última atividade e uso na janela escolhida.
 * Clicar numa linha mostra as últimas páginas que abriu.
 * ──────────────────────────────────────────────────────────────────────────── */

const DIA = 24 * 60 * 60 * 1000;
const paginaLabel = (p: string | null) => (p ? TABS.find(t => t.path === p)?.label ?? p : '—');

export default function LogsPage() {
  const [dias, setDias] = useState(30);
  const [lista, setLista] = useState<ResumoUtilizador[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState<ResumoUtilizador | null>(null);
  const [eventos, setEventos] = useState<EventoAtividade[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setLista(await listarResumo(dias)); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar.'); }
    finally { setLoading(false); }
  }, [dias]);
  useEffect(() => { void load(); }, [load]);

  const abrir = async (u: ResumoUtilizador) => {
    setAberto(u); setEventos(null);
    try { setEventos(await listarEventos(u.email)); } catch { setEventos([]); }
  };

  const agora = Date.now();
  const resumo = useMemo(() => {
    const ativos = (d: number) => lista.filter(u => u.ultima_atividade && agora - new Date(u.ultima_atividade).getTime() < d * DIA).length;
    return { hoje: ativos(1), semana: ativos(7), nunca: lista.filter(u => !u.ultimo_login && !u.ultima_atividade).length };
  }, [lista, agora]);

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? lista.filter(u => [u.nome, u.email, u.perfil].some(v => (v ?? '').toLowerCase().includes(t))) : lista;
  }, [lista, q]);

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar utilizador ou função…" className="pl-8" />
        </div>
        <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Atualizar">
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {!erro && (
        <p className="text-xs text-muted-foreground">
          {resumo.hoje} ativos hoje · {resumo.semana} nos últimos 7 dias · {resumo.nunca} sem nunca entrar · {lista.length} utilizadores.
          O último login só muda quando alguém volta a iniciar sessão; a última atividade mostra quem continua a usar a sessão aberta.
        </p>
      )}

      {erro ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>
      ) : loading && !lista.length ? (
        <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Utilizador</th>
                <th className="px-3 py-2">Função</th>
                <th className="px-3 py-2">Último login</th>
                <th className="px-3 py-2">Última atividade</th>
                <th className="px-3 py-2 text-right">Sessões</th>
                <th className="px-3 py-2 text-right">Páginas</th>
                <th className="px-3 py-2">Mais usada</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(u => (
                <tr key={u.email} onClick={() => void abrir(u)} className="cursor-pointer border-t hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.nome ?? u.email}</div>
                    {u.nome && <div className="text-xs text-muted-foreground">{u.email}</div>}
                  </td>
                  <td className="px-3 py-2">{u.perfil ?? '—'}</td>
                  <td className="px-3 py-2" title={u.ultimo_login ? fmtDataHora(u.ultimo_login) : undefined}>
                    {u.ultimo_login ? haQuanto(u.ultimo_login, agora) : <span className="text-muted-foreground">Nunca</span>}
                  </td>
                  <td className="px-3 py-2" title={u.ultima_atividade ? fmtDataHora(u.ultima_atividade) : undefined}>
                    {u.ultima_atividade ? haQuanto(u.ultima_atividade, agora) : <span className="text-muted-foreground">Sem registo</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.sessoes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{u.paginas}</td>
                  <td className="px-3 py-2">{paginaLabel(u.pagina_top)}</td>
                </tr>
              ))}
              {!visiveis.length && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhum utilizador.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!aberto} onOpenChange={o => { if (!o) setAberto(null); }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{aberto?.nome ?? aberto?.email}</DialogTitle>
            <DialogDescription>Últimas páginas abertas (até 100).</DialogDescription>
          </DialogHeader>
          {eventos === null ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem registo de atividade.</p>
          ) : (
            <ul className="divide-y text-sm">
              {eventos.map(e => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span>{e.tipo === 'sessao' ? 'Início de sessão' : paginaLabel(e.pagina)}</span>
                  <span className="text-xs text-muted-foreground">{fmtDataHora(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

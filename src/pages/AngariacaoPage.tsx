import { useEffect, useMemo, useState } from 'react';
import { Database, Loader2, RotateCcw, Search } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { loadAngariacoesVu, type Angariacao } from '@/lib/angariacao-vu';
import { formatMatricula } from '@/lib/viaturaFormat';

/* ── Angariação · Viaturas Usadas ──────────────────────────────────────────────
 * Painel da sheet ANGARIAÇÃO do ficheiro VU (tabela angariacoes_vu, carregada em
 * Dados). Indicadores: nº de angariações, investimento (Σ V COMPRA), valor médio,
 * idade e kms médios; distribuição por responsável, por canal (ANGAR) e por mês
 * (DT ANG). Filtros por período, responsável e canal.
 * ──────────────────────────────────────────────────────────────────────────── */

const BAR_COLOR = '#1C69D4';
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (k: string) => { const [y, m] = k.split('-'); return `${MESES_PT[Number(m) - 1]} ${y.slice(2)}`; };
const eur0 = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' €';
const int = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 0 });
const fmtD = (d: Date | null) => d ? d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const canalLabel = (c: string) => c ? c.charAt(0) + c.slice(1).toLowerCase() : 'Sem canal';

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm min-w-0">
      <div className="text-xl font-bold tabular-nums leading-none truncate">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
        on ? 'bg-bmw-blue text-white border-bmw-blue' : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-bmw-blue/50'
      }`}
    >
      {children}
    </button>
  );
}

interface Bucket { name: string; n: number; valor: number }

/* Tooltip: contagem + investimento da barra. */
function BucketTooltip({ active, payload }: { active?: boolean; payload?: { payload: Bucket }[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-semibold text-foreground">{b.name}</div>
      <div className="text-muted-foreground">{b.n} angariaç{b.n === 1 ? 'ão' : 'ões'} · {eur0(b.valor)}</div>
    </div>
  );
}

function BucketChart({ title, data, height = 180 }: { title: string; data: Bucket[]; height?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      {data.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Sem dados</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 16, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip content={<BucketTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
            <Bar dataKey="n" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40}>
              <LabelList dataKey="n" position="top" style={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function buckets(list: Angariacao[], key: (a: Angariacao) => string, order?: (a: Bucket, b: Bucket) => number): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const a of list) {
    const k = key(a);
    const b = m.get(k) ?? { name: k, n: 0, valor: 0 };
    b.n += 1; b.valor += a.vCompra ?? 0;
    m.set(k, b);
  }
  return [...m.values()].sort(order ?? ((a, b) => b.n - a.n || a.name.localeCompare(b.name)));
}

const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

export default function AngariacaoPage() {
  const [rows, setRows] = useState<Angariacao[] | null>(null);
  const [fMes, setFMes] = useState('Todos');
  const [fResp, setFResp] = useState<Set<string>>(new Set());
  const [fCanal, setFCanal] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    loadAngariacoesVu()
      .then(r => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, []);

  const all = useMemo(() => rows ?? [], [rows]);
  const meses = useMemo(
    () => [...new Set(all.filter(a => a.dtAng).map(a => monthKey(a.dtAng!)))].sort().reverse(),
    [all],
  );
  const resps = useMemo(() => [...new Set(all.map(a => a.resp || '—'))].sort(), [all]);
  const canais = useMemo(() => [...new Set(all.map(a => a.angar))].sort(), [all]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setter(n);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter(a => fMes === 'Todos' || (a.dtAng && monthKey(a.dtAng) === fMes))
      .filter(a => !fResp.size || fResp.has(a.resp || '—'))
      .filter(a => !fCanal.size || fCanal.has(a.angar))
      .filter(a => !q || [a.resp, a.cliente, a.angar, a.mat, formatMatricula(a.mat), a.model, a.version]
        .some(v => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (b.dtAng?.getTime() ?? 0) - (a.dtAng?.getTime() ?? 0));
  }, [all, fMes, fResp, fCanal, search]);

  const kpis = useMemo(() => {
    const valores = filtered.map(a => a.vCompra).filter((v): v is number => v != null && v > 0);
    const anoAtual = new Date().getFullYear();
    const idades = filtered.map(a => a.ano).filter((v): v is number => v != null && v > 1900).map(a => anoAtual - a);
    const kms = filtered.map(a => a.kms).filter((v): v is number => v != null && v >= 0);
    return {
      n: filtered.length,
      investimento: valores.reduce((s, v) => s + v, 0),
      semValor: filtered.length - valores.length,
      valorMedio: avg(valores),
      idadeMedia: avg(idades),
      kmsMedios: avg(kms),
    };
  }, [filtered]);

  const porResp = useMemo(() => buckets(filtered, a => a.resp || '—'), [filtered]);
  const porCanal = useMemo(() => buckets(filtered, a => canalLabel(a.angar)), [filtered]);
  const porMes = useMemo(
    () => buckets(filtered.filter(a => a.dtAng), a => monthKey(a.dtAng!), (a, b) => a.name.localeCompare(b.name))
      .map(b => ({ ...b, name: monthLabel(b.name) })),
    [filtered],
  );

  const filtersActive = fMes !== 'Todos' || fResp.size > 0 || fCanal.size > 0 || !!search;
  const reset = () => { setFMes('Todos'); setFResp(new Set()); setFCanal(new Set()); setSearch(''); };

  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <Database className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-bold">Angariação · Viaturas Usadas</h1>
        <p className="text-sm text-muted-foreground">
          Ainda não há angariações. Carrega o ficheiro de Viaturas Usadas (com a sheet <strong>ANGARIAÇÃO</strong>) na
          secção <strong>Dados</strong>, painel “Gestão de Dados VU”.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* Filtros */}
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:flex-1 sm:w-auto sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Cliente, matrícula, modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            value={fMes}
            onChange={e => setFMes(e.target.value)}
            aria-label="Período"
            className="px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="Todos">Todos os meses</option>
            {meses.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {filtersActive && (
            <button
              onClick={reset}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Limpar
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-0.5">Resp</span>
            {resps.map(r => <Chip key={r} on={fResp.has(r)} onClick={() => toggle(fResp, setFResp, r)}>{r}</Chip>)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-0.5">Canal</span>
            {canais.map(c => <Chip key={c} on={fCanal.has(c)} onClick={() => toggle(fCanal, setFCanal, c)}>{canalLabel(c)}</Chip>)}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Angariações" value={int(kpis.n)} />
        <Kpi label="Investimento" value={eur0(kpis.investimento)} hint={kpis.semValor ? `${kpis.semValor} sem V COMPRA` : 'Σ V COMPRA'} />
        <Kpi label="Valor médio" value={kpis.valorMedio ? eur0(kpis.valorMedio) : '—'} hint="por viatura" />
        <Kpi label="Idade média" value={kpis.idadeMedia ? `${kpis.idadeMedia.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} anos` : '—'} hint="pelo ANO" />
        <Kpi label="Kms médios" value={kpis.kmsMedios ? int(kpis.kmsMedios) : '—'} />
      </div>

      {/* Distribuições */}
      <div className="grid gap-3 md:grid-cols-3">
        <BucketChart title="Por responsável" data={porResp} />
        <BucketChart title="Por canal" data={porCanal} />
        <BucketChart title="Por mês" data={porMes} />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-center font-semibold px-2.5 py-2">Data</th>
              <th className="text-left font-semibold px-2.5 py-2">Resp</th>
              <th className="text-left font-semibold px-2.5 py-2">Cliente</th>
              <th className="text-left font-semibold px-2.5 py-2">Canal</th>
              <th className="text-left font-semibold px-2.5 py-2">Matrícula</th>
              <th className="text-left font-semibold px-2.5 py-2">Modelo</th>
              <th className="text-left font-semibold px-2.5 py-2">Versão</th>
              <th className="text-center font-semibold px-2.5 py-2">Ano</th>
              <th className="text-right font-semibold px-2.5 py-2">Kms</th>
              <th className="text-right font-semibold px-2.5 py-2">V Compra</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">Nenhuma angariação com estes filtros.</td></tr>
            )}
            {filtered.map((a, i) => (
              <tr key={a.id ?? `${a.mat}-${i}`} className="border-t border-border/70 hover:bg-primary/[0.03]">
                <td className="px-2.5 py-1.5 text-center tabular-nums whitespace-nowrap">{fmtD(a.dtAng)}</td>
                <td className="px-2.5 py-1.5 font-semibold">{a.resp || '—'}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[14rem]">{a.cliente || '—'}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{a.angar ? canalLabel(a.angar) : '—'}</td>
                <td className="px-2.5 py-1.5 font-mono uppercase whitespace-nowrap">{a.mat ? formatMatricula(a.mat) : '—'}</td>
                <td className="px-2.5 py-1.5 font-medium whitespace-nowrap">{a.model || '—'}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{a.version || '—'}</td>
                <td className="px-2.5 py-1.5 text-center tabular-nums">{a.ano ?? '—'}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{a.kms != null ? int(a.kms) : '—'}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap">{a.vCompra != null ? eur0(a.vCompra) : '—'}</td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td colSpan={9} className="px-2.5 py-2 text-muted-foreground">Total ({filtered.length})</td>
                <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">{eur0(kpis.investimento)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

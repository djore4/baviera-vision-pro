import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Database, Loader2, Search, X } from 'lucide-react';
import { loadControlVuFromDb, isVuAngariacaoStatus, type VuRecord } from '@/lib/control-records-vu';
import { chassisCurto, formatMatricula } from '@/lib/viaturaFormat';

/* ── Angariação · Viaturas Usadas ──────────────────────────────────────────────
 * Alimentada pela tabela control_records_vu (ficheiro VU carregado em Dados):
 * todas as linhas com STATUS = ANGARIAÇÃO. Quando a angariação avança, a linha
 * muda de status no ficheiro e sai daqui no próximo carregamento.
 * As colunas sem nenhum valor nas angariações ficam escondidas.
 * ──────────────────────────────────────────────────────────────────────────── */

const PROV_COLORS: Record<string, string> = {
  REMARK: '#1C69D4', RETOMA: '#16A34A', CONSIGN: '#8B5CF6', LEILÃO: '#F97316', LEILAO: '#F97316',
};
const provColor = (p: string) => PROV_COLORS[p.trim().toUpperCase()] ?? '#94A3B8';
const fmtD = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

interface Col {
  key: string;
  label: string;
  has: (r: VuRecord) => boolean;
  cell: (r: VuRecord) => ReactNode;
  cls?: string;
}

const COLS: Col[] = [
  { key: 'resp', label: 'Resp', has: r => !!r.resp, cell: r => r.resp || '—', cls: 'font-semibold' },
  { key: 'cliente', label: 'Cliente', has: r => !!r.cliente, cell: r => r.cliente || '—', cls: 'text-muted-foreground truncate max-w-[14rem]' },
  { key: 'type', label: 'Tipo', has: r => !!r.type, cell: r => r.type || '—', cls: 'text-muted-foreground' },
  { key: 'model', label: 'Modelo', has: r => !!r.model, cell: r => r.model || '—', cls: 'font-medium' },
  { key: 'version', label: 'Versão', has: r => !!r.version, cell: r => r.version || '—', cls: 'text-muted-foreground' },
  { key: 'mat', label: 'Matrícula', has: r => !!r.mat, cell: r => r.mat ? formatMatricula(r.mat) : '—', cls: 'font-mono uppercase' },
  { key: 'chassis', label: 'Chassis', has: r => !!r.chassis, cell: r => r.chassis ? chassisCurto(r.chassis) : '—', cls: 'font-mono uppercase text-muted-foreground' },
  {
    key: 'prov', label: 'Proveniência', has: r => !!r.prov,
    cell: r => {
      const prov = (r.prov || '').trim().toUpperCase();
      return prov ? (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: `${provColor(prov)}1f`, color: provColor(prov) }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: provColor(prov) }} />
          {prov}
        </span>
      ) : '—';
    },
  },
  { key: 'dtFecho', label: 'Data', has: r => !!r.dtFecho, cell: r => fmtD(r.dtFecho), cls: 'text-center tabular-nums' },
  { key: 'obs', label: 'Obs', has: r => !!r.obs, cell: r => r.obs || '—', cls: 'text-muted-foreground whitespace-normal min-w-[12rem]' },
];

function Kpi({ label, value, active, onClick }: { label: string; value: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border bg-card p-3 text-left shadow-sm transition-colors ${
        active ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-primary/50'
      } ${onClick ? '' : 'cursor-default'}`}
    >
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1 truncate">{label}</div>
    </button>
  );
}

export default function AngariacaoPage() {
  const [records, setRecords] = useState<VuRecord[] | null>(null);
  const [search, setSearch] = useState('');
  const [fResp, setFResp] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadControlVuFromDb()
      .then(recs => { if (alive) setRecords(recs); })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, []);

  const angariacoes = useMemo(
    () => (records ?? []).filter(r => isVuAngariacaoStatus(r.status)),
    [records],
  );

  // Contagem por responsável (também serve de filtro rápido).
  const porResp = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of angariacoes) { const k = r.resp || '—'; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [angariacoes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return angariacoes
      .filter(r => !fResp || (r.resp || '—') === fResp)
      .filter(r => !q || [r.resp, r.cliente, r.model, r.version, r.mat, formatMatricula(r.mat), r.chassis, r.prov, r.obs]
        .some(v => (v ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (a.resp || '').localeCompare(b.resp || '') || (b.dtFecho?.getTime() ?? 0) - (a.dtFecho?.getTime() ?? 0));
  }, [angariacoes, search, fResp]);

  const cols = useMemo(() => COLS.filter(c => angariacoes.some(c.has)), [angariacoes]);

  if (records === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (angariacoes.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <Database className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-bold">Angariação · Viaturas Usadas</h1>
        <p className="text-sm text-muted-foreground">
          Sem angariações. As linhas do ficheiro VU com o status <strong>ANGARIAÇÃO</strong> aparecem aqui depois de
          carregares o ficheiro na secção <strong>Dados</strong> (painel “Gestão de Dados VU”).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* KPIs: total + por responsável (clicáveis para filtrar) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Angariações" value={angariacoes.length} active={!fResp} onClick={() => setFResp(null)} />
        {porResp.map(([resp, n]) => (
          <Kpi key={resp} label={resp} value={n} active={fResp === resp} onClick={() => setFResp(fResp === resp ? null : resp)} />
        ))}
      </div>

      {/* Pesquisa */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:w-auto sm:min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Cliente, modelo, matrícula, observações..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} de {angariacoes.length}</span>
        {(search || fResp) && (
          <button
            onClick={() => { setSearch(''); setFResp(null); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3" /> Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {cols.map(c => (
                <th key={c.key} className={`font-semibold px-2.5 py-2 whitespace-nowrap ${c.key === 'dtFecho' ? 'text-center' : 'text-left'}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={cols.length} className="py-8 text-center text-muted-foreground">Nenhuma angariação encontrada.</td></tr>
            )}
            {filtered.map((r, i) => (
              <tr key={r.id ?? `${r.chassis}-${i}`} className="border-t border-border/70 hover:bg-primary/[0.03]">
                {cols.map(c => (
                  <td key={c.key} className={`px-2.5 py-1.5 ${c.cls?.includes('whitespace-normal') ? '' : 'whitespace-nowrap'} ${c.cls ?? ''}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

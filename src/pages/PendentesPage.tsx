import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { formatDate } from '@/lib/excel-parser';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

type BizagiSortKey = 'resp' | 'model' | 'cliente' | 'enc' | 'neg';
type SortDir = 'asc' | 'desc';

export default function PendentesPage() {
  const { data } = useData();
  const control = useMemo(() => (data?.control || []).filter(r => r.resp !== 'JD'), [data]);
  const cutoff2026 = new Date(2026, 0, 1);

  const [bizagiResp, setBizagiResp] = useState<string | null>(null);

  const [bizagiSort, setBizagiSort] = useState<{ key: BizagiSortKey; dir: SortDir }>({ key: 'neg', dir: 'desc' });

  const bizagiDeals = useMemo(() =>
    control.filter(r => r.neg instanceof Date && r.neg >= cutoff2026 && !r.biz), [control]);

  const bizagiByResp = useMemo(() => {
    const map: Record<string, number> = {};
    bizagiDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [bizagiDeals]);

  // Filtered + sorted table data
  const bizagiTable = useMemo(() => {
    let rows = bizagiResp ? bizagiDeals.filter(r => r.resp === bizagiResp) : [...bizagiDeals];
    rows.sort((a, b) => {
      let cmp = 0;
      if (bizagiSort.key === 'neg') cmp = (a.neg?.getTime() || 0) - (b.neg?.getTime() || 0);
      else cmp = ((a as any)[bizagiSort.key] || '').localeCompare((b as any)[bizagiSort.key] || '');
      return bizagiSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [bizagiDeals, bizagiResp, bizagiSort]);

  const toggleSort = <K extends string>(
    key: K,
    current: { key: K; dir: SortDir },
    setter: (v: { key: K; dir: SortDir }) => void
  ) => {
    if (current.key === key) setter({ key, dir: current.dir === 'asc' ? 'desc' : 'asc' });
    else setter({ key, dir: 'asc' });
  };

  const SortIcon = ({ col, current }: { col: string; current: { key: string; dir: SortDir } }) => {
    if (current.key !== col) return <ArrowUpDown className="h-3 w-3 ml-0.5 opacity-40" />;
    return current.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-0.5 text-primary" /> : <ArrowDown className="h-3 w-3 ml-0.5 text-primary" />;
  };

  if (!data) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground"><p>Sem dados carregados</p></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-1 gap-4 animate-fade-in">

      {/* BIZAGI */}
      <div className="space-y-2">
        <div className="rounded-lg border p-3" style={{ borderColor: '#1C69D440' }}>
          <h2 className="text-sm font-bold" style={{ color: '#1C69D4' }}>BIZAGI</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Negócios fechados s/ número Bizagi</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#1C69D4' }}>
            {bizagiResp ? bizagiTable.length : bizagiDeals.length} <span className="text-xs font-normal text-muted-foreground">s/ Bizagi</span>
          </p>
          
        </div>
        <div className="bg-card border border-border rounded-lg p-2">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={bizagiByResp} barSize={64} barCategoryGap="25%"
              onClick={(d: any) => { const resp = d?.activePayload?.[0]?.payload?.resp; if (resp) setBizagiResp(prev => prev === resp ? null : resp); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={24} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Bar dataKey="count" name="Total" label={{ position: 'top', fontSize: 9 }} cursor="pointer"
                fill="#1C69D4"
                opacity={1}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border rounded-lg overflow-hidden" style={{ borderColor: '#1C69D430' }}>
          <div className="px-3 py-1.5" style={{ backgroundColor: '#1C69D4' }}>
            <span className="text-[10px] font-semibold uppercase text-white">BIZAGI — {bizagiTable.length} registos</span>
          </div>
          <div className="overflow-auto max-h-[40vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr className="text-[10px]">
                  {(['resp', 'model', 'cliente', 'enc', 'neg'] as BizagiSortKey[]).map((key, i) => (
                    <th key={key} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort(key, bizagiSort, setBizagiSort)}>
                      <span className="inline-flex items-center">
                        {['RESP', 'MODELO', 'CLIENTE', 'ENC', 'DATA FECHO'][i]}
                        <SortIcon col={key} current={bizagiSort} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bizagiTable.map((r, i) => (
                  <tr key={i} className="text-[11px] border-b border-border hover:bg-muted/50">
                    <td className="px-3 py-1 font-medium">{r.resp}</td>
                    <td className="px-3 py-1">{r.model}</td>
                    <td className="px-3 py-1 max-w-[100px] truncate">{r.cliente}</td>
                    <td className="px-3 py-1">{r.enc}</td>
                    <td className="px-3 py-1">{formatDate(r.neg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

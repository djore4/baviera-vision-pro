import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { useRecordEditor } from '@/components/RecordEditor';
import { formatDate } from '@/lib/excel-parser';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { ControlRecord } from '@/types/data';

type AppingSortKey = 'resp' | 'model' | 'cliente' | 'enc' | 'chas' | 'date298';
type BizagiSortKey = 'resp' | 'model' | 'cliente' | 'enc' | 'neg';
type CmeSortKey = 'resp' | 'model' | 'cliente' | 'enc' | 'neg';
type SortDir = 'asc' | 'desc';

export default function PendentesPage() {
  const { data } = useData();
  const { openEditor } = useRecordEditor();
  const control = useMemo(() => (data?.control || []).filter(r => r.resp !== 'JD'), [data]);
  const cutoff2026 = new Date(2026, 0, 1);

  const [appingResp, setAppingResp] = useState<string | null>(null);
  const [bizagiResp, setBizagiResp] = useState<string | null>(null);
  const [cmeResp, setCmeResp] = useState<string | null>(null);

  const [appingSort, setAppingSort] = useState<{ key: AppingSortKey; dir: SortDir }>({ key: 'date298', dir: 'asc' });
  const [bizagiSort, setBizagiSort] = useState<{ key: BizagiSortKey; dir: SortDir }>({ key: 'neg', dir: 'desc' });
  const [cmeSort, setCmeSort] = useState<{ key: CmeSortKey; dir: SortDir }>({ key: 'neg', dir: 'desc' });

  const appingBase = useMemo(() =>
    control.filter(r => r.date298 instanceof Date && r.date298 >= cutoff2026), [control]);

  const appingDeals = useMemo(() =>
    appingBase.filter(r => !r.app), [appingBase]);

  const appRate = appingBase.length
    ? Math.round(((appingBase.length - appingDeals.length) / appingBase.length) * 100) : 0;

  const appingByResp = useMemo(() => {
    const map: Record<string, number> = {};
    appingDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [appingDeals]);

  const bizagiDeals = useMemo(() =>
    control.filter(r => r.neg instanceof Date && r.neg >= cutoff2026 && !r.biz), [control]);

  const bizagiByResp = useMemo(() => {
    const map: Record<string, number> = {};
    bizagiDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [bizagiDeals]);

  const cmeDeals = useMemo(() =>
    control.filter(r => r.neg instanceof Date && r.neg >= cutoff2026 && r.bev === 1 && !r.cme), [control]);

  const cmeByResp = useMemo(() => {
    const map: Record<string, number> = {};
    cmeDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [cmeDeals]);

  // Filtered + sorted table data
  const appingTable = useMemo(() => {
    let rows = appingResp ? appingDeals.filter(r => r.resp === appingResp) : [...appingDeals];
    rows.sort((a, b) => {
      let cmp = 0;
      if (appingSort.key === 'date298') cmp = (a.date298?.getTime() || 0) - (b.date298?.getTime() || 0);
      else cmp = ((a as any)[appingSort.key] || '').localeCompare((b as any)[appingSort.key] || '');
      return appingSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [appingDeals, appingResp, appingSort]);

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

  const cmeTable = useMemo(() => {
    let rows = cmeResp ? cmeDeals.filter(r => r.resp === cmeResp) : [...cmeDeals];
    rows.sort((a, b) => {
      let cmp = 0;
      if (cmeSort.key === 'neg') cmp = (a.neg?.getTime() || 0) - (b.neg?.getTime() || 0);
      else cmp = ((a as any)[cmeSort.key] || '').localeCompare((b as any)[cmeSort.key] || '');
      return cmeSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [cmeDeals, cmeResp, cmeSort]);

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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">

      {/* APPING */}
      <div className="space-y-2">
        <div className="rounded-lg border p-3" style={{ borderColor: '#DC262640' }}>
          <h2 className="text-sm font-bold" style={{ color: '#DC2626' }}>APPING</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">App Rate: {appRate}% ({appingBase.length - appingDeals.length}/{appingBase.length})</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#DC2626' }}>
            {appingResp ? appingTable.length : appingDeals.length} <span className="text-xs font-normal text-muted-foreground">s/ Apping</span>
          </p>
          
        </div>
        <div className="bg-card border border-border rounded-lg p-2">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={appingByResp} barSize={32} barCategoryGap="25%"
              onClick={(d: any) => { const resp = d?.activePayload?.[0]?.payload?.resp; if (resp) setAppingResp(prev => prev === resp ? null : resp); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={24} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
<Bar dataKey="count" fill="#DC2626" name="Total" label={{ position: 'top', fontSize: 9 }} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border rounded-lg overflow-hidden" style={{ borderColor: '#DC262630' }}>
          <div className="px-3 py-1.5" style={{ backgroundColor: '#DC2626' }}>
            <span className="text-[10px] font-semibold uppercase text-white">APPING — {appingTable.length} registos</span>
          </div>
          <div className="overflow-auto max-h-[40vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr className="text-[10px]">
                  {(['resp', 'model', 'cliente', 'enc', 'chas', 'date298'] as AppingSortKey[]).map((key, i) => (
                    <th key={key} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort(key, appingSort, setAppingSort)}>
                      <span className="inline-flex items-center">
                        {['RESP', 'MODELO', 'CLIENTE', 'ENC', 'CHAS', 'DATA 298'][i]}
                        <SortIcon col={key} current={appingSort} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appingTable.map((r, i) => (
                  <tr key={i} onClick={() => r.id && openEditor(r.id)} title="Clicar para editar" className="text-[11px] border-b border-border hover:bg-muted/50 cursor-pointer">
                    <td className="px-3 py-1 font-medium">{r.resp}</td>
                    <td className="px-3 py-1">{r.model}</td>
                    <td className="px-3 py-1 max-w-[100px] truncate">{r.cliente}</td>
                    <td className="px-3 py-1">{r.enc}</td>
                    <td className="px-3 py-1 text-[10px]">{r.chas}</td>
                    <td className="px-3 py-1">{formatDate(r.date298)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
            <BarChart data={bizagiByResp} barSize={32} barCategoryGap="25%"
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
                  <tr key={i} onClick={() => r.id && openEditor(r.id)} title="Clicar para editar" className="text-[11px] border-b border-border hover:bg-muted/50 cursor-pointer">
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

      {/* CME */}
      <div className="space-y-2">
        <div className="rounded-lg border p-3" style={{ borderColor: '#1E40AF40' }}>
          <h2 className="text-sm font-bold" style={{ color: '#1E40AF' }}>CME</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">BEV s/ Lead CME</p>
          <p className="text-2xl font-bold mt-1" style={{ color: '#1E40AF' }}>
            {cmeResp ? cmeTable.length : cmeDeals.length} <span className="text-xs font-normal text-muted-foreground">pendentes</span>
          </p>
          
        </div>
        <div className="bg-card border border-border rounded-lg p-2">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={cmeByResp} barSize={32} barCategoryGap="25%"
              onClick={(d: any) => { const resp = d?.activePayload?.[0]?.payload?.resp; if (resp) setCmeResp(prev => prev === resp ? null : resp); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={24} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Bar dataKey="count" fill="#1E40AF" name="Total" label={{ position: 'top', fontSize: 9 }} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border rounded-lg overflow-hidden" style={{ borderColor: '#1E40AF30' }}>
          <div className="px-3 py-1.5" style={{ backgroundColor: '#1E40AF' }}>
            <span className="text-[10px] font-semibold uppercase text-white">CME — {cmeTable.length} registos</span>
          </div>
          <div className="overflow-auto max-h-[40vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <tr className="text-[10px]">
                  {(['resp', 'model', 'cliente', 'enc', 'neg'] as CmeSortKey[]).map((key, i) => (
                    <th key={key} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort(key, cmeSort, setCmeSort)}>
                      <span className="inline-flex items-center">
                        {['RESP', 'MODELO', 'CLIENTE', 'ENC', 'DATA FECHO'][i]}
                        <SortIcon col={key} current={cmeSort} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cmeTable.map((r, i) => (
                  <tr key={i} onClick={() => r.id && openEditor(r.id)} title="Clicar para editar" className="text-[11px] border-b border-border hover:bg-muted/50 cursor-pointer">
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

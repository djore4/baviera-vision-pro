import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { formatDate } from '@/lib/excel-parser';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function PendentesPage() {
  const { data } = useData();
  const control = (data?.control || []).filter(r => r.resp !== 'JD');
  const cutoff2026 = new Date(2026, 0, 1);

  const appingBase = useMemo(() =>
    control.filter(r => r.date298 instanceof Date && r.date298 >= cutoff2026),
    [control]);

  const appingDeals = useMemo(() =>
    appingBase.filter(r => !r.app),
    [appingBase]);

  const appRate = appingBase.length
    ? Math.round(((appingBase.length - appingDeals.length) / appingBase.length) * 100)
    : 0;

  const appingByResp = useMemo(() => {
    const map: Record<string, number> = {};
    appingDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [appingDeals]);

  const bizagiDeals = useMemo(() =>
    control.filter(r => r.neg instanceof Date && r.neg >= cutoff2026 && !r.biz),
    [control]);

  const bizagiByResp = useMemo(() => {
    const map: Record<string, number> = {};
    bizagiDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [bizagiDeals]);

  const cmeDeals = useMemo(() =>
    control.filter(r => r.neg instanceof Date && r.neg >= cutoff2026 && r.bev === 1 && !r.cme),
    [control]);

  const cmeByResp = useMemo(() => {
    const map: Record<string, number> = {};
    cmeDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [cmeDeals]);

  if (!data) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground"><p>Sem dados carregados</p></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in">
      <PendingSection
        title="APPING"
        subtitle={`App Rate: ${appRate}% (${appingBase.length - appingDeals.length}/${appingBase.length})`}
        color="#DC2626"
        total={appingDeals.length}
        totalLabel="s/ Apping"
        chartData={appingByResp}
        tableHeaders={['RESP', 'MODELO', 'CLIENTE', 'ENC', 'CHAS', 'DATA 298']}
        tableData={appingDeals}
        renderRow={(r, i) => (
          <tr key={i} className="text-[11px] border-b border-border hover:bg-muted/50">
            <td className="px-3 py-1 font-medium">{r.resp}</td>
            <td className="px-3 py-1">{r.model}</td>
            <td className="px-3 py-1 max-w-[100px] truncate">{r.cliente}</td>
            <td className="px-3 py-1">{r.enc}</td>
            <td className="px-3 py-1 text-[10px]">{r.chas}</td>
            <td className="px-3 py-1">{formatDate(r.date298)}</td>
          </tr>
        )}
      />
      <PendingSection
        title="BIZAGI"
        subtitle="Negócios fechados s/ número Bizagi"
        color="#1C69D4"
        total={bizagiDeals.length}
        totalLabel="s/ Bizagi"
        chartData={bizagiByResp}
        tableHeaders={['RESP', 'MODELO', 'CLIENTE', 'ENC', 'DATA FECHO']}
        tableData={bizagiDeals}
        renderRow={(r, i) => (
          <tr key={i} className="text-[11px] border-b border-border hover:bg-muted/50">
            <td className="px-3 py-1 font-medium">{r.resp}</td>
            <td className="px-3 py-1">{r.model}</td>
            <td className="px-3 py-1 max-w-[100px] truncate">{r.cliente}</td>
            <td className="px-3 py-1">{r.enc}</td>
            <td className="px-3 py-1">{formatDate(r.neg)}</td>
          </tr>
        )}
      />
      <PendingSection
        title="CME"
        subtitle="BEV s/ Lead CME"
        color="#1E40AF"
        total={cmeDeals.length}
        totalLabel="pendentes"
        chartData={cmeByResp}
        tableHeaders={['RESP', 'MODELO', 'CLIENTE', 'ENC', 'DATA FECHO']}
        tableData={cmeDeals}
        renderRow={(r, i) => (
          <tr key={i} className="text-[11px] border-b border-border hover:bg-muted/50">
            <td className="px-3 py-1 font-medium">{r.resp}</td>
            <td className="px-3 py-1">{r.model}</td>
            <td className="px-3 py-1 max-w-[100px] truncate">{r.cliente}</td>
            <td className="px-3 py-1">{r.enc}</td>
            <td className="px-3 py-1">{formatDate(r.neg)}</td>
          </tr>
        )}
      />
    </div>
  );
}

interface PendingSectionProps {
  title: string;
  subtitle: string;
  color: string;
  total: number;
  totalLabel: string;
  chartData: { resp: string; count: number }[];
  tableHeaders: string[];
  tableData: import('@/types/data').ControlRecord[];
  renderRow: (r: import('@/types/data').ControlRecord, i: number) => React.ReactNode;
}

function PendingSection({ title, subtitle, color, total, totalLabel, chartData, tableHeaders, tableData, renderRow }: PendingSectionProps) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="rounded-lg border p-3" style={{ borderColor: color + '40' }}>
        <h2 className="text-sm font-bold" style={{ color }}>{title}</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>
          {total} <span className="text-xs font-normal text-muted-foreground">{totalLabel}</span>
        </p>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-lg p-2">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} barSize={32} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={24} />
            <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey="count" fill={color} name="Total" label={{ position: 'top', fontSize: 9 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden" style={{ borderColor: color + '30' }}>
        <div className="px-3 py-1.5" style={{ backgroundColor: color }}>
          <span className="text-[10px] font-semibold uppercase text-white">{title} — {tableData.length} registos</span>
        </div>
        <div className="overflow-auto max-h-[40vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-[10px]">
                {tableHeaders.map(h => (
                  <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

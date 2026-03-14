import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { isMissingApping, isMissingBizagi, isMissingCME, formatDate, isRetailDelivery } from '@/lib/excel-parser';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function PendentesPage() {
  const { data } = useData();
  const control = data?.control || [];

  // Apping: Retail deals missing APP
  const appingDeals = useMemo(() => control.filter(isMissingApping), [control]);
  const appingByResp = useMemo(() => {
    const map: Record<string, number> = {};
    appingDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [appingDeals]);

  // Bizagi: active deals missing BIZ
  const bizagiDeals = useMemo(() => control.filter(isMissingBizagi), [control]);
  const bizagiByResp = useMemo(() => {
    const map: Record<string, number> = {};
    bizagiDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [bizagiDeals]);

  // CME: BEV deals missing CME
  const cmeDeals = useMemo(() => control.filter(isMissingCME), [control]);
  const cmeByResp = useMemo(() => {
    const map: Record<string, number> = {};
    cmeDeals.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    return Object.entries(map).map(([resp, count]) => ({ resp, count })).sort((a, b) => b.count - a.count);
  }, [cmeDeals]);

  if (!data) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground"><p>Sem dados carregados</p></div>;
  }

  return (
    <div className="grid grid-cols-3 gap-4 animate-fade-in">
      {/* APPING */}
      <PendingSection
        title="APPING"
        subtitle="Responsáveis pelos Retails s/ Apping"
        color="#DC2626"
        total={appingDeals.length}
        totalLabel="s/ Apping"
        chartData={appingByResp}
        tableHeaders={['RESP', 'MODELO', 'CLIENTE', 'ENC', 'CHAS', 'DATA 298']}
        tableData={appingDeals}
        renderRow={(r, i) => (
          <TableRow key={i} className="text-[11px]">
            <TableCell className="py-1 font-medium">{r.resp}</TableCell>
            <TableCell className="py-1">{r.model}</TableCell>
            <TableCell className="py-1 max-w-[100px] truncate">{r.cliente}</TableCell>
            <TableCell className="py-1">{r.enc}</TableCell>
            <TableCell className="py-1 text-[10px]">{r.chas}</TableCell>
            <TableCell className="py-1">{formatDate(r.date298)}</TableCell>
          </TableRow>
        )}
      />

      {/* BIZAGI */}
      <PendingSection
        title="BIZAGI"
        subtitle="Responsáveis pelos Negócios s/ Bizagi"
        color="#1C69D4"
        total={bizagiDeals.length}
        totalLabel="s/ Bizagi"
        chartData={bizagiByResp}
        tableHeaders={['RESP', 'MODELO', 'CLIENTE', 'ENC', 'DATA FECHO']}
        tableData={bizagiDeals}
        renderRow={(r, i) => (
          <TableRow key={i} className="text-[11px]">
            <TableCell className="py-1 font-medium">{r.resp}</TableCell>
            <TableCell className="py-1">{r.model}</TableCell>
            <TableCell className="py-1 max-w-[100px] truncate">{r.cliente}</TableCell>
            <TableCell className="py-1">{r.enc}</TableCell>
            <TableCell className="py-1">{formatDate(r.neg)}</TableCell>
          </TableRow>
        )}
      />

      {/* CME */}
      <PendingSection
        title="CME"
        subtitle="Responsáveis pelos Negócios BEV s/ Lead CME"
        color="#1E40AF"
        total={cmeDeals.length}
        totalLabel="LEADs"
        chartData={cmeByResp}
        tableHeaders={['RESP', 'MODELO', 'CLIENTE', 'ENC', 'DATA FECHO']}
        tableData={cmeDeals}
        renderRow={(r, i) => (
          <TableRow key={i} className="text-[11px]">
            <TableCell className="py-1 font-medium">{r.resp}</TableCell>
            <TableCell className="py-1">{r.model}</TableCell>
            <TableCell className="py-1 max-w-[100px] truncate">{r.cliente}</TableCell>
            <TableCell className="py-1">{r.enc}</TableCell>
            <TableCell className="py-1">{formatDate(r.neg)}</TableCell>
          </TableRow>
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
  const [page, setPage] = useState(0);
  const pageSize = 15;
  const pagedData = tableData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(tableData.length / pageSize);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-lg border p-3" style={{ borderColor: color + '40' }}>
        <h2 className="text-sm font-bold" style={{ color }}>{title}</h2>
        <p className="text-[10px] text-muted-foreground uppercase mt-0.5">{subtitle}</p>
        <p className="text-2xl font-bold mt-1" style={{ color }}>{total} <span className="text-xs font-normal text-muted-foreground">{totalLabel}</span></p>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-lg p-3">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey="count" fill={color} name="Total" label={{ position: 'top', fontSize: 9 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-hidden" style={{ borderColor: color + '30' }}>
        <div className="px-3 py-1.5" style={{ backgroundColor: color, color: 'white' }}>
          <span className="text-[10px] font-semibold uppercase">{title} — {tableData.length} registos</span>
        </div>
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                {tableHeaders.map(h => <TableHead key={h} className="py-1.5">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedData.map(renderRow)}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-border">
            <span className="text-[10px] text-muted-foreground">{page + 1}/{totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 text-[10px] rounded bg-accent disabled:opacity-30">←</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 text-[10px] rounded bg-accent disabled:opacity-30">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

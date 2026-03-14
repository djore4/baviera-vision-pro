import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { SalesRadar } from '@/components/SalesRadar';
import { formatDate } from '@/lib/excel-parser';
import type { ControlRecord } from '@/types/data';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, PieChart, Pie, Cell, Treemap,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

export default function ProducaoPage() {
  const { filteredControl, data } = useData();
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // All deals with NEG date in period (deals closed)
  const deals = useMemo(() => filteredControl.filter(r => r.neg), [filteredControl]);

  // Performance de Negócios
  const perfData = useMemo(() => {
    if (!data) return [];
    const respMap: Record<string, number> = {};
    deals.forEach(r => { respMap[r.resp] = (respMap[r.resp] || 0) + 1; });

    const targetMap: Record<string, number> = {};
    data.objetivosResp.forEach(o => { targetMap[o.resp] = (targetMap[o.resp] || 0) + o.objetivo; });

    const allResps = new Set([...Object.keys(respMap), ...Object.keys(targetMap)]);
    return Array.from(allResps).map(resp => {
      const closed = respMap[resp] || 0;
      const target = targetMap[resp] || 0;
      return { resp, closed, target, pct: target ? Math.round((closed / target) * 100) : 0 };
    }).sort((a, b) => b.closed - a.closed);
  }, [deals, data]);

  const totalDeals = deals.length;
  const qorCount = useMemo(() => deals.filter(r => r.qor === 1).length, [deals]);
  const bevCount = useMemo(() => deals.filter(r => r.bev === 1).length, [deals]);

  // Entidade
  const entityData = useMemo(() => {
    const map: Record<string, number> = {};
    deals.forEach(r => { if (r.profile) map[r.profile] = (map[r.profile] || 0) + 1; });
    const total = deals.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }));
  }, [deals]);

  // Origem
  const originData = useMemo(() => {
    const map: Record<string, number> = {};
    deals.forEach(r => { if (r.origin) map[r.origin] = (map[r.origin] || 0) + 1; });
    return Object.entries(map).map(([name, size]) => ({ name, size }));
  }, [deals]);

  // Mix Modelos
  const modelData = useMemo(() => {
    const map: Record<string, number> = {};
    deals.forEach(r => { if (r.model) map[r.model] = (map[r.model] || 0) + 1; });
    return Object.entries(map).map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size);
  }, [deals]);

  // Table
  const tableData = useMemo(() => [...deals].sort((a, b) => (a.neg?.getTime() || 0) - (b.neg?.getTime() || 0)), [deals]);
  const pagedData = tableData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(tableData.length / pageSize);

  if (!data) {
    return <EmptyState />;
  }

  return (
    <div className="flex gap-4 animate-fade-in">
      <div className="w-44 flex-shrink-0"><PeriodFilter /></div>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Top row */}
        <div className="grid grid-cols-12 gap-3">
          {/* Performance chart */}
          <div className="col-span-6 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Performance de Negócios</h3>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={perfData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar yAxisId="left" dataKey="closed" fill="#1C69D4" name="Fechados" label={{ position: 'top', fontSize: 9 }} />
                <Bar yAxisId="left" dataKey="target" fill="#334155" name="Objetivo" label={{ position: 'top', fontSize: 9 }} />
                <Line yAxisId="right" dataKey="pct" stroke="#F59E0B" name="% Realização" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* KPIs */}
          <div className="col-span-2 space-y-3">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Total Negócios</p>
              <p className="text-3xl font-bold text-primary">{totalDeals}</p>
            </div>
            <DonutSmall title="BEV" count={bevCount} total={totalDeals} color="#16A34A" />
            <DonutSmall title="QoR" count={qorCount} total={totalDeals} color="#F59E0B" />
          </div>

          {/* Entidade */}
          <div className="col-span-2 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Entidade</h3>
            {entityData.map(e => (
              <div key={e.name} className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: PROFILE_COLORS[e.name] || '#888' }} />
                <span className="text-[10px] flex-1">{e.name}</span>
                <span className="text-[10px] font-medium">{e.pct}%</span>
              </div>
            ))}
          </div>

          {/* Sales Radar */}
          <div className="col-span-2 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Sales Radar</h3>
            <SalesRadar records={deals} height="200px" />
          </div>
        </div>

        {/* Middle: Treemaps */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Origem dos Negócios</h3>
            <ResponsiveContainer width="100%" height={160}>
              <Treemap data={originData} dataKey="size" aspectRatio={4 / 3} stroke="hsl(var(--card))">
                {originData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Treemap>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Mix Modelos</h3>
            <ResponsiveContainer width="100%" height={160}>
              <Treemap data={modelData} dataKey="size" aspectRatio={4 / 3} stroke="hsl(var(--card))">
                {modelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Treemap>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detail Table */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Detalhe ({tableData.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">DATA NEG.</TableHead>
                  <TableHead className="py-1.5">ENTREGA</TableHead>
                  <TableHead className="py-1.5">RESP</TableHead>
                  <TableHead className="py-1.5">TIPO</TableHead>
                  <TableHead className="py-1.5">ORIGEM</TableHead>
                  <TableHead className="py-1.5">MODELO</TableHead>
                  <TableHead className="py-1.5">CLIENTE</TableHead>
                  <TableHead className="py-1.5">BIZ</TableHead>
                  <TableHead className="py-1.5">ENC</TableHead>
                  <TableHead className="py-1.5">CHAS</TableHead>
                  <TableHead className="py-1.5">MAT</TableHead>
                  <TableHead className="py-1.5">FIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedData.map((r, i) => (
                  <TableRow key={i} className="text-[11px]">
                    <TableCell className="py-1">{formatDate(r.neg)}</TableCell>
                    <TableCell className="py-1">{r.mes1}</TableCell>
                    <TableCell className="py-1 font-medium">{r.resp}</TableCell>
                    <TableCell className="py-1">{r.type}</TableCell>
                    <TableCell className="py-1">{r.origin}</TableCell>
                    <TableCell className="py-1">{r.model}</TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">{r.cliente}</TableCell>
                    <TableCell className="py-1">{r.biz}</TableCell>
                    <TableCell className="py-1">{r.enc}</TableCell>
                    <TableCell className="py-1 text-[10px]">{r.chas}</TableCell>
                    <TableCell className="py-1">{r.mat}</TableCell>
                    <TableCell className="py-1">{r.fin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground">Página {page + 1} de {totalPages}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 text-[10px] rounded bg-accent disabled:opacity-30">Anterior</button>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 text-[10px] rounded bg-accent disabled:opacity-30">Seguinte</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DonutSmall({ title, count, total, color }: { title: string; count: number; total: number; color: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const data = [{ name: title, value: count }, { name: 'Rest', value: Math.max(0, total - count) }];
  return (
    <div className="bg-card border border-border rounded-lg p-2 flex items-center gap-2">
      <ResponsiveContainer width={44} height={44}>
        <PieChart><Pie data={data} innerRadius={14} outerRadius={20} dataKey="value" strokeWidth={0}>
          <Cell fill={color} /><Cell fill="hsl(var(--border))" />
        </Pie></PieChart>
      </ResponsiveContainer>
      <div>
        <p className="text-sm font-bold" style={{ color }}>{count}</p>
        <p className="text-[9px] text-muted-foreground">{title} · {pct}%</p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
      <p className="text-lg font-medium">Sem dados carregados</p>
      <p className="text-sm mt-1">Utilize o botão "Carregar Excel" para importar os dados.</p>
    </div>
  );
}

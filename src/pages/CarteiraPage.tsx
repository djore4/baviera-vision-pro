import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { SalesRadar } from '@/components/SalesRadar';
import { isPipeline, formatDate } from '@/lib/excel-parser';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];
const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

export default function CarteiraPage() {
  const { filteredControl, data } = useData();
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const portfolio = useMemo(() => filteredControl.filter(isPipeline), [filteredControl]);

  // Carteira por Responsável (stacked by month)
  const carteiraByMonth = useMemo(() => {
    const resps = [...new Set(portfolio.map(r => r.resp).filter(Boolean))];
    const monthMap: Record<string, Record<string, number>> = {};
    portfolio.forEach(r => {
      if (!r.mes1) return;
      if (!monthMap[r.mes1]) monthMap[r.mes1] = {};
      monthMap[r.mes1][r.resp] = (monthMap[r.mes1][r.resp] || 0) + 1;
    });
    const months = Object.keys(monthMap).sort().slice(0, 8);
    return { months: months.map(m => ({ month: m, ...monthMap[m] })), resps };
  }, [portfolio]);

  const totalPortfolio = portfolio.length;
  const bevCount = useMemo(() => portfolio.filter(r => r.bev === 1).length, [portfolio]);
  const qorCount = useMemo(() => portfolio.filter(r => r.qor === 1).length, [portfolio]);

  // Carteira de Gaia (% por resp)
  const respPct = useMemo(() => {
    const map: Record<string, number> = {};
    portfolio.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
    const total = portfolio.length || 1;
    return Object.entries(map)
      .map(([resp, count]) => ({ resp, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [portfolio]);

  // Entidade donut
  const entityData = useMemo(() => {
    const map: Record<string, number> = {};
    portfolio.forEach(r => { if (r.profile) map[r.profile] = (map[r.profile] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [portfolio]);

  // Model treemap
  const modelData = useMemo(() => {
    const map: Record<string, number> = {};
    portfolio.forEach(r => { if (r.model) map[r.model] = (map[r.model] || 0) + 1; });
    return Object.entries(map).map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size);
  }, [portfolio]);

  // Tipologia by month (QoR + BEV)
  const typoData = useMemo(() => {
    const monthMap: Record<string, { month: string; qor: number; bev: number }> = {};
    portfolio.forEach(r => {
      if (!r.mes1) return;
      if (!monthMap[r.mes1]) monthMap[r.mes1] = { month: r.mes1, qor: 0, bev: 0 };
      if (r.qor === 1) monthMap[r.mes1].qor++;
      if (r.bev === 1) monthMap[r.mes1].bev++;
    });
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(0, 6);
  }, [portfolio]);

  // Table
  const tableData = useMemo(() =>
    [...portfolio].sort((a, b) => a.mes1.localeCompare(b.mes1) || a.week198.localeCompare(b.week198)),
    [portfolio]
  );
  const pagedData = tableData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(tableData.length / pageSize);

  if (!data) {
    return <div className="flex items-center justify-center h-96 text-muted-foreground"><p>Sem dados carregados</p></div>;
  }

  return (
    <div className="flex gap-4 animate-fade-in">
      <div className="w-44 flex-shrink-0"><PeriodFilter /></div>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Top */}
        <div className="grid grid-cols-12 gap-3">
          {/* Stacked bar by month */}
          <div className="col-span-5 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Carteira por Responsável</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={carteiraByMonth.months} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                {carteiraByMonth.resps.map((resp, i) => (
                  <Bar key={resp} dataKey={resp} stackId="a" fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* KPIs */}
          <div className="col-span-2 space-y-3">
            <div className="bg-card border border-border rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Total Carteira</p>
              <p className="text-3xl font-bold text-primary">{totalPortfolio}</p>
              <div className="flex justify-center gap-3 mt-2">
                <span className="text-xs font-semibold text-bmw-green">{bevCount} BEV</span>
                <span className="text-xs font-semibold text-bmw-orange">{qorCount} QoR</span>
              </div>
            </div>

            {/* Resp % */}
            <div className="bg-card border border-border rounded-lg p-3">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Carteira de Gaia</h3>
              {respPct.slice(0, 8).map((r, i) => (
                <div key={r.resp} className="mb-1">
                  <div className="flex justify-between text-[10px]">
                    <span>{r.resp}</span>
                    <span className="font-medium">{r.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entidade donut */}
          <div className="col-span-3 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Entidade (Carteira)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={entityData} innerRadius={40} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {entityData.map((e, i) => <Cell key={i} fill={PROFILE_COLORS[e.name] || COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Sales Radar */}
          <div className="col-span-2 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Sales Radar</h3>
            <SalesRadar records={portfolio} height="200px" />
          </div>
        </div>

        {/* Middle */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Carteira por Modelo</h3>
            <ResponsiveContainer width="100%" height={160}>
              <Treemap data={modelData} dataKey="size" aspectRatio={4 / 3} stroke="hsl(var(--card))">
                {modelData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Treemap>
            </ResponsiveContainer>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Carteira por Tipologia</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={typoData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="qor" fill="#F59E0B" name="QoR" />
                <Bar dataKey="bev" fill="#16A34A" name="BEV" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Carteira ({tableData.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">RESP</TableHead>
                  <TableHead className="py-1.5">DFECHO</TableHead>
                  <TableHead className="py-1.5">MÊS1</TableHead>
                  <TableHead className="py-1.5">198</TableHead>
                  <TableHead className="py-1.5">MODELO</TableHead>
                  <TableHead className="py-1.5">CLIENTE</TableHead>
                  <TableHead className="py-1.5">ORIGEM</TableHead>
                  <TableHead className="py-1.5">PERFIL</TableHead>
                  <TableHead className="py-1.5">BIZ</TableHead>
                  <TableHead className="py-1.5">ENC</TableHead>
                  <TableHead className="py-1.5">CHAS</TableHead>
                  <TableHead className="py-1.5">FIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedData.map((r, i) => (
                  <TableRow key={i} className="text-[11px]">
                    <TableCell className="py-1 font-medium">{r.resp}</TableCell>
                    <TableCell className="py-1">{formatDate(r.neg)}</TableCell>
                    <TableCell className="py-1">{r.mes1}</TableCell>
                    <TableCell className="py-1">
                      {r.week198 === 'P' ? (
                        <Badge variant="outline" className="border-bmw-green text-bmw-green text-[10px]">P</Badge>
                      ) : r.week198 ? (
                        <Badge variant="outline" className="border-primary text-primary text-[10px]">{r.week198}</Badge>
                      ) : ''}
                    </TableCell>
                    <TableCell className="py-1">{r.model}</TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">{r.cliente}</TableCell>
                    <TableCell className="py-1">{r.origin}</TableCell>
                    <TableCell className="py-1">{r.profile}</TableCell>
                    <TableCell className="py-1">{r.biz}</TableCell>
                    <TableCell className="py-1">{r.enc}</TableCell>
                    <TableCell className="py-1 text-[10px]">{r.chas}</TableCell>
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

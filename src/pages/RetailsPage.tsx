import { useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { SalesRadar } from '@/components/SalesRadar';
import { isRetailDelivery, formatDate } from '@/lib/excel-parser';
import type { ControlRecord } from '@/types/data';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap, Legend,
} from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', Fext: '#F59E0B', Fint: '#8B5CF6' };
const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

export default function RetailsPage() {
  const { filteredControl, data } = useData();
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const retails = useMemo(() => filteredControl.filter(isRetailDelivery), [filteredControl]);
  const perdidos = useMemo(() => filteredControl.filter(r => r.status === 'Perdido'), [filteredControl]);

  // Status por Responsável
  const statusByResp = useMemo(() => {
    const map: Record<string, { resp: string; retail: number; perdido: number }> = {};
    retails.forEach(r => {
      if (!map[r.resp]) map[r.resp] = { resp: r.resp, retail: 0, perdido: 0 };
      map[r.resp].retail++;
    });
    perdidos.forEach(r => {
      if (!map[r.resp]) map[r.resp] = { resp: r.resp, retail: 0, perdido: 0 };
      map[r.resp].perdido++;
    });
    return Object.values(map).sort((a, b) => (b.retail + b.perdido) - (a.retail + a.perdido));
  }, [retails, perdidos]);

  // Garantia
  const certoCount = useMemo(() => retails.filter(r => r.gar === 'GAR').length, [retails]);

  // Realização vs Objetivo
  const realization = useMemo(() => {
    if (!data) return { actual: 0, target: 0, pct: 0 };
    const actual = retails.length;
    const target = data.objetivosTotal.reduce((s, o) => s + o.orcado, 0);
    return { actual, target: target || 1, pct: target ? Math.round((actual / target) * 100) : 0 };
  }, [retails, data]);

  // Método de Pagamento
  const finData = useMemo(() => {
    const map: Record<string, number> = {};
    retails.forEach(r => { if (r.fin) map[r.fin] = (map[r.fin] || 0) + 1; });
    const total = retails.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }));
  }, [retails]);

  // Origem dos Negócios
  const originData = useMemo(() => {
    const map: Record<string, number> = {};
    retails.forEach(r => { if (r.origin) map[r.origin] = (map[r.origin] || 0) + 1; });
    return Object.entries(map).map(([name, size]) => ({ name, size }));
  }, [retails]);

  // Mix Modelos
  const modelData = useMemo(() => {
    const map: Record<string, number> = {};
    retails.forEach(r => { if (r.model) map[r.model] = (map[r.model] || 0) + 1; });
    return Object.entries(map).map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size);
  }, [retails]);

  // QoR & BEV donuts
  const qorCount = useMemo(() => retails.filter(r => r.qor === 1).length, [retails]);
  const bevCount = useMemo(() => retails.filter(r => r.bev === 1).length, [retails]);

  // Entidade
  const entityData = useMemo(() => {
    const map: Record<string, number> = {};
    retails.forEach(r => { if (r.profile) map[r.profile] = (map[r.profile] || 0) + 1; });
    const total = retails.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }));
  }, [retails]);

  // Detail table
  const tableData = useMemo(() => {
    return [...retails].sort((a, b) => (b.date298?.getTime() || 0) - (a.date298?.getTime() || 0));
  }, [retails]);

  const pagedData = tableData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(tableData.length / pageSize);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <p className="text-lg font-medium">Sem dados carregados</p>
        <p className="text-sm mt-1">Utilize o botão "Carregar Excel" para importar os dados.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 animate-fade-in">
      {/* Slicer */}
      <div className="w-44 flex-shrink-0 space-y-3">
        <PeriodFilter />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Row 1: KPIs */}
        <div className="grid grid-cols-12 gap-3">
          {/* Status por Responsável */}
          <div className="col-span-4 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Status por Responsável</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusByResp} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="resp" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="retail" fill="#1C69D4" name="Retail" label={{ position: 'top', fontSize: 9 }} />
                <Bar dataKey="perdido" fill="#334155" name="Perdido" label={{ position: 'top', fontSize: 9 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Garantia + Gauge */}
          <div className="col-span-4 space-y-3">
            <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-4">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase">Garantia de Entrega</p>
                <p className="text-3xl font-bold text-bmw-green">{certoCount}</p>
                <p className="text-xs text-muted-foreground">entregas "Certo"</p>
              </div>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-bmw-green rounded-full transition-all"
                  style={{ width: `${retails.length ? (certoCount / retails.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Realização */}
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Realização vs Objetivo</p>
              <div className="flex items-end justify-center gap-6">
                <GaugeSimple value={realization.pct} />
              </div>
              <div className="flex justify-between mt-3 text-center">
                <div>
                  <p className="text-lg font-bold text-primary">{realization.actual}</p>
                  <p className="text-[10px] text-muted-foreground">Baviera</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{realization.target}</p>
                  <p className="text-[10px] text-muted-foreground">BMW</p>
                </div>
                <div>
                  <p className="text-lg font-bold" style={{ color: realization.pct >= 90 ? '#16A34A' : realization.pct >= 70 ? '#F59E0B' : '#DC2626' }}>{realization.pct}%</p>
                  <p className="text-[10px] text-muted-foreground">Realização</p>
                </div>
              </div>
            </div>
          </div>

          {/* Método de Pagamento */}
          <div className="col-span-4 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Método de Pagamento</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={finData} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="value" label={{ position: 'right', fontSize: 9 }}>
                  {finData.map((entry, i) => (
                    <Cell key={i} fill={FIN_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-12 gap-3">
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

          {/* Origem */}
          <div className="col-span-3 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Origem dos Negócios</h3>
            <ResponsiveContainer width="100%" height={160}>
              <Treemap data={originData} dataKey="size" aspectRatio={4 / 3} stroke="hsl(var(--card))">
                {originData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Treemap>
            </ResponsiveContainer>
          </div>

          {/* Mix Modelos */}
          <div className="col-span-3 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Mix Modelos</h3>
            <ResponsiveContainer width="100%" height={160}>
              <Treemap data={modelData} dataKey="size" aspectRatio={4 / 3} stroke="hsl(var(--card))">
                {modelData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Treemap>
            </ResponsiveContainer>
          </div>

          {/* QoR + BEV donuts */}
          <div className="col-span-2 space-y-3">
            <DonutCard title="QoR" count={qorCount} total={retails.length} color="#F59E0B" />
            <DonutCard title="BEV" count={bevCount} total={retails.length} color="#16A34A" />
          </div>

          {/* Sales Radar */}
          <div className="col-span-2 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Sales Radar</h3>
            <SalesRadar records={retails} height="180px" />
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
                  <TableHead className="py-1.5">RESP</TableHead>
                  <TableHead className="py-1.5">GAR</TableHead>
                  <TableHead className="py-1.5">STATUS</TableHead>
                  <TableHead className="py-1.5">TIPO</TableHead>
                  <TableHead className="py-1.5">ORIGEM</TableHead>
                  <TableHead className="py-1.5">PERFIL</TableHead>
                  <TableHead className="py-1.5">MODELO</TableHead>
                  <TableHead className="py-1.5">CLIENTE</TableHead>
                  <TableHead className="py-1.5">BIZ</TableHead>
                  <TableHead className="py-1.5">ENC</TableHead>
                  <TableHead className="py-1.5">CHAS</TableHead>
                  <TableHead className="py-1.5">MAT</TableHead>
                  <TableHead className="py-1.5">FIN</TableHead>
                  <TableHead className="py-1.5">198</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedData.map((r, i) => (
                  <TableRow key={i} className="text-[11px]">
                    <TableCell className="py-1 font-medium">{r.resp}</TableCell>
                    <TableCell className="py-1">
                      <Badge variant="outline" className={r.gar === 'GAR' ? 'border-bmw-green text-bmw-green text-[10px]' : 'text-muted-foreground text-[10px]'}>
                        {r.gar === 'GAR' ? 'Certo' : 'Incerto'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1">{r.status}</TableCell>
                    <TableCell className="py-1">{r.type}</TableCell>
                    <TableCell className="py-1">{r.origin}</TableCell>
                    <TableCell className="py-1">{r.profile}</TableCell>
                    <TableCell className="py-1">{r.model}</TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">{r.cliente}</TableCell>
                    <TableCell className="py-1">{r.biz}</TableCell>
                    <TableCell className="py-1">{r.enc}</TableCell>
                    <TableCell className="py-1 text-[10px]">{r.chas}</TableCell>
                    <TableCell className="py-1">{r.mat}</TableCell>
                    <TableCell className="py-1">{r.fin}</TableCell>
                    <TableCell className="py-1">{r.week198}</TableCell>
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

function GaugeSimple({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 150);
  const angle = -90 + (clamped / 150) * 180;
  const color = value >= 90 ? '#16A34A' : value >= 70 ? '#F59E0B' : '#DC2626';

  return (
    <svg viewBox="0 0 120 70" className="w-32 h-auto">
      {/* Background arc */}
      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
      {/* Red zone */}
      <path d="M 10 60 A 50 50 0 0 1 36.7 18.4" fill="none" stroke="#DC262640" strokeWidth="8" strokeLinecap="round" />
      {/* Yellow zone */}
      <path d="M 36.7 18.4 A 50 50 0 0 1 60 10" fill="none" stroke="#F59E0B40" strokeWidth="8" strokeLinecap="round" />
      {/* Green zone */}
      <path d="M 60 10 A 50 50 0 0 1 110 60" fill="none" stroke="#16A34A40" strokeWidth="8" strokeLinecap="round" />
      {/* Needle */}
      <line
        x1="60" y1="60"
        x2={60 + 40 * Math.cos((angle * Math.PI) / 180)}
        y2={60 + 40 * Math.sin((angle * Math.PI) / 180)}
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
      />
      <circle cx="60" cy="60" r="3" fill={color} />
      <text x="60" y="56" textAnchor="middle" className="text-[10px] font-bold" fill={color}>{value}%</text>
    </svg>
  );
}

function DonutCard({ title, count, total, color }: { title: string; count: number; total: number; color: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const data = [
    { name: title, value: count },
    { name: 'Outros', value: total - count },
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">{title}</h3>
      <div className="flex items-center gap-2">
        <ResponsiveContainer width={60} height={60}>
          <PieChart>
            <Pie data={data} innerRadius={18} outerRadius={26} dataKey="value" strokeWidth={0}>
              <Cell fill={color} />
              <Cell fill="hsl(var(--border))" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div>
          <p className="text-xl font-bold" style={{ color }}>{count}</p>
          <p className="text-[10px] text-muted-foreground">{pct}%</p>
        </div>
      </div>
    </div>
  );
}

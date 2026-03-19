import { useMemo, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { SalesRadar } from '@/components/SalesRadar';
import { formatDate } from '@/lib/excel-parser';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap, Legend, LabelList,
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
  const [selectedResp, setSelectedResp] = useState<string | null>(null);
  const [selectedGar, setSelectedGar] = useState<string | null>(null);
  const [selectedFin, setSelectedFin] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedQor, setSelectedQor] = useState<boolean | null>(null);
  const [selectedBev, setSelectedBev] = useState<boolean | null>(null);
  const pageSize = 10;

  const baseRecords = useMemo(() =>
    filteredControl.filter(r =>
      ['Carteira', 'Matricula', 'Retail'].includes(r.status) &&
      (r.type === 'VN' || r.type === 'VD')
    ), [filteredControl]);

  const filtered = useMemo(() => {
    let result = baseRecords;
    if (selectedResp) result = result.filter(r => r.resp === selectedResp);
    if (selectedGar) result = result.filter(r => (r.gar === 'GAR' ? 'Certo' : 'Incerto') === selectedGar);
    if (selectedFin) result = result.filter(r => r.fin === selectedFin);
    if (selectedOrigin) result = result.filter(r => r.origin === selectedOrigin);
    if (selectedModel) result = result.filter(r => r.model === selectedModel);
    if (selectedQor !== null) result = result.filter(r => (r.qor === 1) === selectedQor);
    if (selectedBev !== null) result = result.filter(r => (r.bev === 1) === selectedBev);
    return result;
  }, [baseRecords, selectedResp, selectedGar, selectedFin, selectedOrigin, selectedModel, selectedQor, selectedBev]);

  const retails = useMemo(() => filtered.filter(r => r.status === 'Retail'), [filtered]);

  const statusByResp = useMemo(() => {
    const map: Record<string, { resp: string; Carteira: number; Matricula: number; Retail: number; total: number }> = {};
    filtered.forEach(r => {
      if (!map[r.resp]) map[r.resp] = { resp: r.resp, Carteira: 0, Matricula: 0, Retail: 0, total: 0 };
      if (r.status === 'Carteira') map[r.resp].Carteira++;
      else if (r.status === 'Matricula') map[r.resp].Matricula++;
      else if (r.status === 'Retail') map[r.resp].Retail++;
      map[r.resp].total++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const garData = useMemo(() => {
    const certo = filtered.filter(r => r.gar === 'GAR').length;
    const incerto = filtered.length - certo;
    return [
      { name: 'Certo', size: certo },
      { name: 'Incerto', size: incerto },
    ].filter(d => d.size > 0);
  }, [filtered]);

  const realization = useMemo(() => {
    if (!data) return { actual: 0, targetBav: 0, targetBMW: 0, pct: 0 };
    const actual = retails.length;
    const targetBav = data.objetivosTotal.reduce((s, o) => s + o.orcado, 0);
    const targetBMW = data.objetivosTotal.reduce((s, o) => s + o.range2, 0);
    return { actual, targetBav: targetBav || 0, targetBMW: targetBMW || 0, pct: targetBav ? Math.round((actual / targetBav) * 100) : 0 };
  }, [retails, data]);

  const finData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.fin) map[r.fin] = (map[r.fin] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const originData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.origin) map[r.origin] = (map[r.origin] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map)
      .map(([name, size]) => ({ name, size, pct: Math.round((size / total) * 100) }))
      .sort((a, b) => b.size - a.size);
  }, [filtered]);

  const modelData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.model) map[r.model] = (map[r.model] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map)
      .map(([name, size]) => ({ name, size, pct: Math.round((size / total) * 100) }))
      .sort((a, b) => b.size - a.size);
  }, [filtered]);

  const qorCount = useMemo(() => filtered.filter(r => r.qor === 1).length, [filtered]);
  const bevCount = useMemo(() => filtered.filter(r => r.bev === 1).length, [filtered]);

  const entityData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.profile) map[r.profile] = (map[r.profile] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }));
  }, [filtered]);

  const tableData = useMemo(() => {
    return [...filtered].sort((a, b) => (b.date298?.getTime() || 0) - (a.date298?.getTime() || 0));
  }, [filtered]);

  const pagedData = tableData.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(tableData.length / pageSize);

  const resetPage = () => setPage(0);
  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, val: T, nullVal: T) => {
    setter(prev => prev === val ? nullVal : val);
    resetPage();
  };

  const handleRespClick = useCallback((respName: string) => { toggle(setSelectedResp, respName, null as string | null); }, []);
  const handleGarClick = useCallback((garName: string) => { toggle(setSelectedGar, garName, null as string | null); }, []);
  const handleFinClick = useCallback((finName: string) => { toggle(setSelectedFin, finName, null as string | null); }, []);
  const handleOriginClick = useCallback((name: string) => { toggle(setSelectedOrigin, name, null as string | null); }, []);
  const handleModelClick = useCallback((name: string) => { toggle(setSelectedModel, name, null as string | null); }, []);
  const handleQorClick = useCallback(() => { setSelectedQor(prev => prev === true ? null : true); resetPage(); }, []);
  const handleBevClick = useCallback(() => { setSelectedBev(prev => prev === true ? null : true); resetPage(); }, []);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <p className="text-lg font-medium">Sem dados carregados</p>
        <p className="text-sm mt-1">Utilize o botão "Carregar Excel" para importar os dados.</p>
      </div>
    );
  }

  const activeFilters = [
    selectedResp && `Resp: ${selectedResp}`,
    selectedGar && `Garantia: ${selectedGar}`,
    selectedFin && `Fin: ${selectedFin}`,
    selectedOrigin && `Origem: ${selectedOrigin}`,
    selectedModel && `Modelo: ${selectedModel}`,
    selectedQor !== null && `QoR: Sim`,
    selectedBev !== null && `BEV: Sim`,
  ].filter(Boolean);

  const clearFilter = (type: string) => {
    if (type === 'resp') setSelectedResp(null);
    if (type === 'gar') setSelectedGar(null);
    if (type === 'fin') setSelectedFin(null);
    if (type === 'origin') setSelectedOrigin(null);
    if (type === 'model') setSelectedModel(null);
    if (type === 'qor') setSelectedQor(null);
    if (type === 'bev') setSelectedBev(null);
    resetPage();
  };

  return (
    <div className="flex gap-4 animate-fade-in">
      <div className="w-44 flex-shrink-0 space-y-3">
        <PeriodFilter />
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Filtros:</span>
            {selectedResp && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('resp')}>{selectedResp} ✕</Badge>}
            {selectedGar && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('gar')}>{selectedGar} ✕</Badge>}
            {selectedFin && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('fin')}>{selectedFin} ✕</Badge>}
            {selectedOrigin && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('origin')}>{selectedOrigin} ✕</Badge>}
            {selectedModel && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('model')}>{selectedModel} ✕</Badge>}
            {selectedQor !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('qor')}>QoR ✕</Badge>}
            {selectedBev !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('bev')}>BEV ✕</Badge>}
          </div>
        )}

        {/* Row 1 */}
        <div className="grid grid-cols-12 gap-3">
          {/* Status por Responsável */}
          <div className="col-span-5 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Status por Responsável</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusByResp} barSize={14} onClick={(e) => { if (e?.activeLabel) handleRespClick(e.activeLabel as string); }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="resp" tick={{ fontSize: 10, cursor: 'pointer' }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Retail" stackId="a" fill="#1C69D4" />
                <Bar dataKey="Matricula" stackId="a" fill="#06B6D4" />
                <Bar dataKey="Carteira" stackId="a" fill="#F59E0B">
                  <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-1 text-center">Clique num responsável para filtrar</p>
          </div>

          {/* Garantia + Realização */}
          <div className="col-span-3 space-y-3">
            <div className="bg-card border border-border rounded-lg p-3">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Garantia de Entrega</h3>
              <ResponsiveContainer width="100%" height={100}>
                <Treemap data={garData} dataKey="size" aspectRatio={3} stroke="hsl(var(--card))"
                  onClick={(node: any) => { if (node?.name) handleGarClick(node.name); }}
                  content={<GarTreemapContent selectedGar={selectedGar} />} />
              </ResponsiveContainer>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">Clique para filtrar</p>
            </div>

            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Realização vs Objetivo</p>
              <div className="flex items-end justify-center gap-6">
                <GaugeSimple value={realization.pct} />
              </div>
              <div className="flex justify-between mt-3 text-center">
                <div>
                  <p className="text-lg font-bold text-primary">{realization.actual}</p>
                  <p className="text-[10px] text-muted-foreground">Realizado</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{realization.targetBav}</p>
                  <p className="text-[10px] text-muted-foreground">Obj. Baviera</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-muted-foreground">{realization.targetBMW}</p>
                  <p className="text-[10px] text-muted-foreground">Obj. BMW</p>
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
            <div className="space-y-1.5">
              {finData.map((entry, i) => {
                const isSelected = selectedFin === entry.name;
                const isDimmed = selectedFin && !isSelected;
                const barColor = FIN_COLORS[entry.name] || COLORS[i % COLORS.length];
                const maxVal = finData[0]?.value || 1;
                return (
                  <div key={entry.name} className="flex items-center gap-2 cursor-pointer group" onClick={() => handleFinClick(entry.name)}
                    style={{ opacity: isDimmed ? 0.3 : 1 }}>
                    <span className="text-[10px] w-10 text-right flex-shrink-0 font-medium">{entry.name}</span>
                    <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden relative">
                      <div className="h-full rounded-sm transition-all" style={{ width: `${(entry.value / maxVal) * 100}%`, backgroundColor: barColor }} />
                    </div>
                    <span className="text-[10px] font-semibold w-8 text-right">{entry.value}</span>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">({entry.pct}%)</span>
                  </div>
                );
              })}
              <div className="border-t border-border pt-1 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold w-10 text-right">Total</span>
                  <span className="text-[10px] font-bold">{filtered.length}</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">Clique para filtrar</p>
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
                <span className="text-[10px] font-medium">{e.value}</span>
                <span className="text-[10px] text-muted-foreground">({e.pct}%)</span>
              </div>
            ))}
          </div>

          {/* Origem */}
          <div className="col-span-3 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Origem dos Negócios</h3>
            <div className="space-y-1">
              {originData.map((entry, i) => {
                const isSelected = selectedOrigin === entry.name;
                const isDimmed = selectedOrigin && !isSelected;
                const maxVal = originData[0]?.size || 1;
                return (
                  <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => handleOriginClick(entry.name)}
                    style={{ opacity: isDimmed ? 0.3 : 1 }}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] flex-1 truncate">{entry.name}</span>
                    <div className="w-16 h-3 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${(entry.size / maxVal) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="text-[10px] font-semibold w-6 text-right">{entry.size}</span>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">({entry.pct}%)</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">Clique para filtrar</p>
          </div>

          {/* Mix Modelos */}
          <div className="col-span-3 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Mix Modelos</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {modelData.map((entry, i) => {
                const isSelected = selectedModel === entry.name;
                const isDimmed = selectedModel && !isSelected;
                const maxVal = modelData[0]?.size || 1;
                return (
                  <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => handleModelClick(entry.name)}
                    style={{ opacity: isDimmed ? 0.3 : 1 }}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[10px] flex-1 truncate">{entry.name}</span>
                    <div className="w-16 h-3 bg-muted rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm" style={{ width: `${(entry.size / maxVal) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="text-[10px] font-semibold w-6 text-right">{entry.size}</span>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">({entry.pct}%)</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">Clique para filtrar</p>
          </div>

          {/* QoR + BEV */}
          <div className="col-span-2 space-y-3">
            <ClickableDonutCard title="QoR" count={qorCount} total={filtered.length} color="#F59E0B"
              isActive={selectedQor === true} onClick={handleQorClick} />
            <ClickableDonutCard title="BEV" count={bevCount} total={filtered.length} color="#16A34A"
              isActive={selectedBev === true} onClick={handleBevClick} />
          </div>

          {/* Sales Radar */}
          <div className="col-span-2 bg-card border border-border rounded-lg p-3">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Sales Radar</h3>
            <SalesRadar records={filtered} height="180px" />
          </div>
        </div>

        {/* Detail Table */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Detalhe ({tableData.length})</h3>
          </div>
          <div className="overflow-x-auto max-h-64">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  <TableHead className="py-1.5">RESP</TableHead>
                  <TableHead className="py-1.5">GAR</TableHead>
                  <TableHead className="py-1.5">STATUS</TableHead>
                  <TableHead className="py-1.5">TIPO</TableHead>
                  <TableHead className="py-1.5">MODELO</TableHead>
                  <TableHead className="py-1.5">CLIENTE</TableHead>
                  <TableHead className="py-1.5">FIN</TableHead>
                  <TableHead className="py-1.5">298</TableHead>
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
                    <TableCell className="py-1">{r.model}</TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">{r.cliente}</TableCell>
                    <TableCell className="py-1">{r.fin}</TableCell>
                    <TableCell className="py-1">{formatDate(r.date298)}</TableCell>
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

function GarTreemapContent(props: any) {
  const { x, y, width, height, name, size, selectedGar } = props;
  if (!width || !height || width < 1 || height < 1) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        fill={name === 'Certo' ? '#16A34A' : '#94A3B8'}
        stroke="hsl(var(--card))" strokeWidth={2}
        style={{ cursor: 'pointer', opacity: selectedGar && selectedGar !== name ? 0.3 : 1 }} />
      {width > 30 && height > 20 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight="bold">{name}</text>
          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={13} fontWeight="bold">{size}</text>
        </>
      )}
    </g>
  );
}

function GaugeSimple({ value }: { value: number }) {
  const clamped = Math.min(Math.max(value, 0), 150);
  const angle = -90 + (clamped / 150) * 180;
  const color = value >= 90 ? '#16A34A' : value >= 70 ? '#F59E0B' : '#DC2626';
  return (
    <svg viewBox="0 0 120 70" className="w-28 h-auto">
      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
      <path d="M 10 60 A 50 50 0 0 1 36.7 18.4" fill="none" stroke="#DC262640" strokeWidth="8" strokeLinecap="round" />
      <path d="M 36.7 18.4 A 50 50 0 0 1 60 10" fill="none" stroke="#F59E0B40" strokeWidth="8" strokeLinecap="round" />
      <path d="M 60 10 A 50 50 0 0 1 110 60" fill="none" stroke="#16A34A40" strokeWidth="8" strokeLinecap="round" />
      <line x1="60" y1="60" x2={60 + 40 * Math.cos((angle * Math.PI) / 180)} y2={60 + 40 * Math.sin((angle * Math.PI) / 180)}
        stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="60" r="3" fill={color} />
      <text x="60" y="56" textAnchor="middle" className="text-[10px] font-bold" fill={color}>{value}%</text>
    </svg>
  );
}

function ClickableDonutCard({ title, count, total, color, isActive, onClick }: {
  title: string; count: number; total: number; color: string; isActive: boolean; onClick: () => void;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const nonCount = total - count;
  const nonPct = total ? Math.round((nonCount / total) * 100) : 0;
  const pieData = [
    { name: title, value: count },
    { name: 'Outros', value: nonCount },
  ];

  return (
    <div className={`bg-card border rounded-lg p-3 cursor-pointer transition-all ${isActive ? 'border-primary ring-1 ring-primary' : 'border-border'}`} onClick={onClick}>
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">{title}</h3>
      <div className="flex items-center gap-2">
        <ResponsiveContainer width={60} height={60}>
          <PieChart>
            <Pie data={pieData} innerRadius={18} outerRadius={26} dataKey="value" strokeWidth={0}>
              <Cell fill={color} />
              <Cell fill="hsl(var(--border))" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div>
          <p className="text-xl font-bold" style={{ color }}>{count}</p>
          <p className="text-[10px] text-muted-foreground">{pct}% do total</p>
        </div>
      </div>
    </div>
  );
}

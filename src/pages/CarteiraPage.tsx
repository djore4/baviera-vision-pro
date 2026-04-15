import { useMemo, useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useData } from '@/contexts/DataContext';
import { SalesRadar } from '@/components/SalesRadar';
import { formatDate } from '@/lib/excel-parser';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', Fext: '#F59E0B', Fint: '#8B5CF6' };
const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

type SortKey = 'resp' | 'neg' | 'mes1' | 'type' | 'model' | 'version' | 'cliente' | 'fin' | 'biz' | 'enc' | 'chas' | 'mat' | 'origin' | 'profile' | 'week198';
type SortDir = 'asc' | 'desc';

export default function CarteiraPage() {
  const { data } = useData();
  const isMobile = useIsMobile();
  const [selectedResp, setSelectedResp] = useState<string | null>(null);
  const [selectedFin, setSelectedFin] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedQor, setSelectedQor] = useState<boolean | null>(null);
  const [selectedBev, setSelectedBev] = useState<boolean | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [hiddenResps, setHiddenResps] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('mes1');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const baseRecords = useMemo(() =>
    (data?.control ?? []).filter(r => r.status === 'Carteira' || r.status === 'Matricula'),
    [data]
  );

  const filtered = useMemo(() => {
    let result = baseRecords;
    if (selectedResp) result = result.filter(r => r.resp === selectedResp);
    if (selectedFin) result = result.filter(r => r.fin === selectedFin);
    if (selectedOrigin) result = result.filter(r => r.origin === selectedOrigin);
    if (selectedModel) result = result.filter(r => r.model === selectedModel);
    if (selectedQor !== null) result = result.filter(r => (r.qor === 1) === selectedQor);
    if (selectedBev !== null) result = result.filter(r => (r.bev === 1) === selectedBev);
    if (selectedEntity) result = result.filter(r => r.profile === selectedEntity);
    return result;
  }, [baseRecords, selectedResp, selectedFin, selectedOrigin, selectedModel, selectedQor, selectedBev, selectedEntity]);

  // Carteira por Responsável ao longo do tempo (mes1)
  const { respChartData, resps } = useMemo(() => {
    const respSet = new Set(baseRecords.map(r => r.resp).filter(Boolean));
    const allResps = Array.from(respSet).sort();
    const monthMap: Record<string, Record<string, number>> = {};
    filtered.forEach(r => {
      if (!r.mes1) return;
      if (!monthMap[r.mes1]) monthMap[r.mes1] = {};
      monthMap[r.mes1][r.resp] = (monthMap[r.mes1][r.resp] || 0) + 1;
    });
    const months = Object.keys(monthMap).sort();
    const chartData = months.map(m => {
      const total = Object.values(monthMap[m]).reduce((s, v) => s + v, 0);
      return { month: m, ...monthMap[m], _total: total };
    });
    return { respChartData: chartData, resps: allResps };
  }, [filtered, baseRecords]);

  // Carteira Tipologia (QoR + BEV) ao longo do tempo
  const tipoChartData = useMemo(() => {
    const monthMap: Record<string, { month: string; QoR: number; BEV: number }> = {};
    filtered.forEach(r => {
      if (!r.mes1) return;
      if (!monthMap[r.mes1]) monthMap[r.mes1] = { month: r.mes1, QoR: 0, BEV: 0 };
      if (r.qor === 1) monthMap[r.mes1].QoR++;
      if (r.bev === 1) monthMap[r.mes1].BEV++;
    });
    return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const totalCarteira = filtered.length;
  const qorCount = useMemo(() => filtered.filter(r => r.qor === 1).length, [filtered]);
  const bevCount = useMemo(() => filtered.filter(r => r.bev === 1).length, [filtered]);

  const finData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.fin) map[r.fin] = (map[r.fin] || 0) + 1; });
    const totalWithFin = Object.values(map).reduce((s, v) => s + v, 0);
    const diff = filtered.length - totalWithFin;
    const entries = Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / (filtered.length || 1)) * 100) }))
      .sort((a, b) => b.value - a.value);
    if (diff > 0) entries.push({ name: 'N/A', value: diff, pct: Math.round((diff / (filtered.length || 1)) * 100) });
    return entries;
  }, [filtered]);

  const originData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.origin) map[r.origin] = (map[r.origin] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const modelData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.model) map[r.model] = (map[r.model] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const entityData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.profile) map[r.profile] = (map[r.profile] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const tableData = useMemo(() => {
    let rows = [...filtered];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.resp?.toLowerCase().includes(term) ||
        r.type?.toLowerCase().includes(term) ||
        r.model?.toLowerCase().includes(term) ||
        r.version?.toLowerCase().includes(term) ||
        r.cliente?.toLowerCase().includes(term) ||
        r.fin?.toLowerCase().includes(term) ||
        r.biz?.toLowerCase().includes(term) ||
        r.enc?.toLowerCase().includes(term) ||
        r.chas?.toLowerCase().includes(term) ||
        r.mat?.toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'neg': cmp = (a.neg?.getTime() || 0) - (b.neg?.getTime() || 0); break;
        default: cmp = ((a as any)[sortKey] || '').localeCompare((b as any)[sortKey] || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortDir, searchTerm]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-0.5 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-0.5 text-primary" /> : <ArrowDown className="h-3 w-3 ml-0.5 text-primary" />;
  };

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, val: T, nullVal: T) => {
    setter(prev => prev === val ? nullVal : val);
  };

  const handleRespClick = useCallback((resp: string) => { toggle(setSelectedResp, resp, null as string | null); }, []);
  const handleFinClick = useCallback((fin: string) => { toggle(setSelectedFin, fin, null as string | null); }, []);
  const handleOriginClick = useCallback((name: string) => { toggle(setSelectedOrigin, name, null as string | null); }, []);
  const handleModelClick = useCallback((name: string) => { toggle(setSelectedModel, name, null as string | null); }, []);
  const handleEntityClick = useCallback((name: string) => { toggle(setSelectedEntity, name, null as string | null); }, []);
  const handleQorClick = useCallback(() => { setSelectedQor(prev => prev === true ? null : true); }, []);
  const handleBevClick = useCallback(() => { setSelectedBev(prev => prev === true ? null : true); }, []);

  const handleLegendClick = useCallback((e: any) => {
    const key = e?.dataKey;
    if (!key) return;
    setHiddenResps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const exportCSV = useCallback(() => {
    const headers = ['RESP', 'D.FECHO', 'MÊS1', 'TIPO', 'MODELO', 'VERSÃO', 'CLIENTE', 'FIN', 'Bizagi', 'Encomenda', 'Chassis', 'Matrícula', 'Origem', 'Perfil', '198'];
    const rows = tableData.map(r => [
      r.resp, formatDate(r.neg), r.mes1, r.type, r.model, r.version,
      r.cliente, r.fin, r.biz, r.enc, r.chas, r.mat, r.origin, r.profile, r.week198,
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carteira_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tableData]);

  const tableColumns: [SortKey, string][] = [
    ['resp', 'RESP'], ['neg', 'D.Fecho'], ['mes1', 'Mês1'], ['type', 'Tipo'],
    ['model', 'Modelo'], ['version', 'Versão'], ['cliente', 'Cliente'], ['fin', 'Fin'],
    ['biz', 'Bizagi'], ['enc', 'Encomenda'], ['chas', 'Chassis'], ['mat', 'Matrícula'],
    ['origin', 'Origem'], ['profile', 'Perfil'], ['week198', '198'],
  ];

  const activeFilters = [selectedResp, selectedFin, selectedOrigin, selectedModel, selectedEntity, selectedQor, selectedBev].some(Boolean);

  const clearFilter = (type: string) => {
    if (type === 'resp') setSelectedResp(null);
    if (type === 'fin') setSelectedFin(null);
    if (type === 'origin') setSelectedOrigin(null);
    if (type === 'model') setSelectedModel(null);
    if (type === 'entity') setSelectedEntity(null);
    if (type === 'qor') setSelectedQor(null);
    if (type === 'bev') setSelectedBev(null);
  };

  const HorizontalBarList = ({ data: items, colorMap, selected, onClick }: {
    data: { name: string; value: number; pct: number }[];
    colorMap?: Record<string, string>;
    selected: string | null;
    onClick: (name: string) => void;
  }) => {
    const maxVal = items[0]?.value || 1;
    return (
      <div className="space-y-1">
        {items.map((entry, i) => {
          const isSelected = selected === entry.name;
          const isDimmed = selected && !isSelected;
          const color = colorMap?.[entry.name] || COLORS[i % COLORS.length];
          return (
            <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => onClick(entry.name)} style={{ opacity: isDimmed ? 0.3 : 1 }}>
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] w-16 truncate flex-shrink-0">{entry.name}</span>
              <div className="flex-1 h-3 bg-muted rounded-sm overflow-hidden min-w-0">
                <div className="h-full rounded-sm" style={{ width: `${(entry.value / maxVal) * 100}%`, backgroundColor: color }} />
              </div>
              <span className="text-[10px] font-semibold w-6 text-right flex-shrink-0">{entry.value}</span>
              <span className="text-[9px] text-muted-foreground w-8 text-right flex-shrink-0">{entry.pct}%</span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <p className="text-lg font-medium">Sem dados carregados</p>
        <p className="text-sm mt-1">Aceda a <strong>Dados</strong> no menu lateral para importar o ficheiro Excel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {activeFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Filtros:</span>
          {selectedResp && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('resp')}>{selectedResp} ✕</Badge>}
          {selectedFin && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('fin')}>{selectedFin} ✕</Badge>}
          {selectedOrigin && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('origin')}>{selectedOrigin} ✕</Badge>}
          {selectedModel && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('model')}>{selectedModel} ✕</Badge>}
          {selectedEntity && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('entity')}>{selectedEntity} ✕</Badge>}
          {selectedQor !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('qor')}>QoR ✕</Badge>}
          {selectedBev !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('bev')}>BEV ✕</Badge>}
        </div>
      )}

      {/* Row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
        {/* Carteira por Responsável */}
        <div className="xl:col-span-6 bg-card border border-border rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Carteira por Responsável</h3>
            <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{totalCarteira}</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={respChartData} barSize={32} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: 10, cursor: 'pointer' }} onClick={handleLegendClick} />
              {resps.map((resp, i) => (
                <Bar
                  key={resp}
                  dataKey={resp}
                  stackId="a"
                  fill={COLORS[i % COLORS.length]}
                  cursor="pointer"
                  hide={hiddenResps.has(resp)}
                  opacity={selectedResp && selectedResp !== resp ? 0.2 : 1}
                  onClick={() => handleRespClick(resp)}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Carteira Tipologia */}
        <div className="xl:col-span-3 bg-card border border-border rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Tipologia</h3>
            <div className="flex gap-2 text-[10px]">
              <span className="font-semibold" style={{ color: '#F59E0B' }}>{qorCount} QoR</span>
              <span className="font-semibold" style={{ color: '#16A34A' }}>{bevCount} BEV</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tipoChartData} barSize={32} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend wrapperStyle={{ fontSize: 10, cursor: 'pointer' }} />
              <Bar dataKey="QoR" fill="#F59E0B" stackId="a" cursor="pointer" onClick={handleQorClick}
                opacity={selectedQor === false ? 0.2 : 1} />
              <Bar dataKey="BEV" fill="#16A34A" stackId="a" cursor="pointer" onClick={handleBevClick}
                opacity={selectedBev === false ? 0.2 : 1} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Método de Pagamento */}
        <div className="xl:col-span-3 bg-card border border-border rounded-lg p-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Método de Pagamento</h3>
          <div className="flex items-center gap-2">
            <ResponsiveContainer width="50%" height={Math.max(100, finData.length * 28 + 20)}>
              <PieChart>
                <Tooltip formatter={(value: number, name) => [`${value} (${Math.round((Number(value) / (filtered.length || 1)) * 100)}%)`, name]} />
                <Pie data={finData} dataKey="value" nameKey="name" outerRadius={45} stroke="hsl(var(--background))" strokeWidth={1.5}
                  onClick={(entry: any) => entry?.name && handleFinClick(entry.name)} cursor="pointer">
                  {finData.map((entry, i) => {
                    const isSelected = selectedFin === entry.name;
                    const isDimmed = selectedFin && !isSelected;
                    return <Cell key={entry.name} fill={entry.name === 'N/A' ? '#94A3B8' : (FIN_COLORS[entry.name] || COLORS[i % COLORS.length])} opacity={isDimmed ? 0.35 : 1} />;
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 flex-1">
              {finData.map((entry, i) => {
                const isSelected = selectedFin === entry.name;
                const isDimmed = selectedFin && !isSelected;
                return (
                  <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => handleFinClick(entry.name)} style={{ opacity: isDimmed ? 0.3 : 1 }}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.name === 'N/A' ? '#94A3B8' : (FIN_COLORS[entry.name] || COLORS[i % COLORS.length]) }} />
                    <span className="text-[10px] font-medium w-9">{entry.name}</span>
                    <span className="text-[10px] font-semibold w-7 text-right">{entry.value}</span>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">({entry.pct}%)</span>
                  </div>
                );
              })}
              <div className="border-t border-border pt-1 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold">Total</span>
                  <span className="text-[10px] font-bold">{filtered.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-2">
        <div className="xl:col-span-2 bg-card border border-border rounded-lg p-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Entidade</h3>
          <HorizontalBarList data={entityData} colorMap={PROFILE_COLORS} selected={selectedEntity} onClick={handleEntityClick} />
        </div>
        <div className="xl:col-span-2 bg-card border border-border rounded-lg p-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Origem dos Negócios</h3>
          <HorizontalBarList data={originData} selected={selectedOrigin} onClick={handleOriginClick} />
        </div>
        <div className="xl:col-span-2 bg-card border border-border rounded-lg p-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Mix Modelos</h3>
          <div className="max-h-40 overflow-y-auto pr-1">
            <HorizontalBarList data={modelData} selected={selectedModel} onClick={handleModelClick} />
          </div>
        </div>
        <div className="xl:col-span-1" />
        <div className="xl:col-span-5 bg-card border border-border rounded-lg p-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Sales Radar</h3>
          <SalesRadar records={filtered} height="200px" />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-2 py-1.5 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Carteira ({tableData.length})</h3>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 pl-7 text-[11px]" />
            </div>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={exportCSV}>
              <Download className="h-3 w-3" />CSV
            </Button>
          </div>
        </div>
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-[10px]">
                {tableColumns.map(([key, label]) => (
                  <th key={key}
                    className="h-9 px-3 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap bg-card"
                    onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center">{label}<SortIcon col={key} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((r, i) => (
                <tr key={i} className="text-[11px] border-b border-border transition-colors hover:bg-muted/50">
                  <td className="px-3 py-1 font-medium whitespace-nowrap">{r.resp}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.neg)}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.mes1}</td>
                  <td className="px-3 py-1">{r.type}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.model}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.version}</td>
                  <td className="px-3 py-1 max-w-[120px] truncate">{r.cliente}</td>
                  <td className="px-3 py-1">{r.fin}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.biz}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.enc}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.chas}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{r.mat}</td>
                  <td className="px-3 py-1">{r.origin}</td>
                  <td className="px-3 py-1">{r.profile}</td>
                  <td className="px-3 py-1">{r.week198}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

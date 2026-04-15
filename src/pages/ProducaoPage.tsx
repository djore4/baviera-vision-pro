import { useMemo, useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { SalesRadar } from '@/components/SalesRadar';
import { formatDate } from '@/lib/excel-parser';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList, Legend,
} from 'recharts';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', Fext: '#F59E0B', Fint: '#8B5CF6' };
const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

type SortKey = 'neg' | 'mes1' | 'resp' | 'type' | 'model' | 'version' | 'cliente' | 'fin' | 'biz' | 'enc' | 'chas' | 'mat' | 'dmat' | 'date298' | 'app';
type SortDir = 'asc' | 'desc';

export default function ProducaoPage() {
  const { data, filter } = useData();
  const isMobile = useIsMobile();
  const [selectedResp, setSelectedResp] = useState<string | null>(null);
  const [selectedFin, setSelectedFin] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedQor, setSelectedQor] = useState<boolean | null>(null);
  const [selectedBev, setSelectedBev] = useState<boolean | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('neg');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Base: deals with neg date in period
const baseRecords = useMemo(() => {
  if (!data) return [];
  return data.control.filter(r => {
    if (!r.neg) return false;
    const y = r.neg.getFullYear();
    const m = r.neg.getMonth() + 1;
    if (filter.months.length > 0) {
      return filter.months.some(fm => Math.floor(fm / 100) === y && fm % 100 === m);
    }
    if (filter.years.length > 0) return filter.years.includes(y);
    return true;
  });
}, [data, filter]);

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

  // Negócios por Responsável vs Objetivo
const negByResp = useMemo(() => {
  if (!data) return [];
  const map: Record<string, number> = {};
  filtered.forEach(r => { map[r.resp] = (map[r.resp] || 0) + 1; });
const targetMap: Record<string, number> = {};
data.objetivosResp.forEach(o => {
  const [oy, om] = o.mes.split('/').map(Number);
  if (!oy || !om) return;
  if (filter.months.length > 0) {
    const match = filter.months.some(fm => Math.floor(fm / 100) === oy && fm % 100 === om);
    if (!match) return;
  } else if (filter.years.length > 0) {
    if (!filter.years.includes(oy)) return;
  }
  targetMap[o.resp] = (targetMap[o.resp] || 0) + o.objetivo;
});
  const allResps = new Set([...Object.keys(map), ...Object.keys(targetMap)]);
  return Array.from(allResps).map(resp => ({
    resp,
    total: map[resp] || 0,
    objetivo: targetMap[resp] || 0,
  })).sort((a, b) => b.total - a.total);
}, [filtered, data]);

  const totalNeg = useMemo(() => negByResp.reduce((s, r) => s + r.total, 0), [negByResp]);

  // Realização vs Objetivo (placeholder — lógica a definir)
  const selectedMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    if (filter.months.length > 0) {
      filter.months.forEach(fm => {
        const fy = Math.floor(fm / 100);
        const fmo = fm % 100;
        keys.add(`${fy}/${String(fmo).padStart(2, '0')}`);
      });
    } else if (filter.years.length > 0) {
      filter.years.forEach(y => {
        for (let m = 1; m <= 12; m++) {
          keys.add(`${y}/${String(m).padStart(2, '0')}`);
        }
      });
    }
    return keys;
  }, [filter]);

  const realization = useMemo(() => {
    if (!data) return { actual: 0, targetCaetano: 0, targetBMW: 0, target110: 0, pct: 0 };
    const matchingObj = data.objetivosTotal.filter(o => {
      if (selectedMonthKeys.size === 0) return true;
      if (selectedMonthKeys.has(o.mes)) return true;
      const normalized = normalizeMonthKey(o.mes);
      return normalized ? selectedMonthKeys.has(normalized) : false;
    });
    const targetCaetano = matchingObj.reduce((s, o) => s + o.orcado, 0);
    const targetBMW = matchingObj.reduce((s, o) => s + o.range2, 0);
    const target110 = matchingObj.reduce((s, o) => s + o.range3, 0);
    const pct = targetBMW ? Math.round((totalNeg / targetBMW) * 100) : 0;
    return { actual: totalNeg, targetCaetano, targetBMW, target110, pct };
  }, [data, totalNeg, selectedMonthKeys]);

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

  const qorCount = useMemo(() => filtered.filter(r => r.qor === 1).length, [filtered]);
  const bevCount = useMemo(() => filtered.filter(r => r.bev === 1).length, [filtered]);

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
        case 'dmat': cmp = (a.dmat?.getTime() || 0) - (b.dmat?.getTime() || 0); break;
        case 'date298': cmp = (a.date298?.getTime() || 0) - (b.date298?.getTime() || 0); break;
        case 'app': cmp = (a.app?.getTime() || 0) - (b.app?.getTime() || 0); break;
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

  const exportCSV = useCallback(() => {
    const headers = ['RESP', 'TIPO', 'MODELO', 'CLIENTE', 'FIN', 'Bizagi', 'Encomenda', 'Chassis', 'Matrícula', 'Data Negócio', 'Data Matrícula', 'Data Retail', 'Data Apping'];
    const rows = tableData.map(r => [
      r.resp, r.type, r.model, r.cliente, r.fin,
      r.biz, r.enc, r.chas, r.mat,
      formatDate(r.neg), formatDate(r.dmat), formatDate(r.date298), formatDate(r.app),
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `producao_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tableData]);

  const tableColumns: [SortKey, string][] = [
    ['resp', 'RESP'],
    ['type', 'TIPO'],
['model', 'Modelo'],
['version', 'Versão'],
['cliente', 'CLIENTE'],
    ['fin', 'FIN'],
    ['biz', 'Bizagi'],
    ['enc', 'Encomenda'],
    ['chas', 'Chassis'],
    ['mat', 'Matrícula'],
    ['neg', 'Data Negócio'],
    ['dmat', 'Data Matrícula'],
    ['date298', 'Data Retail'],
    ['app', 'Data Apping'],
  ];

  const activeFilters = [
    selectedResp && `Resp: ${selectedResp}`,
    selectedFin && `Fin: ${selectedFin}`,
    selectedOrigin && `Origem: ${selectedOrigin}`,
    selectedModel && `Modelo: ${selectedModel}`,
    selectedEntity && `Entidade: ${selectedEntity}`,
    selectedQor !== null && `QoR: Sim`,
    selectedBev !== null && `BEV: Sim`,
  ].filter(Boolean);

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
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Left column */}
        <div className="w-full lg:w-44 flex-shrink-0">
          <PeriodFilter />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {activeFilters.length > 0 && (
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-2">
            {/* Negócios por Responsável */}
            <div className="xl:col-span-5 bg-card border border-border rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Negócios por Responsável</h3>
                <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{totalNeg}</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
<BarChart data={negByResp} barSize={20}>
  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
  <XAxis dataKey="resp" tick={{ fontSize: 10, cursor: 'pointer' }} />
  <YAxis tick={{ fontSize: 10 }} />
  <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
  <Legend wrapperStyle={{ fontSize: 10 }} />
<Bar dataKey="total" name="Negócios Fechados" fill="#1C69D4" cursor="pointer" onClick={(entry: any) => entry?.resp && handleRespClick(entry.resp)}>
  <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
</Bar>
<Bar dataKey="objetivo" name="Objetivo" fill="#334155" cursor="pointer" onClick={(entry: any) => entry?.resp && handleRespClick(entry.resp)}>
  <LabelList dataKey="objetivo" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
</Bar>
</BarChart>
              </ResponsiveContainer>
            </div>

            {isMobile && <DetailTableBlock tableData={tableData} tableColumns={tableColumns} searchTerm={searchTerm} setSearchTerm={setSearchTerm} toggleSort={toggleSort} SortIcon={SortIcon} exportCSV={exportCSV} />}

{/* Realização vs Objetivo */}
            <div className="xl:col-span-3">
              <div className="bg-gradient-to-br from-primary/5 to-primary/15 border-2 border-primary/30 rounded-lg p-3 h-full flex flex-col">
                <p className="text-xs font-bold text-primary uppercase mb-2 tracking-wide">Realização vs Objetivo</p>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={[{ name: 'Total', fechados: realization.actual, objetivo: realization.targetBMW }]} barSize={40} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" hide />
                      <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="fechados" name="Fechados" fill="#1C69D4">
                        <LabelList dataKey="fechados" position="insideRight" fontSize={11} fontWeight="bold" fill="white" />
                      </Bar>
                      <Bar dataKey="objetivo" name="Objetivo" fill="#334155">
                        <LabelList dataKey="objetivo" position="insideRight" fontSize={11} fontWeight="bold" fill="white" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center mt-2">
                  <p className="text-2xl font-extrabold" style={{ color: realization.pct >= 100 ? '#16A34A' : realization.pct >= 80 ? '#F59E0B' : '#DC2626' }}>
                    {realization.pct}%
                  </p>
                  <p className="text-[9px] text-muted-foreground">{realization.actual} fechados / {realization.targetBMW} objetivo</p>
                </div>
              </div>
            </div>

            {/* Método de Pagamento */}
            <div className="xl:col-span-4 bg-card border border-border rounded-lg p-2">
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

            <div className="xl:col-span-1 grid grid-cols-2 xl:grid-cols-1 gap-2">
              <ClickableDonutCard title="QoR" count={qorCount} total={filtered.length} color="#F59E0B" isActive={selectedQor === true} onClick={handleQorClick} />
              <ClickableDonutCard title="BEV" count={bevCount} total={filtered.length} color="#16A34A" isActive={selectedBev === true} onClick={handleBevClick} />
            </div>

            <div className="xl:col-span-5 bg-card border border-border rounded-lg p-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Sales Radar</h3>
              <SalesRadar records={filtered} height="200px" />
            </div>
          </div>
        </div>
      </div>

      {!isMobile && <DetailTableBlock tableData={tableData} tableColumns={tableColumns} searchTerm={searchTerm} setSearchTerm={setSearchTerm} toggleSort={toggleSort} SortIcon={SortIcon} exportCSV={exportCSV} />}
    </div>
  );
}

function DetailTableBlock({ tableData, tableColumns, searchTerm, setSearchTerm, toggleSort, SortIcon, exportCSV }: {
  tableData: any[]; tableColumns: [SortKey, string][]; searchTerm: string; setSearchTerm: (v: string) => void;
  toggleSort: (k: SortKey) => void; SortIcon: React.FC<{ col: SortKey }>; exportCSV: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-2 py-1.5 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Detalhe ({tableData.length})</h3>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input placeholder="Pesquisar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 pl-7 text-[11px]" />
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={exportCSV}>
            <Download className="h-3 w-3" />
            CSV
          </Button>
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh] relative">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr className="text-[10px]">
              {tableColumns.map(([key, label]) => (
                <th key={key}
                  className="h-9 px-3 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap bg-card"
                  onClick={() => toggleSort(key)}>
                  <span className="inline-flex items-center">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableData.map((r, i) => (
              <tr key={i} className="text-[11px] border-b border-border transition-colors hover:bg-muted/50">
                <td className="px-3 py-1 font-medium whitespace-nowrap">{r.resp}</td>
                <td className="px-3 py-1">{r.type}</td>
<td className="px-3 py-1 whitespace-nowrap">{r.model}</td>
<td className="px-3 py-1 whitespace-nowrap">{r.version}</td>
<td className="px-3 py-1 max-w-[120px] truncate">{r.cliente}</td>
                <td className="px-3 py-1">{r.fin}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.biz}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.enc}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.chas}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.mat}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.neg)}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.dmat)}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.date298)}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.app)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalizeMonthKey(mes: string): string | null {
  if (!mes) return null;
  if (/^\d{4}\/\d{2}$/.test(mes)) return mes;
  const d = new Date(mes);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const ptMonths: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const match = mes.match(/^(\w{3})\W*(\d{4})$/i);
  if (match) { const m = ptMonths[match[1].toLowerCase()]; if (m) return `${match[2]}/${String(m).padStart(2, '0')}`; }
  const match2 = mes.match(/^(\d{1,2})\/(\d{4})$/);
  if (match2) return `${match2[2]}/${String(Number(match2[1])).padStart(2, '0')}`;
  return null;
}

function GaugeSimple({ value }: { value: number }) {
  const maxVal = Math.max(100, value);
  const clamped = Math.min(Math.max(value, 0), maxVal);
  const color = value >= 100 ? '#16A34A' : value >= 80 ? '#F59E0B' : '#DC2626';
  const cx = 60, cy = 60, r = 50;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (pct: number) => { const ang = -180 + (pct / maxVal) * 180; return { x: cx + r * Math.cos(toRad(ang)), y: cy + r * Math.sin(toRad(ang)) }; };
  const describeArc = (s: number, e: number) => { const sp = arcPoint(s); const ep = arcPoint(e); const sweep = ((e - s) / maxVal) * 180; return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`; };
  const needleAng = -180 + (clamped / maxVal) * 180;
  return (
    <svg viewBox="0 0 120 70" className="w-28 h-auto">
      <path d={describeArc(0, maxVal)} fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
      <path d={describeArc(0, Math.min(80, maxVal))} fill="none" stroke="#DC262640" strokeWidth="8" strokeLinecap="round" />
      <path d={describeArc(Math.min(80, maxVal), Math.min(100, maxVal))} fill="none" stroke="#F59E0B40" strokeWidth="8" strokeLinecap="round" />
      {maxVal > 100 && <path d={describeArc(100, maxVal)} fill="none" stroke="#16A34A40" strokeWidth="8" strokeLinecap="round" />}
      <line x1={cx} y1={cy} x2={cx + 40 * Math.cos(toRad(needleAng))} y2={cy + 40 * Math.sin(toRad(needleAng))} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={color} />
      <text x={cx} y="52" textAnchor="middle" className="text-[11px] font-bold" fill={color}>{value}%</text>
    </svg>
  );
}

function ClickableDonutCard({ title, count, total, color, isActive, onClick }: {
  title: string; count: number; total: number; color: string; isActive: boolean; onClick: () => void;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  const pieData = [{ name: title, value: count }, { name: 'Outros', value: Math.max(0, total - count) }];
  return (
    <div className={`bg-card border rounded-lg p-2 cursor-pointer transition-all ${isActive ? 'border-primary ring-1 ring-primary' : 'border-border'}`} onClick={onClick}>
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-0.5">{title}</h3>
      <div className="flex items-center gap-2">
        <ResponsiveContainer width={50} height={50}>
          <PieChart>
            <Pie data={pieData} innerRadius={15} outerRadius={22} dataKey="value" strokeWidth={0}>
              <Cell fill={color} />
              <Cell fill="hsl(var(--border))" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div>
          <p className="text-lg font-bold" style={{ color }}>{count}</p>
          <p className="text-[10px] text-muted-foreground">{pct}% do total</p>
        </div>
      </div>
    </div>
  );
}

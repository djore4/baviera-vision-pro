import { useMemo, useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useData } from '@/contexts/DataContext';
import { useRecordEditor } from '@/components/RecordEditor';
import PedirMatriculaButton from '@/components/PedirMatriculaButton';
import { PeriodFilter } from '@/components/PeriodFilter';
import { formatDate } from '@/lib/excel-parser';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ParkingCircle, Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', Fext: '#F59E0B', Fint: '#8B5CF6' };
const STATUS_COLORS: Record<string, string> = { Retail: '#1C69D4', Matricula: '#06B6D4', Carteira: '#F59E0B' };
const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

type SortKey = 'resp' | 'gar' | 'status' | 'type' | 'model' | 'version' | 'week198' | 'cliente' | 'fin' | 'date298' | 'biz' | 'enc' | 'chas' | 'mat' | 'neg' | 'dmat' | 'app';
type SortDir = 'asc' | 'desc';
type AnalysisTab = 'entidade' | 'origem' | 'modelos';

export default function RetailsPage() {
  const { filteredControl, data, filter } = useData();
  const { openEditor } = useRecordEditor();
  const isMobile = useIsMobile();
  const [selectedResps, setSelectedResps] = useState<Set<string>>(new Set());
  const [selectedGar, setSelectedGar] = useState<string | null>(null);
  const [selectedFin, setSelectedFin] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedQor, setSelectedQor] = useState<boolean | null>(null);
  const [selectedBev, setSelectedBev] = useState<boolean | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [selectedPark, setSelectedPark] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('modelos');
  const [sortKey, setSortKey] = useState<SortKey>('date298');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  const baseRecords = useMemo(() =>
    filteredControl.filter(r => ['Carteira', 'Matricula', 'Retail'].includes(r.status) && (r.type === 'VN' || r.type === 'VD')),
    [filteredControl]);

  const filtered = useMemo(() => {
    let result = baseRecords;
    if (selectedResps.size > 0) result = result.filter(r => selectedResps.has(r.resp));
    if (selectedGar) result = result.filter(r => (r.status === 'Carteira' || r.status === 'Matricula') && (r.gar === 'GAR' ? 'Certo' : 'Incerto') === selectedGar);
    if (selectedFin) result = result.filter(r => r.fin === selectedFin);
    if (selectedOrigin) result = result.filter(r => r.origin === selectedOrigin);
    if (selectedModel) result = result.filter(r => r.model === selectedModel);
    if (selectedQor !== null) result = result.filter(r => (r.qor === 1) === selectedQor);
    if (selectedBev !== null) result = result.filter(r => (r.bev === 1) === selectedBev);
    if (selectedEntity) result = result.filter(r => r.profile === selectedEntity);
    if (selectedPark) result = result.filter(r => r.week198.toUpperCase().includes('P') && r.status !== 'Retail');
    if (selectedStatus) result = result.filter(r => r.status === selectedStatus);
    return result;
  }, [baseRecords, selectedResps, selectedGar, selectedFin, selectedOrigin, selectedModel, selectedQor, selectedBev, selectedEntity, selectedPark, selectedStatus]);

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

  const totalStatusSum = useMemo(() => statusByResp.reduce((s, r) => s + r.total, 0), [statusByResp]);

  const garData = useMemo(() => {
    const pipeline = filtered.filter(r => r.status === 'Carteira' || r.status === 'Matricula');
    const certo = pipeline.filter(r => r.gar === 'GAR').length;
    const incerto = pipeline.length - certo;
    return [{ name: 'Certo', size: certo, total: pipeline.length }, { name: 'Incerto', size: incerto, total: pipeline.length }].filter(d => d.size > 0);
  }, [filtered]);

  const selectedMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    if (filter.months.length > 0) filter.months.forEach(fm => keys.add(`${Math.floor(fm / 100)}/${String(fm % 100).padStart(2, '0')}`));
    else if (filter.years.length > 0) filter.years.forEach(y => { for (let m = 1; m <= 12; m++) keys.add(`${y}/${String(m).padStart(2, '0')}`); });
    return keys;
  }, [filter]);

  const retailCount = useMemo(() => filtered.filter(r => r.status === 'Retail').length, [filtered]);

  const realization = useMemo(() => {
    if (!data) return { actual: 0, retails: 0, targetCaetano: 0, targetBMW: 0, target110: 0, pct: 0 };
    const matchingObj = data.objetivosTotal.filter(o => {
      if (selectedMonthKeys.size === 0) return true;
      if (selectedMonthKeys.has(o.mes)) return true;
      const normalized = normalizeMonthKey(o.mes);
      return normalized ? selectedMonthKeys.has(normalized) : false;
    });
    const targetCaetano = matchingObj.reduce((s, o) => s + o.orcado, 0);
    const targetBMW = matchingObj.reduce((s, o) => s + o.range2, 0);
    const target110 = matchingObj.reduce((s, o) => s + o.range3, 0);
    const pct = targetBMW ? Math.round((totalStatusSum / targetBMW) * 100) : 0;
    return { actual: totalStatusSum, retails: retailCount, targetCaetano, targetBMW, target110, pct };
  }, [data, totalStatusSum, selectedMonthKeys, retailCount]);

  const finData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.fin) map[r.fin] = (map[r.fin] || 0) + 1; });
    const totalWithFin = Object.values(map).reduce((s, v) => s + v, 0);
    const diff = filtered.length - totalWithFin;
    const entries = Object.entries(map).map(([name, value]) => ({ name, value, pct: Math.round((value / (filtered.length || 1)) * 100) })).sort((a, b) => b.value - a.value);
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
  const parkCount = useMemo(() => filtered.filter(r => r.week198.toUpperCase().includes('P') && r.status !== 'Retail').length, [filtered]);

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
        r.resp.toLowerCase().includes(term) || r.status.toLowerCase().includes(term) ||
        r.type.toLowerCase().includes(term) || r.model.toLowerCase().includes(term) ||
        r.cliente.toLowerCase().includes(term) || r.fin.toLowerCase().includes(term) ||
        r.gar.toLowerCase().includes(term) || r.biz.toLowerCase().includes(term) ||
        r.enc.toLowerCase().includes(term) || r.chas.toLowerCase().includes(term) || r.mat.toLowerCase().includes(term)
      );
    }
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'resp': cmp = a.resp.localeCompare(b.resp); break;
        case 'gar': cmp = a.gar.localeCompare(b.gar); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'type': cmp = a.type.localeCompare(b.type); break;
        case 'model': cmp = a.model.localeCompare(b.model); break;
        case 'version': cmp = (a.version || '').localeCompare(b.version || ''); break;
        case 'week198': cmp = (a.week198 || '').localeCompare(b.week198 || ''); break;
        case 'cliente': cmp = a.cliente.localeCompare(b.cliente); break;
        case 'fin': cmp = a.fin.localeCompare(b.fin); break;
        case 'biz': cmp = a.biz.localeCompare(b.biz); break;
        case 'enc': cmp = a.enc.localeCompare(b.enc); break;
        case 'chas': cmp = a.chas.localeCompare(b.chas); break;
        case 'mat': cmp = a.mat.localeCompare(b.mat); break;
        case 'neg': cmp = (a.neg?.getTime() || 0) - (b.neg?.getTime() || 0); break;
        case 'dmat': cmp = (a.dmat?.getTime() || 0) - (b.dmat?.getTime() || 0); break;
        case 'date298': cmp = (a.date298?.getTime() || 0) - (b.date298?.getTime() || 0); break;
        case 'app': cmp = (a.app?.getTime() || 0) - (b.app?.getTime() || 0); break;
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

  const handleRespClick = useCallback((resp: string, ctrlKey = false) => {
    setSelectedResps(prev => {
      const next = new Set(prev);
      if (ctrlKey) { if (next.has(resp)) next.delete(resp); else next.add(resp); }
      else { if (next.size === 1 && next.has(resp)) next.clear(); else { next.clear(); next.add(resp); } }
      return next;
    });
  }, []);

  const handleGarClick = useCallback((g: string) => { toggle(setSelectedGar, g, null as string | null); }, []);
  const handleFinClick = useCallback((f: string) => { toggle(setSelectedFin, f, null as string | null); }, []);
  const handleOriginClick = useCallback((n: string) => { toggle(setSelectedOrigin, n, null as string | null); }, []);
  const handleModelClick = useCallback((n: string) => { toggle(setSelectedModel, n, null as string | null); }, []);
  const handleEntityClick = useCallback((n: string) => { toggle(setSelectedEntity, n, null as string | null); }, []);
  const handleQorClick = useCallback(() => { setSelectedQor(prev => prev === true ? null : true); }, []);
  const handleBevClick = useCallback(() => { setSelectedBev(prev => prev === true ? null : true); }, []);
  const handleStatusClick = useCallback((s: string) => { setSelectedStatus(prev => prev === s ? null : s); }, []);
  const handleLegendClick = (e: any) => { if (e?.value) handleStatusClick(e.value); };

  const exportCSV = useCallback(() => {
    const headers = ['RESP', 'GAR', 'STATUS', 'TIPO', 'MODELO', 'VERSAO', '198', 'CLIENTE', 'FIN', 'Bizagi', 'Encomenda', 'Chassis', 'Matricula', 'Data Negocio', 'Data Matricula', 'Data Retail', 'Data Apping'];
    const rows = tableData.map(r => [r.resp, r.gar === 'GAR' ? 'Certo' : 'Incerto', r.status, r.type, r.model, r.version, r.week198, r.cliente, r.fin, r.biz, r.enc, r.chas, r.mat, formatDate(r.neg), formatDate(r.dmat), formatDate(r.date298), formatDate(r.app)]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `detalhe_retails_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [tableData]);

  const HorizontalBarList = ({ data: items, colorMap, selected, onClick }: {
    data: { name: string; value: number; pct: number }[];
    colorMap?: Record<string, string>; selected: string | null; onClick: (name: string) => void;
  }) => {
    const maxVal = items[0]?.value || 1;
    return (
      <div className="space-y-1">
        {items.map((entry, i) => {
          const isDimmed = selected && selected !== entry.name;
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

  const tableColumns: [SortKey, string][] = [
    ['resp', 'Resp'], ['status', 'Status'], ['type', 'Tipo'],
    ['model', 'Modelo'], ['version', 'Versao'], ['week198', '198'], ['cliente', 'Cliente'],
    ['fin', 'Pag'], ['biz', 'Bizagi'], ['enc', 'Encomenda'], ['chas', 'Chassis'], ['mat', 'Matricula'],
    ['neg', 'Data Fecho'], ['dmat', 'Data Matricula'], ['date298', 'Data Retail'], ['app', 'Data Apping'],
  ];

  const activeFilters = [
    selectedResps.size > 0 && `Resp: ${Array.from(selectedResps).join(', ')}`,
    selectedGar && `Garantia: ${selectedGar}`,
    selectedFin && `Fin: ${selectedFin}`,
    selectedOrigin && `Origem: ${selectedOrigin}`,
    selectedModel && `Modelo: ${selectedModel}`,
    selectedEntity && `Entidade: ${selectedEntity}`,
    selectedQor !== null && 'QoR: Sim',
    selectedBev !== null && 'BEV: Sim',
    selectedPark && 'Parque',
    selectedStatus && `Status: ${selectedStatus}`,
  ].filter(Boolean) as string[];

  const clearFilter = (type: string) => {
    if (type === 'resp') setSelectedResps(new Set());
    if (type === 'gar') setSelectedGar(null);
    if (type === 'fin') setSelectedFin(null);
    if (type === 'origin') setSelectedOrigin(null);
    if (type === 'model') setSelectedModel(null);
    if (type === 'entity') setSelectedEntity(null);
    if (type === 'qor') setSelectedQor(null);
    if (type === 'bev') setSelectedBev(null);
    if (type === 'park') setSelectedPark(false);
    if (type === 'status') setSelectedStatus(null);
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
        <p className="text-lg font-medium">Sem dados carregados</p>
        <p className="text-sm mt-1">Aceda a <strong>Dados</strong> no menu lateral para importar o ficheiro Excel.</p>
      </div>
    );
  }

  const analysisData = analysisTab === 'entidade' ? entityData : analysisTab === 'origem' ? originData : modelData;
  const analysisSelected = analysisTab === 'entidade' ? selectedEntity : analysisTab === 'origem' ? selectedOrigin : selectedModel;
  const analysisClick = analysisTab === 'entidade' ? handleEntityClick : analysisTab === 'origem' ? handleOriginClick : handleModelClick;
  const analysisColorMap = analysisTab === 'entidade' ? PROFILE_COLORS : undefined;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-3">

        {/* Left column */}
        <div className="w-full lg:w-44 flex-shrink-0 space-y-2">
          <PeriodFilter />
          <button
            onClick={() => setSelectedPark(prev => !prev)}
            className={`w-full flex items-center justify-between gap-2 rounded-lg border p-2.5 transition-all ${selectedPark ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-card hover:bg-accent'}`}
          >
            <div className="flex items-center gap-2">
              <ParkingCircle className={`h-4 w-4 ${selectedPark ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-[11px] font-semibold uppercase">Em Parque</span>
            </div>
            <Badge variant={selectedPark ? 'default' : 'secondary'} className="text-[10px]">{parkCount}</Badge>
          </button>

          {activeFilters.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-medium">Filtros ativos:</span>
              {selectedResps.size > 0 && (
                <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedResps(new Set())}>
                  {Array.from(selectedResps).join(', ')} x
                </Badge>
              )}
              {selectedGar && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('gar')}>{selectedGar} x</Badge>}
              {selectedFin && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('fin')}>{selectedFin} x</Badge>}
              {selectedOrigin && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('origin')}>{selectedOrigin} x</Badge>}
              {selectedModel && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('model')}>{selectedModel} x</Badge>}
              {selectedEntity && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('entity')}>{selectedEntity} x</Badge>}
              {selectedQor !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('qor')}>QoR x</Badge>}
              {selectedBev !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('bev')}>BEV x</Badge>}
              {selectedPark && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('park')}>Parque x</Badge>}
              {selectedStatus && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => clearFilter('status')}>Status: {selectedStatus} x</Badge>}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-2">

          {/* Row 1 */}
          <div className="grid grid-cols-1 xl:grid-cols-8 gap-2">
            <div className="xl:col-span-5 bg-card border border-border rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Status por Responsavel</h3>
                <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{totalStatusSum}</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={statusByResp} barSize={28}
                  onClick={(chartData: any, _: any, event: any) => {
                    const resp = chartData?.activePayload?.[0]?.payload?.resp;
                    if (resp) handleRespClick(resp, event?.ctrlKey || event?.metaKey);
                  }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="resp" tick={{ fontSize: 10, cursor: 'pointer' }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Legend wrapperStyle={{ fontSize: 10, cursor: 'pointer' }} onClick={handleLegendClick}
                    formatter={(value: string) => (
                      <span style={{ opacity: selectedResps.size > 0 && !selectedResps.has(value) ? 0.3 : 1, fontWeight: selectedResps.has(value) ? 'bold' : 'normal' }}>{value}</span>
                    )} />
                  <Bar dataKey="Retail" stackId="a" fill={STATUS_COLORS.Retail} cursor="pointer" opacity={selectedStatus && selectedStatus !== 'Retail' ? 0.2 : 1} />
                  <Bar dataKey="Matricula" stackId="a" fill={STATUS_COLORS.Matricula} cursor="pointer" opacity={selectedStatus && selectedStatus !== 'Matricula' ? 0.2 : 1} />
                  <Bar dataKey="Carteira" stackId="a" fill={STATUS_COLORS.Carteira} cursor="pointer" opacity={selectedStatus && selectedStatus !== 'Carteira' ? 0.2 : 1}>
                    <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="xl:col-span-3">
              <div className="bg-gradient-to-br from-primary/5 to-primary/15 border-2 border-primary/30 rounded-lg p-3 h-full flex flex-col">
                <p className="text-xs font-bold text-primary uppercase mb-1 tracking-wide">Realizacao vs Objetivo</p>
                <div className="flex items-center justify-center flex-1">
                  <GaugeSimple value={realization.pct} retailPct={realization.targetBMW ? Math.round((realization.retails / realization.targetBMW) * 100) : undefined} size="lg" />
                </div>
                <div className="grid grid-cols-6 gap-1 mt-1 text-center items-end">
                  <div><p className="text-lg font-extrabold text-primary">{realization.actual}</p><p className="text-[9px] font-medium text-muted-foreground">Previsao</p></div>
                  <div><p className="text-lg font-extrabold" style={{ color: '#1C69D4' }}>{realization.retails}</p><p className="text-[9px] font-medium text-muted-foreground">Retails</p></div>
                  <div><p className="text-base font-bold text-foreground">{realization.targetCaetano}</p><p className="text-[9px] text-muted-foreground">Caetano</p></div>
                  <div><p className="text-base font-bold text-muted-foreground">{realization.targetBMW}</p><p className="text-[9px] text-muted-foreground">BMW</p></div>
                  <div><p className="text-base font-bold text-muted-foreground/70">{realization.target110}</p><p className="text-[9px] text-muted-foreground">BMW 110%</p></div>
                  <div><p className="text-lg font-extrabold" style={{ color: realization.pct >= 100 ? '#16A34A' : realization.pct >= 80 ? '#F59E0B' : '#DC2626' }}>{realization.pct}%</p><p className="text-[9px] font-medium text-muted-foreground">Previsao %</p></div>
                </div>
              </div>
            </div>
          </div>

          {isMobile && (
            <DetailTableBlock tableData={tableData} tableColumns={tableColumns} searchTerm={searchTerm} setSearchTerm={setSearchTerm} toggleSort={toggleSort} SortIcon={SortIcon} exportCSV={exportCSV} />
          )}

          {/* Row 2 */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
            <div className="xl:col-span-4 bg-card border border-border rounded-lg p-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Analise</h3>
                <select
                  value={analysisTab}
                  onChange={e => setAnalysisTab(e.target.value as AnalysisTab)}
                  className="text-[10px] bg-muted border border-border rounded px-2 py-0.5 cursor-pointer focus:outline-none"
                >
                  <option value="entidade">Entidade</option>
                  <option value="origem">Origem</option>
                  <option value="modelos">Mix Modelos</option>
                </select>
              </div>
              <div className="max-h-44 overflow-y-auto pr-1">
                <HorizontalBarList data={analysisData} colorMap={analysisColorMap} selected={analysisSelected} onClick={analysisClick} />
              </div>
            </div>

            <div className="xl:col-span-4 bg-card border border-border rounded-lg p-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Metodo de Pagamento</h3>
              <div className="flex items-center gap-2">
                <ResponsiveContainer width="50%" height={Math.max(140, finData.length * 32 + 20)}>
                  <PieChart>
                    <Tooltip formatter={(value: number, name) => [`${value} (${Math.round((Number(value) / (filtered.length || 1)) * 100)}%)`, name]} />
                    <Pie data={finData} dataKey="value" nameKey="name" outerRadius={60} stroke="hsl(var(--background))" strokeWidth={1.5}
                      onClick={(entry: any) => entry?.name && handleFinClick(entry.name)} cursor="pointer">
                      {finData.map((entry, i) => {
                        const isDimmed = selectedFin && selectedFin !== entry.name;
                        return <Cell key={entry.name} fill={entry.name === 'N/A' ? '#94A3B8' : (FIN_COLORS[entry.name] || COLORS[i % COLORS.length])} opacity={isDimmed ? 0.35 : 1} />;
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 flex-1">
                  {finData.map((entry, i) => {
                    const isDimmed = selectedFin && selectedFin !== entry.name;
                    return (
                      <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => handleFinClick(entry.name)} style={{ opacity: isDimmed ? 0.3 : 1 }}>
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.name === 'N/A' ? '#94A3B8' : (FIN_COLORS[entry.name] || COLORS[i % COLORS.length]) }} />
                        <span className="text-[10px] font-medium w-9">{entry.name}</span>
                        <span className="text-[10px] font-semibold w-7 text-right">{entry.value}</span>
                        <span className="text-[10px] text-muted-foreground w-10 text-right">({entry.pct}%)</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-border pt-1 mt-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold">Total</span>
                    <span className="text-[10px] font-bold">{filtered.length}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 grid grid-cols-2 xl:grid-cols-1 gap-2">
              <ClickableDonutCard title="QoR" count={qorCount} total={filtered.length} color="#F59E0B" isActive={selectedQor === true} onClick={handleQorClick} />
              <ClickableDonutCard title="BEV" count={bevCount} total={filtered.length} color="#16A34A" isActive={selectedBev === true} onClick={handleBevClick} />
            </div>

            <div className="xl:col-span-2 bg-card border border-border rounded-lg p-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Garantia</h3>
              <div className="flex flex-col gap-1.5 mt-1">
                {garData.map(d => {
                  const isDimmed = selectedGar && selectedGar !== d.name;
                  const color = d.name === 'Certo' ? '#16A34A' : '#94A3B8';
                  const pct = d.total ? Math.round((d.size / d.total) * 100) : 0;
                  return (
                    <div key={d.name} className="flex-1 rounded-md p-2 text-center cursor-pointer transition-opacity"
                      style={{ backgroundColor: color, opacity: isDimmed ? 0.3 : 1 }}
                      onClick={() => handleGarClick(d.name)}>
                      <p className="text-white text-[10px] font-medium">{d.name}</p>
                      <p className="text-white text-lg font-bold">{d.size}</p>
                      <p className="text-white/80 text-[9px]">{pct}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {!isMobile && (
            <DetailTableBlock tableData={tableData} tableColumns={tableColumns} searchTerm={searchTerm} setSearchTerm={setSearchTerm} toggleSort={toggleSort} SortIcon={SortIcon} exportCSV={exportCSV} />
          )}
        </div>
      </div>
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
            <Download className="h-3 w-3" />CSV
          </Button>
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh] relative">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <tr className="text-[10px]">
              {tableColumns.map(([key, label]) => (
                <th key={key} className="h-9 px-3 text-left align-middle font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap bg-card" onClick={() => toggleSort(key)}>
                  <span className="inline-flex items-center">{label}<SortIcon col={key} /></span>
                </th>
              ))}
              <th className="h-9 px-3 text-left align-middle font-medium text-muted-foreground whitespace-nowrap bg-card">AÇÃO</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((r, i) => (
              <tr key={i} onClick={() => r.id && openEditor(r.id)} title="Clicar para editar" className="text-[11px] border-b border-border transition-colors hover:bg-muted/50 cursor-pointer">
                <td className="px-3 py-1 font-medium whitespace-nowrap">{r.resp}</td>
                <td className="px-3 py-1 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[r.status] || '#888' }} />
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-1">{r.type}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.model}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.version}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.week198}</td>
                <td className="px-3 py-1 max-w-[120px] truncate" title={r.cliente}>{r.cliente}</td>
                <td className="px-3 py-1">{r.fin}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.biz}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.enc}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.chas}</td>
                <td className="px-3 py-1 whitespace-nowrap">{r.mat}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.neg)}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.dmat)}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.date298)}</td>
                <td className="px-3 py-1 whitespace-nowrap">{formatDate(r.app)}</td>
                <td className="px-3 py-1 whitespace-nowrap">
                  <PedirMatriculaButton record={{ cliente: r.cliente, enc: r.enc, chas: r.chas, biz: r.biz }} />
                </td>
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

function GaugeSimple({ value, retailPct, size = 'sm' }: { value: number; retailPct?: number; size?: 'sm' | 'lg' }) {
  const maxVal = Math.max(100, value);
  const clamped = Math.min(Math.max(value, 0), maxVal);
  const color = value >= 100 ? '#16A34A' : value >= 80 ? '#F59E0B' : '#DC2626';
  const cx = 60, cy = 60, r = 50;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (pct: number) => { const ang = -180 + (pct / maxVal) * 180; return { x: cx + r * Math.cos(toRad(ang)), y: cy + r * Math.sin(toRad(ang)) }; };
  const describeArc = (s: number, e: number) => {
    const sp = arcPoint(s); const ep = arcPoint(e);
    const sweep = ((e - s) / maxVal) * 180;
    return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`;
  };
  const needleAng = -180 + (clamped / maxVal) * 180;
  const mark100Ang = -180 + (100 / maxVal) * 180;
  const mark100Inner = { x: cx + 43 * Math.cos(toRad(mark100Ang)), y: cy + 43 * Math.sin(toRad(mark100Ang)) };
  const mark100Outer = { x: cx + 57 * Math.cos(toRad(mark100Ang)), y: cy + 57 * Math.sin(toRad(mark100Ang)) };
  const zone80 = Math.min(80, maxVal);
  const zone100 = Math.min(100, maxVal);
  const retailClamped = retailPct != null ? Math.min(Math.max(retailPct, 0), maxVal) : null;
  const retailAng = retailClamped != null ? -180 + (retailClamped / maxVal) * 180 : null;
  const retailInner = retailAng != null ? { x: cx + 42 * Math.cos(toRad(retailAng)), y: cy + 42 * Math.sin(toRad(retailAng)) } : null;
  const retailOuter = retailAng != null ? { x: cx + 58 * Math.cos(toRad(retailAng)), y: cy + 58 * Math.sin(toRad(retailAng)) } : null;
  return (
    <svg viewBox="0 0 120 70" className={size === 'lg' ? 'w-44 h-auto' : 'w-28 h-auto'}>
      <path d={describeArc(0, maxVal)} fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
      <path d={describeArc(0, zone80)} fill="none" stroke="#DC262640" strokeWidth="8" strokeLinecap="round" />
      {zone80 < zone100 && <path d={describeArc(zone80, zone100)} fill="none" stroke="#F59E0B40" strokeWidth="8" strokeLinecap="round" />}
      {maxVal > 100 && <path d={describeArc(zone100, maxVal)} fill="none" stroke="#16A34A40" strokeWidth="8" strokeLinecap="round" />}
      {maxVal > 100 && <line x1={mark100Inner.x} y1={mark100Inner.y} x2={mark100Outer.x} y2={mark100Outer.y} stroke="hsl(var(--foreground))" strokeWidth="1.5" opacity={0.5} />}
      {retailInner && retailOuter && <line x1={retailInner.x} y1={retailInner.y} x2={retailOuter.x} y2={retailOuter.y} stroke="#1C69D4" strokeWidth="2" strokeLinecap="round" />}
      <line x1={cx} y1={cy} x2={cx + 40 * Math.cos(toRad(needleAng))} y2={cy + 40 * Math.sin(toRad(needleAng))} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={color} />
      <text x={cx} y="52" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>{value}%</text>
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
              <Cell fill={color} /><Cell fill="hsl(var(--border))" />
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

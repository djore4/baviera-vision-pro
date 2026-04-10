import { useMemo, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { SalesRadar } from '@/components/SalesRadar';
import { formatDate, getDeliveryMonth } from '@/lib/excel-parser';
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const COLORS = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', Fext: '#F59E0B', Fint: '#8B5CF6' };

const STATUS_COLORS: Record<string, string> = {
  Retail: '#1C69D4',
  Matricula: '#06B6D4',
  Carteira: '#F59E0B',
};

type SortKey = 'resp' | 'gar' | 'status' | 'type' | 'model' | 'cliente' | 'fin' | 'date298' | 'biz' | 'enc' | 'chas' | 'mat' | 'neg' | 'dmat' | 'app';
type SortDir = 'asc' | 'desc';

export default function RetailsPage() {
  const { filteredControl, data, filter } = useData();
  const [selectedResp, setSelectedResp] = useState<string | null>(null);
  const [selectedGar, setSelectedGar] = useState<string | null>(null);
  const [selectedFin, setSelectedFin] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedQor, setSelectedQor] = useState<boolean | null>(null);
  const [selectedBev, setSelectedBev] = useState<boolean | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date298');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchTerm, setSearchTerm] = useState('');

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
    if (selectedEntity) result = result.filter(r => r.profile === selectedEntity);
    return result;
  }, [baseRecords, selectedResp, selectedGar, selectedFin, selectedOrigin, selectedModel, selectedQor, selectedBev, selectedEntity]);

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
    const certo = filtered.filter(r => r.gar === 'GAR').length;
    const incerto = filtered.length - certo;
    return [
      { name: 'Certo', size: certo },
      { name: 'Incerto', size: incerto },
    ].filter(d => d.size > 0);
  }, [filtered]);

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
      if (normalized && selectedMonthKeys.has(normalized)) return true;
      return false;
    });

    const targetCaetano = matchingObj.reduce((s, o) => s + o.orcado, 0);
    const targetBMW = matchingObj.reduce((s, o) => s + o.range2, 0);
    const target110 = matchingObj.reduce((s, o) => s + o.range3, 0);
    const actual = totalStatusSum;
    const pct = targetBMW ? Math.round((actual / targetBMW) * 100) : 0;
    return { actual, targetCaetano, targetBMW, target110, pct };
  }, [data, totalStatusSum, selectedMonthKeys]);

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
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const modelData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.model) map[r.model] = (map[r.model] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const qorCount = useMemo(() => filtered.filter(r => r.qor === 1).length, [filtered]);
  const bevCount = useMemo(() => filtered.filter(r => r.bev === 1).length, [filtered]);

  const entityData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { if (r.profile) map[r.profile] = (map[r.profile] || 0) + 1; });
    const total = filtered.length || 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const tableData = useMemo(() => {
    let rows = [...filtered];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.resp.toLowerCase().includes(term) ||
        r.status.toLowerCase().includes(term) ||
        r.type.toLowerCase().includes(term) ||
        r.model.toLowerCase().includes(term) ||
        r.cliente.toLowerCase().includes(term) ||
        r.fin.toLowerCase().includes(term) ||
        r.gar.toLowerCase().includes(term) ||
        r.biz.toLowerCase().includes(term) ||
        r.enc.toLowerCase().includes(term) ||
        r.chas.toLowerCase().includes(term) ||
        r.mat.toLowerCase().includes(term)
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

  const handleRespClick = useCallback((respName: string) => { toggle(setSelectedResp, respName, null as string | null); }, []);
  const handleGarClick = useCallback((garName: string) => { toggle(setSelectedGar, garName, null as string | null); }, []);
  const handleFinClick = useCallback((finName: string) => { toggle(setSelectedFin, finName, null as string | null); }, []);
  const handleOriginClick = useCallback((name: string) => { toggle(setSelectedOrigin, name, null as string | null); }, []);
  const handleModelClick = useCallback((name: string) => { toggle(setSelectedModel, name, null as string | null); }, []);
  const handleEntityClick = useCallback((name: string) => { toggle(setSelectedEntity, name, null as string | null); }, []);
  const handleQorClick = useCallback(() => { setSelectedQor(prev => prev === true ? null : true); }, []);
  const handleBevClick = useCallback(() => { setSelectedBev(prev => prev === true ? null : true); }, []);

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
    selectedEntity && `Entidade: ${selectedEntity}`,
    selectedQor !== null && `QoR: Sim`,
    selectedBev !== null && `BEV: Sim`,
  ].filter(Boolean);

  const clearFilter = (type: string) => {
    if (type === 'resp') setSelectedResp(null);
    if (type === 'gar') setSelectedGar(null);
    if (type === 'fin') setSelectedFin(null);
    if (type === 'origin') setSelectedOrigin(null);
    if (type === 'model') setSelectedModel(null);
    if (type === 'entity') setSelectedEntity(null);
    if (type === 'qor') setSelectedQor(null);
    if (type === 'bev') setSelectedBev(null);
  };

  // Shared horizontal bar list component for Entidade, Origem, Mix Modelos
  const HorizontalBarList = ({ data: items, colorMap, fallbackColors, selected, onClick }: {
    data: { name: string; value: number; pct: number }[];
    colorMap?: Record<string, string>;
    fallbackColors?: string[];
    selected: string | null;
    onClick: (name: string) => void;
  }) => {
    const maxVal = items[0]?.value || 1;
    const colors = fallbackColors || COLORS;
    return (
      <div className="space-y-1">
        {items.map((entry, i) => {
          const isSelected = selected === entry.name;
          const isDimmed = selected && !isSelected;
          const color = colorMap?.[entry.name] || colors[i % colors.length];
          return (
            <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => onClick(entry.name)}
              style={{ opacity: isDimmed ? 0.3 : 1 }}>
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[10px] flex-1 truncate min-w-0">{entry.name}</span>
              <div className="w-14 h-3 bg-muted rounded-sm overflow-hidden flex-shrink-0">
                <div className="h-full rounded-sm" style={{ width: `${(entry.value / maxVal) * 100}%`, backgroundColor: color }} />
              </div>
              <span className="text-[10px] font-semibold w-6 text-right flex-shrink-0">{entry.value}</span>
              <span className="text-[10px] text-muted-foreground w-10 text-right flex-shrink-0">({entry.pct}%)</span>
            </div>
          );
        })}
      </div>
    );
  };

  const PROFILE_COLORS: Record<string, string> = { PE: '#1C69D4', RAC: '#16A34A', BUS: '#F59E0B', FLE: '#EC4899', ENI: '#8B5CF6', PART: '#06B6D4', CA: '#F97316' };

  const tableColumns: [SortKey, string][] = [
    ['resp', 'RESP'],
    ['gar', 'GAR'],
    ['status', 'STATUS'],
    ['type', 'TIPO'],
    ['model', 'MODELO'],
    ['cliente', 'CLIENTE'],
    ['fin', 'FIN'],
    ['biz', 'Bizagi'],
    ['enc', 'Encomenda'],
    ['chas', 'Chassis'],
    ['mat', 'Matricula'],
    ['neg', 'Data de Negócio Fechado'],
    ['dmat', 'Data de Matricula'],
    ['date298', 'Data de Retail'],
    ['app', 'Data de Apping'],
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-3 animate-fade-in">
      {/* Left column: Period filter + Detail table (desktop) */}
      <div className="w-full lg:w-44 flex-shrink-0 space-y-3">
        <PeriodFilter />

        {/* Detail table below filters on desktop only */}
        <div className="hidden lg:block bg-card border border-border rounded-lg">
          <div className="px-2 py-1.5 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Detalhe ({tableData.length})</h3>
            <div className="relative w-full">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 pl-7 text-[11px]" />
            </div>
          </div>
          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  {tableColumns.map(([key, label]) => (
                    <TableHead key={key} className="py-1.5 cursor-pointer select-none hover:text-foreground whitespace-nowrap" onClick={() => toggleSort(key)}>
                      <span className="inline-flex items-center">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((r, i) => (
                  <TableRow key={i} className="text-[11px]">
                    <TableCell className="py-1 font-medium whitespace-nowrap">{r.resp}</TableCell>
                    <TableCell className="py-1">
                      <Badge variant="outline" className={r.gar === 'GAR' ? 'border-bmw-green text-bmw-green text-[10px]' : 'text-muted-foreground text-[10px]'}>
                        {r.gar === 'GAR' ? 'Certo' : 'Incerto'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[r.status] || '#888' }} />
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">{r.type}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.model}</TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">{r.cliente}</TableCell>
                    <TableCell className="py-1">{r.fin}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.biz}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.enc}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.chas}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.mat}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.neg)}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.dmat)}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.date298)}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.app)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">Filtros:</span>
            {selectedResp && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('resp')}>{selectedResp} ✕</Badge>}
            {selectedGar && <Badge variant="secondary" className="text-[10px] cursor-pointer" onClick={() => clearFilter('gar')}>{selectedGar} ✕</Badge>}
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
          {/* Status por Responsável */}
          <div className="xl:col-span-5 bg-card border border-border rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Status por Responsável</h3>
              <span className="text-sm font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{totalStatusSum}</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusByResp} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="resp" tick={{ fontSize: 10, cursor: 'pointer' }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Retail" stackId="a" fill={STATUS_COLORS.Retail} cursor="pointer" onClick={(entry: any) => entry?.resp && handleRespClick(entry.resp)} />
                <Bar dataKey="Matricula" stackId="a" fill={STATUS_COLORS.Matricula} cursor="pointer" onClick={(entry: any) => entry?.resp && handleRespClick(entry.resp)} />
                <Bar dataKey="Carteira" stackId="a" fill={STATUS_COLORS.Carteira} cursor="pointer" onClick={(entry: any) => entry?.resp && handleRespClick(entry.resp)}>
                  <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Garantia (compact) + Realização */}
          <div className="xl:col-span-3 space-y-2">
            <div className="bg-card border border-border rounded-lg p-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Garantia de Entrega</h3>
              <div className="flex gap-2">
                {garData.map(d => {
                  const isSelected = selectedGar === d.name;
                  const isDimmed = selectedGar && !isSelected;
                  const color = d.name === 'Certo' ? '#16A34A' : '#94A3B8';
                  const pct = filtered.length ? Math.round((d.size / filtered.length) * 100) : 0;
                  return (
                    <div key={d.name} className="flex-1 rounded-md p-2 text-center cursor-pointer transition-opacity"
                      style={{ backgroundColor: color, opacity: isDimmed ? 0.3 : 1 }}
                      onClick={() => handleGarClick(d.name)}>
                      <p className="text-white text-[10px] font-medium">{d.name}</p>
                      <p className="text-white text-base font-bold">{d.size}</p>
                      <p className="text-white/80 text-[9px]">{pct}%</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Realização vs Objetivo</p>
              <div className="flex items-end justify-center">
                <GaugeSimple value={realization.pct} />
              </div>
              <div className="grid grid-cols-5 gap-1 mt-2 text-center">
                <div>
                  <p className="text-base font-bold text-primary">{realization.actual}</p>
                  <p className="text-[9px] text-muted-foreground">Realizado</p>
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">{realization.targetCaetano}</p>
                  <p className="text-[9px] text-muted-foreground">Caetano</p>
                </div>
                <div>
                  <p className="text-base font-bold text-muted-foreground">{realization.targetBMW}</p>
                  <p className="text-[9px] text-muted-foreground">BMW</p>
                </div>
                <div>
                  <p className="text-base font-bold text-muted-foreground/70">{realization.target110}</p>
                  <p className="text-[9px] text-muted-foreground">110%</p>
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: realization.pct >= 100 ? '#16A34A' : realization.pct >= 80 ? '#F59E0B' : '#DC2626' }}>{realization.pct}%</p>
                  <p className="text-[9px] text-muted-foreground">vs BMW</p>
                </div>
              </div>
            </div>
          </div>

          {/* Método de Pagamento */}
          <div className="xl:col-span-4 bg-card border border-border rounded-lg p-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Método de Pagamento</h3>
            <div className="grid grid-cols-2 gap-1 items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Tooltip formatter={(value: number, name) => [`${value} (${Math.round((Number(value) / (filtered.length || 1)) * 100)}%)`, name]} />
                  <Pie data={finData} dataKey="value" nameKey="name" outerRadius={65} stroke="hsl(var(--background))" strokeWidth={1.5}
                    onClick={(entry: any) => entry?.name && handleFinClick(entry.name)} cursor="pointer">
                    {finData.map((entry, i) => {
                      const isSelected = selectedFin === entry.name;
                      const isDimmed = selectedFin && !isSelected;
                      return <Cell key={entry.name} fill={FIN_COLORS[entry.name] || COLORS[i % COLORS.length]} opacity={isDimmed ? 0.35 : 1} />;
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {finData.map((entry, i) => {
                  const isSelected = selectedFin === entry.name;
                  const isDimmed = selectedFin && !isSelected;
                  return (
                    <div key={entry.name} className="flex items-center gap-2 cursor-pointer" onClick={() => handleFinClick(entry.name)}
                      style={{ opacity: isDimmed ? 0.3 : 1 }}>
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: FIN_COLORS[entry.name] || COLORS[i % COLORS.length] }} />
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
          {/* Entidade */}
          <div className="xl:col-span-2 bg-card border border-border rounded-lg p-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Entidade</h3>
            <HorizontalBarList data={entityData} colorMap={PROFILE_COLORS} selected={selectedEntity} onClick={handleEntityClick} />
          </div>

          {/* Origem */}
          <div className="xl:col-span-3 bg-card border border-border rounded-lg p-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Origem dos Negócios</h3>
            <HorizontalBarList data={originData} selected={selectedOrigin} onClick={handleOriginClick} />
          </div>

          {/* Mix Modelos */}
          <div className="xl:col-span-3 bg-card border border-border rounded-lg p-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Mix Modelos</h3>
            <div className="max-h-40 overflow-y-auto pr-1">
              <HorizontalBarList data={modelData} selected={selectedModel} onClick={handleModelClick} />
            </div>
          </div>

          {/* QoR + BEV */}
          <div className="xl:col-span-2 space-y-2">
            <ClickableDonutCard title="QoR" count={qorCount} total={filtered.length} color="#F59E0B"
              isActive={selectedQor === true} onClick={handleQorClick} />
            <ClickableDonutCard title="BEV" count={bevCount} total={filtered.length} color="#16A34A"
              isActive={selectedBev === true} onClick={handleBevClick} />
          </div>

          {/* Sales Radar */}
          <div className="xl:col-span-2 bg-card border border-border rounded-lg p-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Sales Radar</h3>
            <SalesRadar records={filtered} height="200px" />
          </div>
        </div>

        {/* Detail Table - mobile only */}
        <div className="lg:hidden bg-card border border-border rounded-lg">
          <div className="px-2 py-1.5 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Detalhe ({tableData.length})</h3>
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 pl-7 text-[11px]" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px]">
                  {tableColumns.map(([key, label]) => (
                    <TableHead key={key} className="py-1.5 cursor-pointer select-none hover:text-foreground whitespace-nowrap" onClick={() => toggleSort(key)}>
                      <span className="inline-flex items-center">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((r, i) => (
                  <TableRow key={i} className="text-[11px]">
                    <TableCell className="py-1 font-medium whitespace-nowrap">{r.resp}</TableCell>
                    <TableCell className="py-1">
                      <Badge variant="outline" className={r.gar === 'GAR' ? 'border-bmw-green text-bmw-green text-[10px]' : 'text-muted-foreground text-[10px]'}>
                        {r.gar === 'GAR' ? 'Certo' : 'Incerto'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-1 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[r.status] || '#888' }} />
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-1">{r.type}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.model}</TableCell>
                    <TableCell className="py-1 max-w-[120px] truncate">{r.cliente}</TableCell>
                    <TableCell className="py-1">{r.fin}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.biz}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.enc}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.chas}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{r.mat}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.neg)}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.dmat)}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.date298)}</TableCell>
                    <TableCell className="py-1 whitespace-nowrap">{formatDate(r.app)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeMonthKey(mes: string): string | null {
  if (!mes) return null;
  if (/^\d{4}\/\d{2}$/.test(mes)) return mes;
  const d = new Date(mes);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const ptMonths: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };
  const match = mes.match(/^(\w{3})\W*(\d{4})$/i);
  if (match) {
    const m = ptMonths[match[1].toLowerCase()];
    if (m) return `${match[2]}/${String(m).padStart(2, '0')}`;
  }
  const match2 = mes.match(/^(\d{1,2})\/(\d{4})$/);
  if (match2) return `${match2[2]}/${String(Number(match2[1])).padStart(2, '0')}`;
  return null;
}

function GaugeSimple({ value }: { value: number }) {
  const maxVal = Math.max(100, value);
  const clamped = Math.min(Math.max(value, 0), maxVal);
  const angle = -90 + (clamped / maxVal) * 180;
  const color = value >= 100 ? '#16A34A' : value >= 80 ? '#F59E0B' : '#DC2626';

  // Calculate arc endpoint for 100% mark
  const markAngle100 = -90 + (100 / maxVal) * 180;
  const markX = 60 + 45 * Math.cos((markAngle100 * Math.PI) / 180);
  const markY = 60 + 45 * Math.sin((markAngle100 * Math.PI) / 180);

  return (
    <svg viewBox="0 0 120 70" className="w-24 h-auto">
      <path d="M 10 60 A 50 50 0 0 1 110 60" fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
      {/* Color zones */}
      <path d="M 10 60 A 50 50 0 0 1 36.7 18.4" fill="none" stroke="#DC262640" strokeWidth="8" strokeLinecap="round" />
      <path d="M 36.7 18.4 A 50 50 0 0 1 60 10" fill="none" stroke="#F59E0B40" strokeWidth="8" strokeLinecap="round" />
      <path d="M 60 10 A 50 50 0 0 1 110 60" fill="none" stroke="#16A34A40" strokeWidth="8" strokeLinecap="round" />
      {/* 100% mark */}
      {maxVal > 100 && (
        <line x1={markX} y1={markY} x2={60 + 55 * Math.cos((markAngle100 * Math.PI) / 180)} y2={60 + 55 * Math.sin((markAngle100 * Math.PI) / 180)}
          stroke="hsl(var(--foreground))" strokeWidth="1.5" opacity={0.5} />
      )}
      {/* Needle */}
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
  const pieData = [
    { name: title, value: count },
    { name: 'Outros', value: nonCount },
  ];

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

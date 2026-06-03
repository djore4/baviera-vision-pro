import { useData } from '@/contexts/DataContext';
import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

const COLS = [
  { key: 'status', label: 'Estado' },
  { key: 'neg', label: 'Neg.', fmt: (v: unknown) => v instanceof Date ? v.toLocaleDateString('pt-PT') : (v ?? '—') },
  { key: 'mes1', label: 'Mês' },
  { key: 'resp', label: 'Resp.' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'local', label: 'Local' },
  { key: 'type', label: 'Tipo' },
  { key: 'origin', label: 'Origem' },
  { key: 'profile', label: 'Perfil' },
  { key: 'biz', label: 'Biz' },
  { key: 'model', label: 'Modelo' },
  { key: 'version', label: 'Versão' },
  { key: 'fin', label: 'Fin.' },
  { key: 'chas', label: 'Chassis' },
  { key: 'mat', label: 'Mat.' },
  { key: 'dmat', label: 'D.Mat', fmt: (v: unknown) => v instanceof Date ? v.toLocaleDateString('pt-PT') : (v ?? '—') },
  { key: 'date298', label: '298', fmt: (v: unknown) => v instanceof Date ? v.toLocaleDateString('pt-PT') : (v ?? '—') },
  { key: 'app', label: 'App.', fmt: (v: unknown) => v instanceof Date ? v.toLocaleDateString('pt-PT') : (v ?? '—') },
  { key: 'qor', label: 'QOR' },
  { key: 'xev', label: 'XEV' },
  { key: 'bev', label: 'BEV' },
  { key: 'obs', label: 'Obs.' },
] as const;

export default function DatabaseTab() {
  const { data, loading } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const records = useMemo(() => {
    if (!data) return [];
    return data.control.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.cliente?.toLowerCase().includes(q) ||
          r.resp?.toLowerCase().includes(q) ||
          r.model?.toLowerCase().includes(q) ||
          r.chas?.toLowerCase().includes(q) ||
          r.mat?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, search, statusFilter]);

  const statuses = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.control.map(r => r.status).filter(Boolean))].sort();
  }, [data]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">A carregar dados...</div>;
  if (!data) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <p className="text-muted-foreground text-sm">Nenhum ficheiro Excel carregado.</p>
      <p className="text-xs text-muted-foreground">Vai a <strong>DADOS</strong> para fazer upload do ficheiro.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Pesquisar cliente, responsável, modelo, chassis..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os estados</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground self-center">{records.length} registos</span>
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              {COLS.map(c => (
                <th key={c.key} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                {COLS.map(c => {
                  const raw = r[c.key as keyof typeof r];
                  const fmt = (c as { fmt?: (v: unknown) => unknown }).fmt;
                  const val = fmt ? fmt(raw) : (raw ?? '—');
                  return (
                    <td key={c.key} className="px-2 py-1.5 whitespace-nowrap text-foreground/80">
                      {c.key === 'status' ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          String(val) === 'V' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                          String(val) === 'C' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                          'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        }`}>{String(val)}</span>
                      ) : String(val === null || val === undefined ? '—' : val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground">Nenhum registo encontrado.</div>
        )}
      </div>
    </div>
  );
}

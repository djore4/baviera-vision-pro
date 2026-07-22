import { useMemo, useState, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';

const STATUS_CONFIG = {
  Frio: { color: '#1C69D4', bg: 'bg-blue-700', light: 'bg-blue-50', border: 'border-blue-700', text: 'text-blue-700', header: 'bg-blue-700' },
  Morno: { color: '#D4A017', bg: 'bg-yellow-600', light: 'bg-yellow-50', border: 'border-yellow-600', text: 'text-yellow-700', header: 'bg-yellow-600' },
  Quente: { color: '#DC2626', bg: 'bg-red-600', light: 'bg-red-50', border: 'border-red-600', text: 'text-red-700', header: 'bg-red-600' },
} as const;

type FunilStatus = keyof typeof STATUS_CONFIG;

export default function FunilPage() {
  const { data } = useData();
  const [selectedResp, setSelectedResp] = useState<string | null>(null);

 const records = useMemo(() =>
  (data?.control ?? []).filter(r => ['Frio', 'Morno', 'Quente'].includes(r.status)),
  [data]
);

  const responsaveis = useMemo(() => {
    const set = new Set(records.map(r => r.resp));
    return Array.from(set).sort();
  }, [records]);

  const filtered = useMemo(() =>
    selectedResp ? records.filter(r => r.resp === selectedResp) : records,
    [records, selectedResp]
  );

  const byStatus = useMemo(() => {
    const map: Record<string, typeof records> = { Frio: [], Morno: [], Quente: [] };
    filtered.forEach(r => {
      if (map[r.status]) map[r.status].push(r);
    });
    return map;
  }, [filtered]);

  const total = filtered.length || 1;
  const counts = {
    Frio: byStatus.Frio.length,
    Morno: byStatus.Morno.length,
    Quente: byStatus.Quente.length,
  };

  const handleResp = useCallback((resp: string) => {
    setSelectedResp(prev => prev === resp ? null : resp);
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Filtro RESP */}
      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Responsável</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedResp(null)}
            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
              !selectedResp ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            Todos
          </button>
          {responsaveis.map(r => (
            <button
              key={r}
              onClick={() => handleResp(r)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                selectedResp === r ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Tabelas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {(['Frio', 'Morno', 'Quente'] as FunilStatus[]).map(status => {
          const cfg = STATUS_CONFIG[status];
          const rows = byStatus[status];
          return (
            <div key={status} className={`bg-card border ${cfg.border} rounded-lg overflow-hidden`}>
              <div className={`${cfg.header} px-3 py-2 flex items-center justify-between`}>
                <span className="text-white font-bold text-sm uppercase tracking-wide">{status}</span>
                <span className="text-white/80 text-xs font-semibold">{rows.length} negócios</span>
              </div>
              <div className="overflow-auto max-h-[45vh]">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground w-10">RESP</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">VERSÃO</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">CLIENTE</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">OBS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                          Sem registos
                        </td>
                      </tr>
                    ) : (
                      rows.map((r, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-2 py-1.5 font-semibold">{r.resp}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.version}</td>
                          <td className="px-2 py-1.5 max-w-[120px] truncate">{r.cliente}</td>
                          <td className="px-2 py-1.5 max-w-[140px] truncate text-muted-foreground">{r.obs}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Funil visual */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="grid grid-cols-3 gap-0 items-end">
          {(['Frio', 'Morno', 'Quente'] as FunilStatus[]).map((status, idx) => {
            const cfg = STATUS_CONFIG[status];
            const count = counts[status];
            const pct = Math.round((count / total) * 100);
            const barHeight = Math.max(20, Math.round((count / Math.max(...Object.values(counts), 1)) * 80));
            return (
              <div key={status} className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{status}</span>
                <span className="text-lg font-bold" style={{ color: cfg.color }}>{count}</span>
                <div className="w-full relative flex items-end justify-center" style={{ height: '80px' }}>
                  {/* Trapézio usando clip-path */}
                  <div
                    className="w-full transition-all duration-500"
                    style={{
                      height: `${barHeight}px`,
                      backgroundColor: cfg.color,
                      opacity: 0.85,
                      clipPath: idx === 0
                        ? 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
                        : idx === 1
                        ? 'polygon(0% 0%, 100% 0%, 95% 100%, 5% 100%)'
                        : 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)',
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{pct}% do total</span>
              </div>
            );
          })}
        </div>
        {/* Setas entre blocos */}
        <div className="grid grid-cols-3 mt-1">
          <div />
          <div className="flex justify-between px-2">
            <span className="text-muted-foreground text-lg">→</span>
            <span className="text-muted-foreground text-lg">→</span>
          </div>
          <div />
        </div>
      </div>
    </div>
  );
}

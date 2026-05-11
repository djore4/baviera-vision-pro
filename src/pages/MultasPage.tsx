import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { Plus, RotateCcw, Trophy, TrendingUp, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/excel-parser';

interface Infraction {
  id: string;
  name: string;
  value: number;
  active: boolean;
}

interface Penalty {
  id: string;
  resp: string;
  infraction_id: string;
  infraction_name: string;
  value: number;
  registered_by: string;
  cycle_id: number;
  created_at: string;
}

interface Cycle {
  id: number;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

export default function MultasPage() {
  const { data } = useData();
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [currentCycle, setCurrentCycle] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedResp, setSelectedResp] = useState('');
  const [selectedInfraction, setSelectedInfraction] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  const resps = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.control.map(r => r.resp).filter(Boolean))).sort();
  }, [data]);

  const currentUser = useMemo(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email || 'desconhecido';
  }, []);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [infRes, penRes, cycRes] = await Promise.all([
      supabase.from('infractions').select('*').eq('active', true).order('name'),
      supabase.from('penalties').select('*').order('created_at', { ascending: false }),
      supabase.from('penalty_cycles').select('*').order('id', { ascending: false }).limit(1),
    ]);
    if (infRes.data) setInfractions(infRes.data);
    if (penRes.data) setPenalties(penRes.data);
    if (cycRes.data?.[0]) setCurrentCycle(cycRes.data[0].id);
    setLoading(false);
  }

  async function submitPenalty() {
    if (!selectedResp || !selectedInfraction) return;
    setSubmitting(true);
    const inf = infractions.find(i => i.id === selectedInfraction);
    if (!inf) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('penalties').insert({
      resp: selectedResp,
      infraction_id: inf.id,
      infraction_name: inf.name,
      value: inf.value,
      registered_by: user?.email || 'desconhecido',
      cycle_id: currentCycle,
    });
    setSelectedResp('');
    setSelectedInfraction('');
    setShowForm(false);
    setSubmitting(false);
    await loadData();
  }

  async function doReset() {
    const newCycleId = currentCycle + 1;
    await supabase.from('penalty_cycles').update({ ended_at: new Date().toISOString() }).eq('id', currentCycle);
    await supabase.from('penalty_cycles').insert({ id: newCycleId });
    setCurrentCycle(newCycleId);
    setConfirmReset(false);
    await loadData();
  }

  async function deletePenalty(id: string) {
    await supabase.from('penalties').delete().eq('id', id);
    await loadData();
  }

  const currentPenalties = penalties.filter(p => p.cycle_id === currentCycle);
  const allTimePenalties = penalties;

  const currentByResp = useMemo(() => {
    const map: Record<string, number> = {};
    currentPenalties.forEach(p => { map[p.resp] = (map[p.resp] || 0) + p.value; });
    return Object.entries(map).map(([resp, total]) => ({ resp, total })).sort((a, b) => b.total - a.total);
  }, [currentPenalties]);

  const allTimeByResp = useMemo(() => {
    const map: Record<string, number> = {};
    allTimePenalties.forEach(p => { map[p.resp] = (map[p.resp] || 0) + p.value; });
    return Object.entries(map).map(([resp, total]) => ({ resp, total })).sort((a, b) => b.total - a.total);
  }, [allTimePenalties]);

  const currentTotal = currentByResp.reduce((s, r) => s + r.total, 0);
  const allTimeTotal = allTimeByResp.reduce((s, r) => s + r.total, 0);

  const maxCurrent = currentByResp[0]?.total || 1;
  const maxAllTime = allTimeByResp[0]?.total || 1;

  if (loading) return <div className="flex items-center justify-center h-96 text-muted-foreground">A carregar...</div>;

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Multas de Equipa</h1>
          <p className="text-xs text-muted-foreground">Ciclo atual: #{currentCycle}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)} className="gap-1 text-[11px]">
            <RotateCcw className="h-3 w-3" /> Reset Ciclo
          </Button>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1 text-[11px]">
            <Plus className="h-3 w-3" /> Registar Multa
          </Button>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">Nova Multa</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Responsável</label>
              <select value={selectedResp} onChange={e => setSelectedResp(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Selecionar...</option>
                {resps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Infração</label>
              <select value={selectedInfraction} onChange={e => setSelectedInfraction(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Selecionar...</option>
                {infractions.map(i => <option key={i.id} value={i.id}>{i.name} — €{i.value.toFixed(2)}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-[11px]">Cancelar</Button>
            <Button size="sm" onClick={submitPenalty} disabled={!selectedResp || !selectedInfraction || submitting} className="text-[11px]">
              {submitting ? 'A registar...' : 'Confirmar Multa'}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Reset */}
      {confirmReset && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm">Confirmas o reset do ciclo atual? O histórico é mantido.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConfirmReset(false)} className="text-[11px]">Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={doReset} className="text-[11px]">Confirmar Reset</Button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Ciclo Atual */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Ciclo Atual #{currentCycle}</h2>
            </div>
            <span className="text-lg font-bold text-primary">€{currentTotal.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            {currentByResp.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem multas no ciclo atual</p>
            ) : currentByResp.map((r, i) => (
              <div key={r.resp} className="flex items-center gap-2">
                <span className="text-[11px] font-medium w-10 flex-shrink-0">{r.resp}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary rounded transition-all" style={{ width: `${(r.total / maxCurrent) * 100}%` }} />
                </div>
                <span className="text-[11px] font-bold w-12 text-right">€{r.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Acumulado Total */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Acumulado Total</h2>
            </div>
            <span className="text-lg font-bold text-amber-500">€{allTimeTotal.toFixed(2)}</span>
          </div>
          <div className="space-y-2">
            {allTimeByResp.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem registos</p>
            ) : allTimeByResp.map((r) => (
              <div key={r.resp} className="flex items-center gap-2">
                <span className="text-[11px] font-medium w-10 flex-shrink-0">{r.resp}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-amber-500 rounded transition-all" style={{ width: `${(r.total / maxAllTime) * 100}%` }} />
                </div>
                <span className="text-[11px] font-bold w-12 text-right">€{r.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Histórico */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase">Histórico ({penalties.length})</h2>
        </div>
        <div className="overflow-auto max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-[10px]">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Resp</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Infração</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Valor</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ciclo</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Registado por</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {penalties.map(p => (
                <tr key={p.id} className="text-[11px] border-b border-border hover:bg-muted/50">
                  <td className="px-3 py-1 whitespace-nowrap">{formatDate(new Date(p.created_at))}</td>
                  <td className="px-3 py-1 font-medium">{p.resp}</td>
                  <td className="px-3 py-1">{p.infraction_name}</td>
                  <td className="px-3 py-1 font-semibold text-destructive">€{Number(p.value).toFixed(2)}</td>
                  <td className="px-3 py-1"><Badge variant="outline" className="text-[9px]">#{p.cycle_id}</Badge></td>
                  <td className="px-3 py-1 text-muted-foreground">{p.registered_by}</td>
                  <td className="px-3 py-1">
                    <button onClick={() => deletePenalty(p.id)} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

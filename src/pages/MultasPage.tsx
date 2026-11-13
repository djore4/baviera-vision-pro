import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { Plus, RotateCcw, Trophy, TrendingUp, AlertCircle, Settings2, Pencil, Trash2, Check, X } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate, isRetailType } from '@/lib/excel-parser';

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

const EXTRA_RESPS = ['JD', 'JG'];
const EXCLUDED_RESPS = ['TG', 'RD', 'AL', 'MP'];

export default function MultasPage() {
  const { data } = useData();
  const { isAdmin, canEdit } = usePermissions();
  const canLaunch = canEdit('multas');
  // Responsáveis = quem tem negócios em Carteira (mesmo critério do tab Carteira),
  // mais os que têm de constar sempre (EXTRA_RESPS) e sem os que não levam multas (EXCLUDED_RESPS).
  const resps = useMemo(() => Array.from(new Set([
    ...(data?.control ?? [])
      .filter(r => (r.status === 'Carteira' || r.status === 'Matricula') && isRetailType(r.type))
      .map(r => r.resp).filter(Boolean),
    ...EXTRA_RESPS,
  ])).filter(r => !EXCLUDED_RESPS.includes(r)).sort(), [data]);
  const [infractions, setInfractions] = useState<Infraction[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [currentCycle, setCurrentCycle] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedResp, setSelectedResp] = useState('');
  const [selectedInfraction, setSelectedInfraction] = useState('');
  const [registeredBy, setRegisteredBy] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastPenalty, setLastPenalty] = useState<{ resp: string; infraction: string; value: number } | null>(null);
  const [filterResp, setFilterResp] = useState<string | null>(null);
  // Gestão do catálogo de infrações (admin)
  const [showManage, setShowManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deletingPenaltyId, setDeletingPenaltyId] = useState<string | null>(null);


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
    if (!inf) { setSubmitting(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('penalties').insert({
      resp: selectedResp,
      infraction_id: inf.id,
      infraction_name: inf.name,
      value: inf.value,
      registered_by: registeredBy,
      cycle_id: currentCycle,
    });
    setSelectedResp('');
    setSelectedInfraction('');
    setShowForm(false);
    setRegisteredBy('');
    setSubmitting(false);
    setLastPenalty({ resp: selectedResp, infraction: inf.name, value: inf.value });
    await loadData();
  }

  const parseValue = (v: string) => Number(v.replace(',', '.').trim());
  const validValue = (v: string) => v.trim() !== '' && Number.isFinite(parseValue(v)) && parseValue(v) >= 0;

  async function addInfraction() {
    const name = newName.trim();
    if (!name || !validValue(newValue)) return;
    const { error } = await supabase.from('infractions').insert({ name, value: parseValue(newValue), active: true });
    if (error) { toast.error('Não foi possível adicionar a multa'); return; }
    setNewName(''); setNewValue('');
    toast.success('Multa adicionada');
    await loadData();
  }

  async function saveInfraction(id: string) {
    const name = editName.trim();
    if (!name || !validValue(editValue)) return;
    const { error } = await supabase.from('infractions').update({ name, value: parseValue(editValue) }).eq('id', id);
    if (error) { toast.error('Não foi possível guardar a alteração'); return; }
    setEditingId(null);
    toast.success('Multa atualizada');
    await loadData();
  }

  // "Remover" desativa a multa (o histórico de penalizações mantém a referência).
  async function removeInfraction(id: string) {
    const { error } = await supabase.from('infractions').update({ active: false }).eq('id', id);
    if (error) { toast.error('Não foi possível remover a multa'); return; }
    setRemovingId(null);
    toast.success('Multa removida');
    await loadData();
  }

  async function deletePenalty(id: string) {
    const { data: removed, error } = await supabase.from('penalties').delete().eq('id', id).select('id');
    if (error || !removed?.length) { toast.error('Não foi possível remover a multa lançada'); return; }
    setDeletingPenaltyId(null);
    toast.success('Multa lançada removida');
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

  const historyRows = filterResp ? penalties.filter(p => p.resp === filterResp) : penalties;

  const deleteControl = (p: Penalty, big: boolean) => deletingPenaltyId === p.id ? (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="destructive" className={big ? 'h-9 px-3 text-xs' : 'h-6 px-2 text-[10px]'} onClick={() => deletePenalty(p.id)}>Remover</Button>
      <Button size="sm" variant="outline" className={big ? 'h-9 px-3 text-xs' : 'h-6 px-2 text-[10px]'} onClick={() => setDeletingPenaltyId(null)}>Não</Button>
    </span>
  ) : (
    <button onClick={() => setDeletingPenaltyId(p.id)} aria-label={`Remover multa de ${p.resp}`}
      className={`text-muted-foreground hover:text-destructive ${big ? 'p-2 -m-2' : ''}`}><Trash2 className={big ? 'h-4 w-4' : 'h-3 w-3'} /></button>
  );

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold">Multas de Equipa</h1>
          <p className="text-xs text-muted-foreground">Ciclo atual: #{currentCycle}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowManage(v => !v)} className="h-10 gap-1 text-xs sm:h-8 sm:text-[11px]">
              <Settings2 className="h-3 w-3" /> Gerir Multas
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)} className="h-10 gap-1 text-xs sm:h-8 sm:text-[11px]">
              <RotateCcw className="h-3 w-3" /> Reset Ciclo
            </Button>
          )}
          {canLaunch && (
            <Button size="sm" onClick={() => setShowForm(!showForm)} className="order-first col-span-2 h-11 gap-1 text-sm sm:order-none sm:col-span-1 sm:h-8 sm:text-[11px]">
              <Plus className="h-3 w-3" /> Registar Multa
            </Button>
          )}
        </div>
      </div>

      {/* Gestão de multas (admin) */}
      {isAdmin && showManage && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">Gerir Multas</h2>
          <p className="text-[11px] text-muted-foreground">
            Alterar um preço só vale para multas registadas daqui em diante; o histórico mantém o valor com que foi registado.
          </p>
          <div className="space-y-1">
            {infractions.length === 0 && <p className="text-xs text-muted-foreground py-2">Sem multas definidas.</p>}
            {infractions.map(i => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm">
                {editingId === i.id ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="basis-full sm:basis-0 sm:flex-1 min-w-0 px-2 py-2 sm:py-1 text-base sm:text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary" />
                    <span className="text-xs text-muted-foreground">€</span>
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} inputMode="decimal"
                      className="w-24 px-2 py-2 sm:py-1 text-base sm:text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary" />
                    <Button size="sm" className="h-9 px-3 sm:h-7 sm:px-2" onClick={() => saveInfraction(i.id)}
                      disabled={!editName.trim() || !validValue(editValue)} aria-label="Guardar"><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" className="h-9 px-3 sm:h-7 sm:px-2" onClick={() => setEditingId(null)} aria-label="Cancelar"><X className="h-3 w-3" /></Button>
                  </>
                ) : removingId === i.id ? (
                  <>
                    <span className="basis-full sm:basis-0 sm:flex-1 min-w-0 text-[12px]">Remover «{i.name}»?</span>
                    <Button size="sm" variant="destructive" className="h-9 px-3 text-xs sm:h-7 sm:px-2 sm:text-[11px]" onClick={() => removeInfraction(i.id)}>Remover</Button>
                    <Button size="sm" variant="outline" className="h-9 px-3 text-xs sm:h-7 sm:px-2 sm:text-[11px]" onClick={() => setRemovingId(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 basis-full sm:basis-0">{i.name}</span>
                    <span className="mr-auto font-semibold text-destructive sm:mr-0 sm:w-20 sm:text-right">€{Number(i.value).toFixed(2)}</span>
                    <Button size="sm" variant="outline" className="h-9 px-3 sm:h-7 sm:px-2" aria-label={`Editar ${i.name}`}
                      onClick={() => { setEditingId(i.id); setEditName(i.name); setEditValue(String(i.value)); setRemovingId(null); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" className="h-9 px-3 sm:h-7 sm:px-2" aria-label={`Remover ${i.name}`}
                      onClick={() => { setRemovingId(i.id); setEditingId(null); }}><Trash2 className="h-3 w-3" /></Button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nova multa (descrição)"
              className="basis-full sm:basis-0 sm:flex-1 min-w-0 px-2 py-2 text-base sm:py-1.5 sm:text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <span className="text-xs text-muted-foreground">€</span>
            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="0,00" inputMode="decimal"
              className="w-24 px-2 py-2 text-base sm:py-1.5 sm:text-sm bg-background border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary" />
            <Button size="sm" onClick={addInfraction} disabled={!newName.trim() || !validValue(newValue)} className="ml-auto h-10 gap-1 text-xs sm:ml-0 sm:h-8 sm:text-[11px]">
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          </div>
        </div>
      )}

      {/* Formulário */}
      {canLaunch && showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">Nova Multa</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Responsável</label>
              <select value={selectedResp} onChange={e => setSelectedResp(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Selecionar...</option>
                {resps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Infração</label>
              <select value={selectedInfraction} onChange={e => setSelectedInfraction(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Selecionar...</option>
                {infractions.map(i => <option key={i.id} value={i.id}>{i.name} — €{i.value.toFixed(2)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase font-medium">Registado por</label>
              <select value={registeredBy} onChange={e => setRegisteredBy(e.target.value)}
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Selecionar...</option>
                {resps.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="h-10 text-xs sm:h-8 sm:text-[11px]">Cancelar</Button>
            <Button size="sm" onClick={submitPenalty} disabled={!selectedResp || !selectedInfraction || !registeredBy || submitting} className="h-10 text-xs sm:h-8 sm:text-[11px]">
              {submitting ? 'A registar...' : 'Confirmar Multa'}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Reset */}
      {isAdmin && confirmReset && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

      {lastPenalty && (
        <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm min-w-0">
            <p className="font-semibold">✅ Multa registada</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {lastPenalty.resp} — {lastPenalty.infraction} — <span className="font-semibold text-destructive">€{lastPenalty.value.toFixed(2)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <Button size="sm" variant="outline" className="text-[11px] gap-1"
                onClick={() => {
                  const date = new Date();
                  const dateStr = `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getFullYear()).slice(2)}`;
                  navigator.share({
                    text: `🚨 *Multa Registada*\n👤 Responsável: ${lastPenalty.resp}\n⚠️ Infração: ${lastPenalty.infraction}\n💶 Valor: €${lastPenalty.value.toFixed(2)}\n📅 ${dateStr}`,
                  });
                }}>
                Partilhar
              </Button>
            )}
            <button onClick={() => setLastPenalty(null)} className="text-[10px] text-muted-foreground hover:text-foreground">✕</button>
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
<div key={r.resp} className="flex items-center gap-2 cursor-pointer" onClick={() => setFilterResp(prev => prev === r.resp ? null : r.resp)}
                style={{ opacity: filterResp && filterResp !== r.resp ? 0.3 : 1 }}>
                <span className="text-[11px] font-medium w-10 flex-shrink-0">{r.resp}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-amber-500 rounded transition-all" style={{ width: `${(r.total / maxAllTime) * 100}%` }} />
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
<div key={r.resp} className="flex items-center gap-2 cursor-pointer" onClick={() => setFilterResp(prev => prev === r.resp ? null : r.resp)}
                style={{ opacity: filterResp && filterResp !== r.resp ? 0.3 : 1 }}>
                <span className="text-[11px] font-medium w-10 flex-shrink-0">{r.resp}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary rounded transition-all" style={{ width: `${(r.total / maxCurrent) * 100}%` }} />
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
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase">
              Histórico ({historyRows.length})
            </h2>
            {filterResp && (
              <button onClick={() => setFilterResp(null)} className="text-[10px] text-primary underline">{filterResp} x</button>
            )}
          </div>
        </div>
        {/* Mobile: um cartão por multa */}
        <ul className="sm:hidden divide-y divide-border max-h-[60vh] overflow-auto">
          {historyRows.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Sem registos</li>}
          {historyRows.map(p => (
            <li key={p.id} className="px-3 py-2.5 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{p.resp}</span>
                  <span className="text-xs text-muted-foreground"> · {p.infraction_name}</span>
                </div>
                <span className="text-sm font-bold text-destructive whitespace-nowrap">€{Number(p.value).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{formatDate(new Date(p.created_at))}</span>
                  <Badge variant="outline" className="text-[9px]">#{p.cycle_id}</Badge>
                  {p.registered_by && <span>por {p.registered_by}</span>}
                </span>
                {isAdmin && deleteControl(p, true)}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-auto max-h-[50vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr className="text-[10px]">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Data</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Resp</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Infração</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Valor</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Ciclo</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Registado por</th>
                {isAdmin && <th className="px-3 py-2 w-24" />}
              </tr>
            </thead>
            <tbody>
              {historyRows.map(p => (
                <tr key={p.id} className="text-[11px] border-b border-border hover:bg-muted/50">
                  <td className="px-3 py-1 whitespace-nowrap">{formatDate(new Date(p.created_at))}</td>
                  <td className="px-3 py-1 font-medium">{p.resp}</td>
                  <td className="px-3 py-1">{p.infraction_name}</td>
                  <td className="px-3 py-1 font-semibold text-destructive">€{Number(p.value).toFixed(2)}</td>
                  <td className="px-3 py-1"><Badge variant="outline" className="text-[9px]">#{p.cycle_id}</Badge></td>
                  <td className="px-3 py-1 text-muted-foreground">{p.registered_by}</td>
                  {isAdmin && (
                    <td className="px-3 py-1 text-right whitespace-nowrap">{deleteControl(p, false)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

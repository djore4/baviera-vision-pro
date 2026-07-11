import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  addDays, addWeeks, startOfWeek, getISOWeek, format, isSameDay,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Loader2, Plus, Trash2, ChevronLeft, ChevronRight, X, Check, Car,
  CalendarClock, User, Users, StickyNote, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// ---- Types ------------------------------------------------------------------

interface DemoVehicle {
  id: string;
  modelo: string | null;
  versao: string | null;
  mat: string | null;
  local: string | null;
}

interface Utilizador {
  id: number;
  nome: string | null;
  perfil: string | null;
}

type LoanTipo = 'interno' | 'cliente';

interface Emprestimo {
  id: string;
  demo_id: string;
  tipo: LoanTipo;
  utilizador_id: number | null;
  alocado_nome: string;
  notas: string | null;
  inicio: string; // ISO
  fim: string; // ISO
}

interface LoanForm {
  id: string | null;
  demo_id: string;
  tipo: LoanTipo;
  utilizador_id: number | null;
  cliente_nome: string;
  notas: string;
  inicio: string; // datetime-local "yyyy-MM-dd'T'HH:mm"
  fim: string;
}

// ---- Constants --------------------------------------------------------------

const WEEKDAYS_PT = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const LANE_H = 26; // px por "faixa" de empréstimo dentro da linha da viatura
const ROW_PAD = 8; // px de padding vertical na track

// Cor distinta por tipo de alocação
const TIPO_STYLE: Record<LoanTipo, { bar: string; dot: string; label: string; icon: typeof User }> = {
  interno: { bar: 'bg-blue-600 text-white', dot: 'bg-blue-600', label: 'Utilizador interno', icon: Users },
  cliente: { bar: 'bg-emerald-600 text-white', dot: 'bg-emerald-600', label: 'Cliente', icon: User },
};

// ---- Helpers ----------------------------------------------------------------

function toLocalInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function vehicleLabel(v: DemoVehicle): string {
  return v.modelo?.trim() || v.versao?.trim() || 'Sem modelo';
}

// Distribui empréstimos por "faixas" para que os que se sobrepõem no tempo não colidam.
function assignLanes(loans: Emprestimo[]): Map<string, number> {
  const lanes: number[] = []; // fim (ms) do último empréstimo em cada faixa
  const map = new Map<string, number>();
  const sorted = [...loans].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  for (const l of sorted) {
    const start = Date.parse(l.inicio);
    const end = Date.parse(l.fim);
    let lane = lanes.findIndex(lastEnd => lastEnd <= start);
    if (lane === -1) { lane = lanes.length; lanes.push(end); }
    else lanes[lane] = end;
    map.set(l.id, lane);
  }
  return map;
}

// ---- Component --------------------------------------------------------------

export default function EmprestimosPage() {
  const [demos, setDemos] = useState<DemoVehicle[]>([]);
  const [users, setUsers] = useState<Utilizador[]>([]);
  const [loans, setLoans] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [form, setForm] = useState<LoanForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteLoan, setDeleteLoan] = useState<Emprestimo | null>(null);

  // Adicionar / remover viatura da gama
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehForm, setVehForm] = useState({ modelo: '', versao: '', mat: '', local: '' });
  const [savingVeh, setSavingVeh] = useState(false);
  const [deleteVehicle, setDeleteVehicle] = useState<DemoVehicle | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [demosRes, usersRes, loansRes] = await Promise.all([
      supabase.from('demos').select('id, modelo, versao, mat, local').order('modelo', { ascending: true }),
      supabase.from('utilizadores').select('id, nome, perfil').order('nome', { ascending: true }),
      supabase.from('demo_emprestimos').select('*'),
    ]);
    setDemos((demosRes.data as DemoVehicle[]) ?? []);
    setUsers((usersRes.data as Utilizador[]) ?? []);
    setLoans((loansRes.data as Emprestimo[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Semana visível ----
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekStartMs = weekStart.getTime();
  const totalMs = weekEnd.getTime() - weekStartMs; // robusto a mudanças de hora (DST)

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Empréstimos que intersectam a semana visível, agrupados por viatura
  const loansByDemo = useMemo(() => {
    const map = new Map<string, Emprestimo[]>();
    for (const l of loans) {
      const s = Date.parse(l.inicio);
      const e = Date.parse(l.fim);
      if (e <= weekStartMs || s >= weekEnd.getTime()) continue; // fora da semana
      if (!map.has(l.demo_id)) map.set(l.demo_id, []);
      map.get(l.demo_id)!.push(l);
    }
    return map;
  }, [loans, weekStartMs, weekEnd]);

  // Estatísticas rápidas da semana
  const stats = useMemo(() => {
    const ocupadas = new Set(loansByDemo.keys()).size;
    return { total: demos.length, ocupadas, livres: Math.max(0, demos.length - ocupadas) };
  }, [demos.length, loansByDemo]);

  // ---- Abrir formulários ----
  function openNewLoan(demoId: string, day?: Date) {
    const base = day ?? weekStart;
    const start = new Date(base); start.setHours(9, 0, 0, 0);
    const end = new Date(base); end.setHours(19, 0, 0, 0);
    setForm({
      id: null, demo_id: demoId, tipo: 'interno', utilizador_id: users[0]?.id ?? null,
      cliente_nome: '', notas: '', inicio: toLocalInput(start), fim: toLocalInput(end),
    });
  }

  function openEditLoan(l: Emprestimo) {
    setForm({
      id: l.id, demo_id: l.demo_id, tipo: l.tipo,
      utilizador_id: l.utilizador_id, cliente_nome: l.tipo === 'cliente' ? l.alocado_nome : '',
      notas: l.notas ?? '', inicio: toLocalInput(new Date(l.inicio)), fim: toLocalInput(new Date(l.fim)),
    });
  }

  // ---- Guardar empréstimo ----
  async function saveLoan() {
    if (!form) return;
    if (!form.demo_id) { toast.error('Escolhe a viatura.'); return; }
    const inicio = new Date(form.inicio);
    const fim = new Date(form.fim);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) { toast.error('Datas inválidas.'); return; }
    if (fim <= inicio) { toast.error('A hora de fim tem de ser posterior à de início.'); return; }

    let alocado_nome: string;
    if (form.tipo === 'interno') {
      const u = users.find(x => x.id === form.utilizador_id);
      if (!u) { toast.error('Escolhe o utilizador interno.'); return; }
      alocado_nome = u.nome ?? 'Utilizador';
    } else {
      if (!form.cliente_nome.trim()) { toast.error('Indica o nome do cliente.'); return; }
      alocado_nome = form.cliente_nome.trim();
    }

    const payload = {
      demo_id: form.demo_id,
      tipo: form.tipo,
      utilizador_id: form.tipo === 'interno' ? form.utilizador_id : null,
      alocado_nome,
      notas: form.notas.trim() || null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    };

    setSaving(true);
    const res = form.id
      ? await supabase.from('demo_emprestimos').update(payload).eq('id', form.id)
      : await supabase.from('demo_emprestimos').insert(payload);
    setSaving(false);

    if (res.error) { toast.error('Falha ao guardar o empréstimo.'); return; }
    toast.success(form.id ? 'Empréstimo atualizado.' : 'Empréstimo registado.');
    setForm(null);
    loadAll();
  }

  async function removeLoan(id: string) {
    const { error } = await supabase.from('demo_emprestimos').delete().eq('id', id);
    if (error) { toast.error('Falha ao eliminar.'); return; }
    setDeleteLoan(null);
    setForm(null);
    toast.success('Empréstimo eliminado.');
    loadAll();
  }

  // ---- Adicionar / remover viatura ----
  async function addVehicle() {
    if (!vehForm.modelo.trim() && !vehForm.mat.trim()) {
      toast.error('Indica pelo menos o modelo ou a matrícula.');
      return;
    }
    setSavingVeh(true);
    const { error } = await supabase.from('demos').insert({
      modelo: vehForm.modelo.trim() || null,
      versao: vehForm.versao.trim() || null,
      mat: vehForm.mat.trim() || null,
      local: vehForm.local.trim() || null,
    });
    setSavingVeh(false);
    if (error) { toast.error('Falha ao adicionar a viatura.'); return; }
    toast.success('Viatura adicionada à gama.');
    setShowAddVehicle(false);
    setVehForm({ modelo: '', versao: '', mat: '', local: '' });
    loadAll();
  }

  async function removeVehicle(id: string) {
    const { error } = await supabase.from('demos').delete().eq('id', id);
    if (error) { toast.error('Falha ao remover a viatura.'); return; }
    setDeleteVehicle(null);
    toast.success('Viatura removida da gama.');
    loadAll();
  }

  const weekLabel = `${format(weekStart, 'd MMM', { locale: pt })} – ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: pt })}`;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">A carregar empréstimos...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(a => addWeeks(a, -1))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[12rem] text-center">
            <div className="text-sm font-semibold text-foreground">{weekLabel}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Semana {getISOWeek(weekStart)}</div>
          </div>
          <Button variant="outline" size="icon" onClick={() => setAnchor(a => addWeeks(a, 1))} aria-label="Semana seguinte">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
            <CalendarDays className="h-4 w-4 mr-1.5" /> Hoje
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground mr-1">
            <span><strong className="text-foreground">{stats.total}</strong> viaturas</span>
            <span className="text-emerald-600 dark:text-emerald-400"><strong>{stats.ocupadas}</strong> ocupadas</span>
            <span><strong className="text-foreground">{stats.livres}</strong> livres</span>
          </div>
          <Button size="sm" onClick={() => setShowAddVehicle(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova viatura
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        {(Object.keys(TIPO_STYLE) as LoanTipo[]).map(t => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${TIPO_STYLE[t].dot}`} />
            {TIPO_STYLE[t].label}
          </span>
        ))}
        <span className="hidden md:inline text-muted-foreground/70">Clica numa célula livre para registar um empréstimo · clica numa barra para editar.</span>
      </div>

      {/* Board */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-[760px]">
          {/* Cabeçalho de dias */}
          <div className="flex bg-bmw-navy text-white">
            <div className="w-[200px] shrink-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider sticky left-0 z-10 bg-bmw-navy border-r border-white/10">
              Viatura
            </div>
            <div className="flex flex-1">
              {weekDays.map((d, i) => {
                const today = isSameDay(d, new Date());
                const weekend = i >= 5;
                return (
                  <div
                    key={i}
                    className={`flex-1 px-1 py-1.5 text-center border-l border-white/10 ${weekend ? 'bg-white/5' : ''} ${today ? 'bg-bmw-blue' : ''}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{WEEKDAYS_PT[i]}</div>
                    <div className="text-sm font-bold tabular-nums">{format(d, 'd')}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Linhas de viaturas */}
          {demos.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sem viaturas na gama. Clica em <strong>Nova viatura</strong> para começar.
            </div>
          )}

          {demos.map((v, rowIdx) => {
            const rowLoans = loansByDemo.get(v.id) ?? [];
            const laneMap = assignLanes(rowLoans);
            const laneCount = Math.max(1, rowLoans.length ? Math.max(...laneMap.values()) + 1 : 1);
            const rowHeight = laneCount * LANE_H + ROW_PAD * 2;

            return (
              <div key={v.id} className={`flex border-t border-border ${rowIdx % 2 ? 'bg-muted/20' : ''}`}>
                {/* Coluna da viatura */}
                <div className="w-[200px] shrink-0 px-3 py-2 sticky left-0 z-10 bg-inherit border-r border-border flex items-start justify-between gap-2 group">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {vehicleLabel(v)}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {v.mat && <span className="text-[10px] font-mono font-semibold bg-muted px-1.5 py-0.5 rounded text-foreground/80">{v.mat}</span>}
                      {v.local && <span className="text-[10px] text-muted-foreground truncate">{v.local}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteVehicle(v)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                    title="Remover viatura da gama"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Track cronológica */}
                <div className="relative flex-1" style={{ height: rowHeight }}>
                  {/* Colunas de fundo (clicáveis para novo empréstimo) */}
                  <div className="absolute inset-0 flex">
                    {weekDays.map((d, i) => {
                      const today = isSameDay(d, new Date());
                      const weekend = i >= 5;
                      return (
                        <button
                          key={i}
                          onClick={() => openNewLoan(v.id, d)}
                          title={`Novo empréstimo · ${format(d, "EEEE d 'de' MMMM", { locale: pt })}`}
                          className={`flex-1 border-l border-border/60 first:border-l-0 transition-colors hover:bg-primary/5
                            ${weekend ? 'bg-muted/30' : ''} ${today ? 'bg-primary/5' : ''}`}
                        />
                      );
                    })}
                  </div>

                  {/* Barras de empréstimo */}
                  {rowLoans.map(l => {
                    const s = Math.max(Date.parse(l.inicio), weekStartMs);
                    const e = Math.min(Date.parse(l.fim), weekEnd.getTime());
                    const left = ((s - weekStartMs) / totalMs) * 100;
                    const width = ((e - s) / totalMs) * 100;
                    const lane = laneMap.get(l.id) ?? 0;
                    const continuesLeft = Date.parse(l.inicio) < weekStartMs;
                    const continuesRight = Date.parse(l.fim) > weekEnd.getTime();
                    const style = TIPO_STYLE[l.tipo];
                    const timeRange = `${format(new Date(l.inicio), 'd MMM HH:mm', { locale: pt })} → ${format(new Date(l.fim), 'd MMM HH:mm', { locale: pt })}`;
                    return (
                      <button
                        key={l.id}
                        onClick={() => openEditLoan(l)}
                        title={`${l.alocado_nome} · ${timeRange}${l.notas ? ` · ${l.notas}` : ''}`}
                        className={`absolute flex items-center gap-1 px-1.5 text-[11px] font-semibold shadow-sm ring-1 ring-black/10 hover:ring-2 hover:ring-primary transition-all overflow-hidden
                          ${style.bar}
                          ${continuesLeft ? 'rounded-l-none' : 'rounded-l'} ${continuesRight ? 'rounded-r-none' : 'rounded-r'}`}
                        style={{
                          left: `${left}%`,
                          width: `calc(${width}% - 2px)`,
                          top: ROW_PAD + lane * LANE_H,
                          height: LANE_H - 4,
                        }}
                      >
                        <span className="truncate">{l.alocado_nome}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal empréstimo */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setForm(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                {form.id ? 'Editar empréstimo' : 'Novo empréstimo'}
              </h2>
              <button onClick={() => setForm(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>

            <div className="p-5 space-y-4">
              {/* Viatura */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Viatura</label>
                <select
                  value={form.demo_id}
                  onChange={e => setForm(f => f && ({ ...f, demo_id: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {demos.map(d => (
                    <option key={d.id} value={d.id}>
                      {vehicleLabel(d)}{d.mat ? ` · ${d.mat}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Tipo de alocação</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TIPO_STYLE) as LoanTipo[]).map(t => {
                    const Icon = TIPO_STYLE[t].icon;
                    const active = form.tipo === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setForm(f => f && ({ ...f, tipo: t }))}
                        className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded border transition-colors
                          ${active ? `${TIPO_STYLE[t].bar} border-transparent` : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {TIPO_STYLE[t].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quem */}
              {form.tipo === 'interno' ? (
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Utilizador</label>
                  <select
                    value={form.utilizador_id ?? ''}
                    onChange={e => setForm(f => f && ({ ...f, utilizador_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>Escolher utilizador…</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.nome}{u.perfil ? ` (${u.perfil})` : ''}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cliente</label>
                  <Input
                    value={form.cliente_nome}
                    onChange={e => setForm(f => f && ({ ...f, cliente_nome: e.target.value }))}
                    placeholder="Nome do cliente"
                    className="h-8 text-xs"
                  />
                </div>
              )}

              {/* Datas/horas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Início</label>
                  <input
                    type="datetime-local"
                    value={form.inicio}
                    onChange={e => setForm(f => f && ({ ...f, inicio: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Fim</label>
                  <input
                    type="datetime-local"
                    value={form.fim}
                    onChange={e => setForm(f => f && ({ ...f, fim: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-2 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> A hora exata é usada para imputar multas, SCUTs e portagens.
              </p>

              {/* Notas */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <StickyNote className="h-3 w-3" /> Notas / finalidade
                </label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(f => f && ({ ...f, notas: e.target.value }))}
                  placeholder="Ex.: test-drive, evento, reparação…"
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
              {form.id ? (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { const l = loans.find(x => x.id === form.id); if (l) setDeleteLoan(l); }}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Eliminar
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setForm(null)}>Cancelar</Button>
                <Button size="sm" onClick={saveLoan} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova viatura */}
      {showAddVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAddVehicle(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Nova viatura</h2>
              <button onClick={() => setShowAddVehicle(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { key: 'modelo', label: 'Modelo', ph: 'Ex.: BMW X1' },
                { key: 'versao', label: 'Versão', ph: 'Ex.: sDrive18d' },
                { key: 'mat', label: 'Matrícula', ph: 'Ex.: AB-12-CD' },
                { key: 'local', label: 'Local', ph: 'Ex.: Aveiro' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{f.label}</label>
                  <Input
                    value={vehForm[f.key as keyof typeof vehForm]}
                    onChange={e => setVehForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">Fica disponível também no separador DEMOS, onde podes completar preços e características.</p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowAddVehicle(false)}>Cancelar</Button>
              <Button size="sm" onClick={addVehicle} disabled={savingVeh}>
                {savingVeh ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminar empréstimo */}
      {deleteLoan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-sm font-medium">Eliminar este empréstimo?</p>
            <p className="text-xs text-muted-foreground">{deleteLoan.alocado_nome}</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteLoan(null)}>Cancelar</Button>
              <Button size="sm" onClick={() => removeLoan(deleteLoan.id)} className="bg-destructive text-white hover:bg-destructive/90">Eliminar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar remover viatura */}
      {deleteVehicle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-sm font-medium">Remover viatura da gama?</p>
            <p className="text-xs text-muted-foreground">
              <strong>{vehicleLabel(deleteVehicle)}</strong>{deleteVehicle.mat ? ` · ${deleteVehicle.mat}` : ''}<br />
              Remove a viatura (e todos os seus empréstimos) do separador DEMOS.
            </p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteVehicle(null)}>Cancelar</Button>
              <Button size="sm" onClick={() => removeVehicle(deleteVehicle.id)} className="bg-destructive text-white hover:bg-destructive/90">Remover</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
}

type LoanTipo = 'interno' | 'cliente';

interface Emprestimo {
  id: string;
  demo_id: string;
  tipo: LoanTipo;
  alocado_nome: string;
  cliente_telefone: string | null;
  cliente_nif: string | null;
  notas: string | null;
  inicio: string; // ISO
  fim: string; // ISO
}

interface LoanForm {
  id: string | null;
  demo_id: string;
  tipo: LoanTipo;
  membro: string; // iniciais do membro da escala (interno)
  cliente_nome: string;
  cliente_telefone: string;
  cliente_nif: string;
  notas: string;
  inicio: string; // datetime-local "yyyy-MM-dd'T'HH:mm"
  fim: string;
}

// ---- Constants --------------------------------------------------------------

const WEEKDAYS_PT = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const LANE_H = 26; // px por "faixa" de empréstimo dentro da linha da viatura
const ROW_PAD = 8; // px de padding vertical na track

const ESCALA_BUCKET = 'excel-files';
const ESCALA_PATH = 'escala-teste.json';
// Equipa por omissão, caso a escala ainda não tenha sido guardada
const DEFAULT_MEMBERS = ['JD', 'BR', 'FS', 'NC', 'PM', 'TS'];

// Cor distinta por tipo de alocação
const TIPO_STYLE: Record<LoanTipo, { bar: string; dot: string; label: string; icon: typeof User }> = {
  interno: { bar: 'bg-blue-600 text-white', dot: 'bg-blue-600', label: 'Utilizador interno', icon: Users },
  cliente: { bar: 'bg-emerald-600 text-white', dot: 'bg-emerald-600', label: 'Cliente', icon: User },
};

// ---- Helpers ----------------------------------------------------------------

function toLocalInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function vehicleModel(v: DemoVehicle): string {
  return v.modelo?.trim() || 'Sem modelo';
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
  const [members, setMembers] = useState<string[]>(DEFAULT_MEMBERS);
  const [loans, setLoans] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [now, setNow] = useState<Date>(() => new Date());
  const [form, setForm] = useState<LoanForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteLoan, setDeleteLoan] = useState<Emprestimo | null>(null);

  // Relógio: atualiza a linha do "agora" a cada minuto
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [demosRes, loansRes] = await Promise.all([
      supabase.from('demos').select('id, modelo, versao, mat').order('modelo', { ascending: true }),
      supabase.from('demo_emprestimos').select('*'),
    ]);
    setDemos((demosRes.data as DemoVehicle[]) ?? []);
    setLoans((loansRes.data as Emprestimo[]) ?? []);

    // Membros internos = equipa da escala de serviço
    try {
      const { data } = await supabase.storage.from(ESCALA_BUCKET).download(ESCALA_PATH);
      if (data) {
        const parsed = JSON.parse(await data.text()) as { team?: Array<{ initials?: string }> };
        const team = (parsed.team ?? [])
          .map(m => (m.initials ?? '').trim())
          .filter(Boolean);
        if (team.length) setMembers(Array.from(new Set(team)));
      }
    } catch {
      // mantém a equipa por omissão
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Semana visível ----
  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const totalMs = weekEndMs - weekStartMs; // robusto a mudanças de hora (DST)

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Posição da linha vermelha "agora" (só quando a semana atual está visível)
  const nowMs = now.getTime();
  const nowLeft = nowMs >= weekStartMs && nowMs < weekEndMs
    ? ((nowMs - weekStartMs) / totalMs) * 100
    : null;

  // Empréstimos que intersectam a semana visível, agrupados por viatura
  const loansByDemo = useMemo(() => {
    const map = new Map<string, Emprestimo[]>();
    for (const l of loans) {
      const s = Date.parse(l.inicio);
      const e = Date.parse(l.fim);
      if (e <= weekStartMs || s >= weekEndMs) continue; // fora da semana
      if (!map.has(l.demo_id)) map.set(l.demo_id, []);
      map.get(l.demo_id)!.push(l);
    }
    return map;
  }, [loans, weekStartMs, weekEndMs]);

  // Estatísticas rápidas da semana
  const stats = useMemo(() => {
    const ocupadas = new Set(loansByDemo.keys()).size;
    return { total: demos.length, ocupadas, livres: Math.max(0, demos.length - ocupadas) };
  }, [demos.length, loansByDemo]);

  // ---- Abrir formulários ----
  function openNewLoan(demoId: string, day?: Date) {
    if (!demoId) { toast.error('Sem viaturas na gama. Adiciona-as no separador DEMOS.'); return; }
    const base = day ?? (nowLeft !== null ? now : weekStart);
    const start = new Date(base); start.setHours(9, 0, 0, 0);
    const end = new Date(base); end.setHours(19, 0, 0, 0);
    setForm({
      id: null, demo_id: demoId, tipo: 'interno', membro: members[0] ?? '',
      cliente_nome: '', cliente_telefone: '', cliente_nif: '', notas: '',
      inicio: toLocalInput(start), fim: toLocalInput(end),
    });
  }

  function openEditLoan(l: Emprestimo) {
    setForm({
      id: l.id, demo_id: l.demo_id, tipo: l.tipo,
      membro: l.tipo === 'interno' ? l.alocado_nome : (members[0] ?? ''),
      cliente_nome: l.tipo === 'cliente' ? l.alocado_nome : '',
      cliente_telefone: l.cliente_telefone ?? '',
      cliente_nif: l.cliente_nif ?? '',
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
      if (!form.membro) { toast.error('Escolhe o utilizador da escala.'); return; }
      alocado_nome = form.membro;
    } else {
      if (!form.cliente_nome.trim()) { toast.error('Indica o nome do cliente.'); return; }
      alocado_nome = form.cliente_nome.trim();
    }

    const payload = {
      demo_id: form.demo_id,
      tipo: form.tipo,
      alocado_nome,
      cliente_telefone: form.tipo === 'cliente' ? (form.cliente_telefone.trim() || null) : null,
      cliente_nif: form.tipo === 'cliente' ? (form.cliente_nif.trim() || null) : null,
      notas: form.notas.trim() || null,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    };

    setSaving(true);
    const res = form.id
      ? await supabase.from('demo_emprestimos').update(payload).eq('id', form.id)
      : await supabase.from('demo_emprestimos').insert(payload);
    setSaving(false);

    if (res.error) { toast.error('Falha ao guardar o agendamento.'); return; }
    toast.success(form.id ? 'Agendamento atualizado.' : 'Agendamento registado.');
    setForm(null);
    loadAll();
  }

  async function removeLoan(id: string) {
    const { error } = await supabase.from('demo_emprestimos').delete().eq('id', id);
    if (error) { toast.error('Falha ao eliminar.'); return; }
    setDeleteLoan(null);
    setForm(null);
    toast.success('Agendamento eliminado.');
    loadAll();
  }

  const weekLabel = `${format(weekStart, 'd MMM', { locale: pt })} – ${format(addDays(weekStart, 6), 'd MMM yyyy', { locale: pt })}`;

  // Classe de fundo por dia (cabeçalho): hoje > domingo (encerrado) > sábado
  const headerDayBg = (d: Date, i: number) =>
    isSameDay(d, now) ? 'bg-bmw-blue' : i === 6 ? 'bg-rose-500/25' : i === 5 ? 'bg-white/10' : '';
  // Classe de fundo por coluna (track)
  const trackDayBg = (d: Date, i: number) =>
    isSameDay(d, now) ? 'bg-primary/5' : i === 6 ? 'bg-rose-500/10' : i === 5 ? 'bg-muted/40' : '';

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
          <Button size="sm" onClick={() => openNewLoan(demos[0]?.id ?? '')}>
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar agendamento
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
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-rose-500/40" /> Domingo (encerrado)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-red-500" /> Agora
        </span>
      </div>

      {/* Board */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-[760px]">
          {/* Cabeçalho de dias */}
          <div className="flex bg-bmw-navy text-white">
            <div className="w-[200px] shrink-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider sticky left-0 z-10 bg-bmw-navy border-r border-white/10">
              Viatura
            </div>
            <div className="relative flex flex-1">
              {weekDays.map((d, i) => (
                <div
                  key={i}
                  title={i === 6 ? 'Domingo — encerrado' : undefined}
                  className={`flex-1 px-1 py-1.5 text-center border-l border-white/10 ${headerDayBg(d, i)}`}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{WEEKDAYS_PT[i]}</div>
                  <div className="text-sm font-bold tabular-nums">{format(d, 'd')}</div>
                </div>
              ))}
              {/* Marcador "agora" no cabeçalho */}
              {nowLeft !== null && (
                <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: `${nowLeft}%` }}>
                  <div className="absolute inset-y-0 w-px bg-red-500 -translate-x-1/2" />
                  <div className="absolute top-0 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-b whitespace-nowrap tabular-nums">
                    {format(now, 'HH:mm')}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Linhas de viaturas */}
          {demos.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Sem viaturas na gama. Adiciona-as no separador <strong>DEMOS</strong>.
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
                <div className="w-[200px] shrink-0 px-3 py-2 sticky left-0 z-10 bg-inherit border-r border-border">
                  <div className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
                    <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {vehicleModel(v)}
                  </div>
                  {v.versao && <div className="mt-0.5 text-[10px] text-muted-foreground truncate pl-5">{v.versao}</div>}
                  {v.mat && (
                    <div className="mt-1 pl-5">
                      <span className="text-[10px] font-mono font-semibold bg-muted px-1.5 py-0.5 rounded text-foreground/80">{v.mat}</span>
                    </div>
                  )}
                </div>

                {/* Track cronológica */}
                <div className="relative flex-1" style={{ height: rowHeight }}>
                  {/* Colunas de fundo (clicáveis para novo agendamento) */}
                  <div className="absolute inset-0 flex">
                    {weekDays.map((d, i) => (
                      <button
                        key={i}
                        onClick={() => openNewLoan(v.id, d)}
                        title={`Novo agendamento · ${format(d, "EEEE d 'de' MMMM", { locale: pt })}`}
                        className={`flex-1 border-l border-border/60 first:border-l-0 transition-colors hover:bg-primary/5 ${trackDayBg(d, i)}`}
                      />
                    ))}
                  </div>

                  {/* Barras de empréstimo */}
                  {rowLoans.map(l => {
                    const s = Math.max(Date.parse(l.inicio), weekStartMs);
                    const e = Math.min(Date.parse(l.fim), weekEndMs);
                    const left = ((s - weekStartMs) / totalMs) * 100;
                    const width = ((e - s) / totalMs) * 100;
                    const lane = laneMap.get(l.id) ?? 0;
                    const continuesLeft = Date.parse(l.inicio) < weekStartMs;
                    const continuesRight = Date.parse(l.fim) > weekEndMs;
                    const style = TIPO_STYLE[l.tipo];
                    const timeRange = `${format(new Date(l.inicio), 'd MMM HH:mm', { locale: pt })} → ${format(new Date(l.fim), 'd MMM HH:mm', { locale: pt })}`;
                    const extra = l.tipo === 'cliente'
                      ? [l.cliente_telefone, l.cliente_nif && `NIF ${l.cliente_nif}`].filter(Boolean).join(' · ')
                      : '';
                    return (
                      <button
                        key={l.id}
                        onClick={() => openEditLoan(l)}
                        title={`${l.alocado_nome} · ${timeRange}${extra ? ` · ${extra}` : ''}${l.notas ? ` · ${l.notas}` : ''}`}
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

                  {/* Linha vermelha "agora" */}
                  {nowLeft !== null && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none -translate-x-1/2"
                      style={{ left: `${nowLeft}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal agendamento */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setForm(null)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                {form.id ? 'Editar agendamento' : 'Novo agendamento'}
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
                      {vehicleModel(d)}{d.versao ? ` ${d.versao}` : ''}{d.mat ? ` · ${d.mat}` : ''}
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
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Utilizador (escala de serviço)</label>
                  <select
                    value={form.membro}
                    onChange={e => setForm(f => f && ({ ...f, membro: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>Escolher utilizador…</option>
                    {members.map(m => <option key={m} value={m}>{m}</option>)}
                    {form.membro && !members.includes(form.membro) && <option value={form.membro}>{form.membro}</option>}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cliente</label>
                    <Input
                      value={form.cliente_nome}
                      onChange={e => setForm(f => f && ({ ...f, cliente_nome: e.target.value }))}
                      placeholder="Nome do cliente"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Telemóvel</label>
                      <Input
                        value={form.cliente_telefone}
                        onChange={e => setForm(f => f && ({ ...f, cliente_telefone: e.target.value }))}
                        placeholder="9xx xxx xxx"
                        inputMode="tel"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">NIF</label>
                      <Input
                        value={form.cliente_nif}
                        onChange={e => setForm(f => f && ({ ...f, cliente_nif: e.target.value }))}
                        placeholder="Contribuinte"
                        inputMode="numeric"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
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

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
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

      {/* Confirmar eliminar agendamento */}
      {deleteLoan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-sm font-medium">Eliminar este agendamento?</p>
            <p className="text-xs text-muted-foreground">{deleteLoan.alocado_nome}</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteLoan(null)}>Cancelar</Button>
              <Button size="sm" onClick={() => removeLoan(deleteLoan.id)} className="bg-destructive text-white hover:bg-destructive/90">Eliminar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

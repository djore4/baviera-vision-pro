import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useData } from '@/contexts/DataContext';
import { isRetiredMember } from '@/lib/team';
import ObjetivosVnAnual from '@/components/objetivos/ObjetivosVnAnual';
import { Save, ChevronLeft, ChevronRight, Check } from 'lucide-react';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface ObjetivoResp { ano: number; mes: number; responsavel: string; objetivo: number }
interface Orcamento { ano: number; mes: number; tipo: 'GSC' | 'BMW'; orcamento: number }

// Vendedores fixos — editável aqui se necessário
const DEFAULT_VENDEDORES = ['Afonso', 'Bruno', 'Carolina', 'David', 'Filipe', 'Gonçalo', 'Hugo', 'Inês'];

/* ── Objetivos · Vendas VN ─────────────────────────────────────────────────────
 * Orçamentos mensais (GSC = Caetano e BMW, em faturas/retails) e objetivo mensal por
 * vendedor. Alimentam os gauges da WIP VN e o gráfico por vendedor da Produção.
 * Sem `editable` é só de consulta.
 * ──────────────────────────────────────────────────────────────────────────── */
export default function ObjetivosVnPanel({ editable }: { editable: boolean }) {
  const { refresh } = useData();
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [vendedores, setVendedores] = useState<string[]>([]);
  // Vendedores que já não estão na equipa mas têm objetivos no mês em vista (histórico).
  const [extras, setExtras] = useState<string[]>([]);
  const [objetivos, setObjetivos] = useState<Record<string, number>>({});
  const [orcamentos, setOrcamentos] = useState<Record<string, number>>({ GSC: 0, BMW: 0 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newVendedor, setNewVendedor] = useState('');

  // Equipa atual = quem tem objetivos no mês corrente ou em meses futuros (sem os que já
  // saíram). Antes era "todos os que alguma vez tiveram uma linha", pelo que quem saía da
  // equipa voltava sempre a aparecer. Sem nada de hoje em diante, usa o último mês com dados.
  useEffect(() => {
    supabase
      .from('objetivos_resp')
      .select('ano,mes,responsavel')
      .then(({ data }) => {
        const rows = ((data ?? []) as { ano: number; mes: number; responsavel: string }[])
          .filter(r => r.responsavel && !isRetiredMember(r.responsavel));
        const key = (r: { ano: number; mes: number }) => r.ano * 100 + r.mes;
        const hoje = now.getFullYear() * 100 + (now.getMonth() + 1);
        let atuais = rows.filter(r => key(r) >= hoje);
        if (atuais.length === 0 && rows.length > 0) {
          const ultimo = Math.max(...rows.map(key));
          atuais = rows.filter(r => key(r) === ultimo);
        }
        const fromDb = [...new Set(atuais.map(r => r.responsavel))].sort();
        setVendedores(fromDb.length > 0 ? fromDb : DEFAULT_VENDEDORES);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const [{ data: objData }, { data: orcData }] = await Promise.all([
      supabase.from('objetivos_resp').select('*').eq('ano', ano).eq('mes', mes),
      supabase.from('objetivos_orcamento').select('*').eq('ano', ano).eq('mes', mes),
    ]);

    const objMap: Record<string, number> = {};
    vendedores.forEach(v => { objMap[v] = 0; });
    (objData as ObjetivoResp[] ?? []).forEach(o => { objMap[o.responsavel] = o.objetivo; });
    // Histórico: quem já saiu mas tem objetivos neste mês continua visível (para o total bater certo).
    setExtras((objData as ObjetivoResp[] ?? []).map(o => o.responsavel).filter(r => !vendedores.includes(r)));
    setObjetivos(objMap);

    const orcMap: Record<string, number> = { GSC: 0, BMW: 0 };
    (orcData as Orcamento[] ?? []).forEach(o => { orcMap[o.tipo] = Number(o.orcamento); });
    setOrcamentos(orcMap);
  }, [ano, mes, vendedores.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (vendedores.length > 0) load(); }, [load, vendedores]);

  const lista = [...new Set([...vendedores, ...extras])].sort();

  async function saveAll() {
    setSaving(true);
    const objPayload = lista.map(v => ({ ano, mes, responsavel: v, objetivo: objetivos[v] || 0 }));
    const orcPayload = (['GSC', 'BMW'] as const).map(tipo => ({ ano, mes, tipo, orcamento: orcamentos[tipo] || 0 }));
    const results = await Promise.all([
      supabase.from('objetivos_resp').upsert(objPayload, { onConflict: 'ano,mes,responsavel' }),
      supabase.from('objetivos_orcamento').upsert(orcPayload, { onConflict: 'ano,mes,tipo' }),
    ]);
    setSaving(false);
    const failed = results.find(r => r.error);
    if (failed?.error) { toast.error(`Não foi possível guardar os objetivos: ${failed.error.message}`); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Atualiza os gauges e a vista anual com os objetivos acabados de guardar.
    await refresh();
  }

  function addVendedor() {
    const name = newVendedor.trim();
    if (!name || vendedores.includes(name)) return;
    setVendedores(v => [...v, name].sort());
    setObjetivos(o => ({ ...o, [name]: 0 }));
    setNewVendedor('');
  }

  // Remove o vendedor da equipa: apaga os objetivos dele do mês em vista em diante (os meses
  // anteriores ficam, para não alterar o histórico). Antes só tirava da lista no ecrã, sem
  // apagar nada na base de dados, pelo que voltava a aparecer ao recarregar.
  async function removeVendedor(name: string) {
    if (!window.confirm(`Remover ${name}? Apaga os objetivos de ${name} de ${MONTHS_SHORT[mes - 1]} ${ano} em diante.`)) return;
    const { error } = await supabase
      .from('objetivos_resp')
      .delete()
      .eq('responsavel', name)
      .or(`ano.gt.${ano},and(ano.eq.${ano},mes.gte.${mes})`);
    if (error) { toast.error(`Não foi possível remover ${name}: ${error.message}`); return; }
    setVendedores(v => v.filter(x => x !== name));
    setExtras(x => x.filter(e => e !== name));
    setObjetivos(o => { const next = { ...o }; delete next[name]; return next; });
    await refresh();
  }

  function prevMonth() { if (mes === 1) { setAno(a => a - 1); setMes(12); } else setMes(m => m - 1); }
  function nextMonth() { if (mes === 12) { setAno(a => a + 1); setMes(1); } else setMes(m => m + 1); }

  const totalObj = lista.reduce((s, v) => s + (objetivos[v] || 0), 0);

  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      {/* Period nav */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-base font-semibold min-w-[180px] text-center">{MONTHS[mes - 1]} {ano}</span>
        <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Orçamentos */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orçamentos — {MONTHS_SHORT[mes - 1]} {ano}</h3>
          {(['GSC', 'BMW'] as const).map(tipo => (
            <div key={tipo} className="space-y-1.5">
              <label className="text-sm font-medium">{tipo}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!editable}
                  value={orcamentos[tipo] ?? 0}
                  onChange={e => setOrcamentos(o => ({ ...o, [tipo]: Math.round(Number(e.target.value)) }))}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-center font-medium"
                />
                <span className="text-xs text-muted-foreground whitespace-nowrap">faturas</span>
              </div>
            </div>
          ))}
        </div>

        {/* Objetivos vendedores */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objetivos — {MONTHS_SHORT[mes - 1]} {ano}</h3>
          </div>
          <div className="space-y-2">
            {lista.map(v => (
              <div key={v} className="flex items-center gap-2">
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{v}</span>
                <input
                  type="number"
                  min={0}
                  disabled={!editable}
                  value={objetivos[v] ?? 0}
                  onChange={e => setObjetivos(o => ({ ...o, [v]: Number(e.target.value) }))}
                  className="w-20 px-2 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-center font-medium"
                />
                <span className="text-xs text-muted-foreground w-4">un.</span>
                {editable && <button onClick={() => removeVendedor(v)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Remover vendedor">
                  ×
                </button>}
              </div>
            ))}
          </div>
          {/* Total de negócios objetivo do mês, evidenciado */}
          <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide">Total negócios</span>
            <span className="text-base font-extrabold tabular-nums">{totalObj} un.</span>
          </div>

          {/* Add vendedor */}
          {editable && <div className="flex gap-2 pt-1 border-t border-border">
            <input
              type="text"
              placeholder="Adicionar vendedor..."
              value={newVendedor}
              onChange={e => setNewVendedor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addVendedor()}
              className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={addVendedor}
              disabled={!newVendedor.trim()}
              className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded disabled:opacity-40 transition-colors font-medium"
            >
              + Adicionar
            </button>
          </div>}
        </div>
      </div>

      <ObjetivosVnAnual ano={ano} mes={mes} onSelectMes={setMes} />

      {editable && <button
        onClick={saveAll}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-sm bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? 'A guardar...' : saved ? 'Guardado!' : `Guardar ${MONTHS_SHORT[mes - 1]} ${ano}`}
      </button>}
    </div>
  );
}

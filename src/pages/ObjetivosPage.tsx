import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Save, ChevronLeft, ChevronRight, Check } from 'lucide-react';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface ObjetivoResp { ano: number; mes: number; responsavel: string; objetivo: number }
interface Orcamento { ano: number; mes: number; tipo: 'GSC' | 'BMW'; orcamento: number }

// Vendedores fixos — editável aqui se necessário
const DEFAULT_VENDEDORES = ['Afonso', 'Bruno', 'Carolina', 'David', 'Filipe', 'Gonçalo', 'Hugo', 'Inês'];

export default function ObjetivosPage() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [objetivos, setObjetivos] = useState<Record<string, number>>({});
  const [orcamentos, setOrcamentos] = useState<Record<string, number>>({ GSC: 0, BMW: 0 });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newVendedor, setNewVendedor] = useState('');

  // Load vendedores from DB (distinct) on mount
  useEffect(() => {
    supabase
      .from('objetivos_resp')
      .select('responsavel')
      .then(({ data }) => {
        const fromDb = [...new Set((data ?? []).map((r: { responsavel: string }) => r.responsavel))].sort();
        setVendedores(fromDb.length > 0 ? fromDb : DEFAULT_VENDEDORES);
      });
  }, []);

  const load = useCallback(async () => {
    const [{ data: objData }, { data: orcData }] = await Promise.all([
      supabase.from('objetivos_resp').select('*').eq('ano', ano).eq('mes', mes),
      supabase.from('objetivos_orcamento').select('*').eq('ano', ano).eq('mes', mes),
    ]);

    const objMap: Record<string, number> = {};
    vendedores.forEach(v => { objMap[v] = 0; });
    (objData as ObjetivoResp[] ?? []).forEach(o => { objMap[o.responsavel] = o.objetivo; });
    setObjetivos(objMap);

    const orcMap: Record<string, number> = { GSC: 0, BMW: 0 };
    (orcData as Orcamento[] ?? []).forEach(o => { orcMap[o.tipo] = Number(o.orcamento); });
    setOrcamentos(orcMap);
  }, [ano, mes, vendedores.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (vendedores.length > 0) load(); }, [load, vendedores]);

  async function saveAll() {
    setSaving(true);
    const objPayload = vendedores.map(v => ({ ano, mes, responsavel: v, objetivo: objetivos[v] || 0 }));
    const orcPayload = (['GSC', 'BMW'] as const).map(tipo => ({ ano, mes, tipo, orcamento: orcamentos[tipo] || 0 }));
    await Promise.all([
      supabase.from('objetivos_resp').upsert(objPayload, { onConflict: 'ano,mes,responsavel' }),
      supabase.from('objetivos_orcamento').upsert(orcPayload, { onConflict: 'ano,mes,tipo' }),
    ]);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addVendedor() {
    const name = newVendedor.trim();
    if (!name || vendedores.includes(name)) return;
    setVendedores(v => [...v, name].sort());
    setObjetivos(o => ({ ...o, [name]: 0 }));
    setNewVendedor('');
  }

  function removeVendedor(name: string) {
    setVendedores(v => v.filter(x => x !== name));
    setObjetivos(o => { const next = { ...o }; delete next[name]; return next; });
  }

  function prevMonth() { if (mes === 1) { setAno(a => a - 1); setMes(12); } else setMes(m => m - 1); }
  function nextMonth() { if (mes === 12) { setAno(a => a + 1); setMes(1); } else setMes(m => m + 1); }

  const totalObj = vendedores.reduce((s, v) => s + (objetivos[v] || 0), 0);

  return (
    <div className="max-w-3xl space-y-5">
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
            <span className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">{totalObj} un.</span></span>
          </div>
          <div className="space-y-2">
            {vendedores.map(v => (
              <div key={v} className="flex items-center gap-2">
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{v}</span>
                <input
                  type="number"
                  min={0}
                  value={objetivos[v] ?? 0}
                  onChange={e => setObjetivos(o => ({ ...o, [v]: Number(e.target.value) }))}
                  className="w-20 px-2 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-center font-medium"
                />
                <span className="text-xs text-muted-foreground w-4">un.</span>
                <button onClick={() => removeVendedor(v)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Remover vendedor">
                  ×
                </button>
              </div>
            ))}
          </div>
          {/* Add vendedor */}
          <div className="flex gap-2 pt-1 border-t border-border">
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
          </div>
        </div>
      </div>

      {/* Yearly overview */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo anual — {ano}</h3>
        <p className="text-xs text-muted-foreground">Clica num mês para o editar.</p>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
          {MONTHS_SHORT.map((m, i) => {
            const isSelected = i + 1 === mes;
            return (
              <button
                key={m}
                onClick={() => setMes(i + 1)}
                className={`py-2 rounded text-[10px] font-medium transition-colors ${isSelected ? 'bg-amber-500 text-black' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-sm bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saving ? 'A guardar...' : saved ? 'Guardado!' : `Guardar ${MONTHS_SHORT[mes - 1]} ${ano}`}
      </button>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { useData } from '@/contexts/DataContext';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface ObjetivoResp { id?: string; ano: number; mes: number; responsavel: string; objetivo: number }
interface Orcamento { id?: string; ano: number; mes: number; tipo: 'GSC' | 'BMW'; orcamento: number }

export default function ObjetivosTab() {
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [objetivos, setObjetivos] = useState<ObjetivoResp[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data } = useData();
  const responsaveis = data
    ? [...new Set(data.control.map(r => r.resp).filter(Boolean))].sort()
    : [];

  const load = useCallback(async () => {
    const [{ data: objData }, { data: orcData }] = await Promise.all([
      supabase.from('objetivos_resp').select('*').eq('ano', ano).eq('mes', mes),
      supabase.from('objetivos_orcamento').select('*').eq('ano', ano).eq('mes', mes),
    ]);

    const existingObj = (objData as ObjetivoResp[]) ?? [];
    const existingOrc = (orcData as Orcamento[]) ?? [];

    // Merge with known responsáveis (fill missing with 0)
    const merged = responsaveis.map(r => {
      const found = existingObj.find(o => o.responsavel === r);
      return found ?? { ano, mes, responsavel: r, objetivo: 0 };
    });
    setObjetivos(merged);

    const gsc = existingOrc.find(o => o.tipo === 'GSC') ?? { ano, mes, tipo: 'GSC' as const, orcamento: 0 };
    const bmw = existingOrc.find(o => o.tipo === 'BMW') ?? { ano, mes, tipo: 'BMW' as const, orcamento: 0 };
    setOrcamentos([gsc, bmw]);
  }, [ano, mes, responsaveis.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function saveAll() {
    setSaving(true);
    const objPayload = objetivos.map(o => ({
      ano: o.ano, mes: o.mes, responsavel: o.responsavel, objetivo: Number(o.objetivo) || 0,
    }));
    const orcPayload = orcamentos.map(o => ({
      ano: o.ano, mes: o.mes, tipo: o.tipo, orcamento: Number(o.orcamento) || 0,
    }));

    await Promise.all([
      supabase.from('objetivos_resp').upsert(objPayload, { onConflict: 'ano,mes,responsavel' }),
      supabase.from('objetivos_orcamento').upsert(orcPayload, { onConflict: 'ano,mes,tipo' }),
    ]);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function prevMonth() {
    if (mes === 1) { setAno(a => a - 1); setMes(12); }
    else setMes(m => m - 1);
  }
  function nextMonth() {
    if (mes === 12) { setAno(a => a + 1); setMes(1); }
    else setMes(m => m + 1);
  }

  const totalObj = objetivos.reduce((s, o) => s + (Number(o.objetivo) || 0), 0);
  const gsc = orcamentos.find(o => o.tipo === 'GSC');
  const bmw = orcamentos.find(o => o.tipo === 'BMW');

  return (
    <div className="max-w-2xl space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-base font-semibold min-w-[140px] text-center">
          {MONTHS[mes - 1]} {ano}
        </span>
        <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Orçamentos */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Orçamentos</h3>
        <div className="grid grid-cols-2 gap-4">
          {(['GSC', 'BMW'] as const).map(tipo => {
            const orc = orcamentos.find(o => o.tipo === tipo);
            return (
              <div key={tipo} className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{tipo}</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                  <input
                    type="number"
                    min={0}
                    value={orc?.orcamento ?? 0}
                    onChange={e => setOrcamentos(prev => prev.map(o =>
                      o.tipo === tipo ? { ...o, orcamento: Number(e.target.value) } : o
                    ))}
                    className="w-full pl-6 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-right"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Objetivos por vendedor */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objetivos por Vendedor</h3>
          <span className="text-xs text-muted-foreground">Total: <span className="font-semibold text-foreground">{totalObj}</span></span>
        </div>
        {objetivos.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum vendedor identificado. Carrega o ficheiro Excel na secção <strong>DADOS</strong> primeiro.
          </p>
        )}
        <div className="space-y-2">
          {objetivos.map((o, i) => (
            <div key={o.responsavel} className="flex items-center gap-3">
              <span className="text-sm font-medium min-w-[100px]">{o.responsavel}</span>
              <input
                type="number"
                min={0}
                value={o.objetivo}
                onChange={e => setObjetivos(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], objetivo: Number(e.target.value) };
                  return next;
                })}
                className="w-24 px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-center"
              />
              <span className="text-xs text-muted-foreground">unidades</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-500 text-black font-semibold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        <Save className="h-4 w-4" />
        {saving ? 'A guardar...' : saved ? 'Guardado!' : 'Guardar'}
      </button>
    </div>
  );
}

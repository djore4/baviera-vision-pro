import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { listVuObjetivos, saveVuObjetivos } from '@/lib/control-records-vu';

/* ── Objetivos · Viaturas Usadas ───────────────────────────────────────────────
 * Dois valores de faturas VU por mês: objetivo BMW e orçamento Caetano. Alimentam
 * os gauges de Realização vs Objetivo da WIP VU (tabela vu_objetivos, mes='AAAA/MM').
 * ──────────────────────────────────────────────────────────────────────────── */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const monthKey = (ano: number, m: number) => `${ano}/${String(m).padStart(2, '0')}`;

type Draft = { bmw: string; caetano: string };

export default function ObjetivosVuPanel({ editable }: { editable: boolean }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [saved, setSaved] = useState<Record<string, Draft> | null>(null); // estado em BD
  const [draft, setDraft] = useState<Record<string, Draft>>({});          // estado em edição
  const [saving, setSaving] = useState(false);

  const load = () => listVuObjetivos()
    .then(rows => {
      const map: Record<string, Draft> = {};
      rows.forEach(o => { map[o.mes] = { bmw: String(o.bmw), caetano: String(o.caetano) }; });
      setSaved(map);
      setDraft({});
    })
    .catch(e => { setSaved({}); toast.error('Falha ao carregar objetivos: ' + (e as Error).message); });

  useEffect(() => { load(); }, []);

  const valueOf = (key: string, field: keyof Draft) => draft[key]?.[field] ?? saved?.[key]?.[field] ?? '';
  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };

  const setField = (key: string, field: keyof Draft, v: string) =>
    setDraft(prev => ({
      ...prev,
      [key]: { bmw: valueOf(key, 'bmw'), caetano: valueOf(key, 'caetano'), [field]: v },
    }));

  const totals = useMemo(() => {
    let bmw = 0, caetano = 0;
    for (let m = 1; m <= 12; m++) {
      const k = monthKey(ano, m);
      bmw += num(draft[k]?.bmw ?? saved?.[k]?.bmw ?? '');
      caetano += num(draft[k]?.caetano ?? saved?.[k]?.caetano ?? '');
    }
    return { bmw, caetano };
  }, [ano, draft, saved]);

  const dirtyKeys = Object.keys(draft).filter(k => k.startsWith(`${ano}/`));

  const save = async () => {
    setSaving(true);
    try {
      await saveVuObjetivos(dirtyKeys.map(mes => ({
        mes, bmw: num(valueOf(mes, 'bmw')), caetano: num(valueOf(mes, 'caetano')),
      })));
      await load();
      toast.success(`Objetivos VU ${ano} guardados.`);
    } catch (e) {
      toast.error('Falha ao guardar objetivos: ' + (e as Error).message);
    } finally { setSaving(false); }
  };

  if (saved === null) {
    return <div className="py-20 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />A carregar objetivos VU…</div>;
  }

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => setAno(a => a - 1)} aria-label="Ano anterior" className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-base font-semibold min-w-[80px] text-center tabular-nums">{ano}</span>
        <button onClick={() => setAno(a => a + 1)} aria-label="Ano seguinte" className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <p className="text-xs text-muted-foreground">
        Faturas VU por mês. O <strong>objetivo BMW</strong> e o <strong>orçamento Caetano</strong> são comparados, na WIP VU, com as faturas realizadas.
      </p>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Mês</th>
              <th className="px-3 py-2 text-center font-semibold" style={{ color: '#1C69D4' }}>Objetivo BMW</th>
              <th className="px-3 py-2 text-center font-semibold" style={{ color: '#16A34A' }}>Orçamento Caetano</th>
            </tr>
          </thead>
          <tbody>
            {MESES.map((nome, i) => {
              const key = monthKey(ano, i + 1);
              return (
                <tr key={key} className="border-t border-border/70">
                  <td className="px-3 py-1.5 font-medium">{nome}</td>
                  {(['bmw', 'caetano'] as const).map(field => (
                    <td key={field} className="px-3 py-1.5 text-center">
                      <input
                        type="number" min={0} step={1} inputMode="numeric"
                        disabled={!editable}
                        value={valueOf(key, field)}
                        onChange={e => setField(key, field, e.target.value)}
                        placeholder="—"
                        aria-label={`${field === 'bmw' ? 'Objetivo BMW' : 'Orçamento Caetano'} ${nome} ${ano}`}
                        className="w-24 px-2 py-1.5 text-sm text-center font-medium bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border bg-muted/30 font-bold">
            <tr>
              <td className="px-3 py-2">Total {ano}</td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: '#1C69D4' }}>{totals.bmw}</td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: '#16A34A' }}>{totals.caetano}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable ? (
        <button onClick={save} disabled={saving || dirtyKeys.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 text-sm bg-primary text-primary-foreground font-semibold rounded-lg disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'A guardar…' : `Guardar ${ano}`}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Objetivos definidos pela gestão.</p>
      )}
    </div>
  );
}

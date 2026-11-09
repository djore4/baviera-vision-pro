import { useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { calcPricing, type PricingInputs, type Tipo } from '@/lib/demoPricing';
import { PRICE_FIELDS } from '@/lib/demoColunas';
import { toFieldText, fromFieldText, type Kind } from '@/lib/precoCampos';

/* ── Janela de preço de uma viatura (gestão pelo responsável local) ───────────
 * Mesma mecânica do formulário de preços da plataforma Caetano: 1. estrutura base,
 * 2. descontos, 3. apuramento do PVP e da margem, com o cálculo em direto. As fórmulas
 * são as do Excel "PARQUE BMW" (lib/demoPricing.ts): o preço de custo NÃO inclui o BSI.
 * Grava por demos_gravar_precos() (a base de dados valida quem pode e em que local) e só
 * envia os campos alterados, para não repor valores que outra pessoa mudou entretanto.
 * ──────────────────────────────────────────────────────────────────────────── */

interface FieldDef { key: keyof PricingInputs; label: string; hint?: string; kind: Kind }

const BASE: FieldDef[] = [
  { key: 'pvb', label: 'PVB', hint: 'Preço base', kind: 'eur' },
  { key: 'opc', label: 'OPC', hint: 'Opcionais', kind: 'eur' },
  { key: 'bsi', label: 'BSI / MSI', kind: 'eur' },
  { key: 'eco', label: 'ECO', hint: 'Ecovalor', kind: 'eur' },
  { key: 'leg', label: 'LEG / TR', hint: 'Legalização / transporte', kind: 'eur' },
  { key: 'isv', label: 'ISV', kind: 'eur' },
];
const DESCS: FieldDef[] = [
  { key: 'mgb', label: 'MGB', hint: 'Margem fixa', kind: 'pct' },
  { key: 'esf', label: 'ESF', hint: 'Margem variável', kind: 'pct' },
  { key: 'pac', label: 'PAC', kind: 'pct' },
  { key: 'dem', label: 'DEM', hint: 'Apoio demonstração', kind: 'pct' },
  { key: 'sup', label: 'SUP', hint: 'Apoio suplementar', kind: 'pct' },
];
const FIM: FieldDef[] = [
  { key: 'depreciacoes', label: 'DEP', hint: 'Depreciações (€)', kind: 'eur' },
  { key: 'pvp_desc', label: 'PVP Desc / Final', hint: 'Preço de venda com IVA (€)', kind: 'eur' },
];

const eur = (n: number) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const perc = (n: number) => (n * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

export interface PrecosDialogProps {
  chassis: string;
  titulo: string;
  subtitulo?: string;
  inputs: PricingInputs;
  tipo: Pick<Tipo, 'xev' | 'bev'>;
  onClose: () => void;
  /** Valores gravados (a base de dados devolve `inputs` completo). */
  onSaved: (inputs: Partial<PricingInputs>) => void;
}

export default function PrecosDialog({ chassis, titulo, subtitulo, inputs, tipo, onClose, onSaved }: PrecosDialogProps) {
  const all = [...BASE, ...DESCS, ...FIM];
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(all.map(f => [f.key, toFieldText(inputs[f.key], f.kind)])));
  const [saving, setSaving] = useState(false);

  // Valores numéricos do formulário (campo inválido → null) e os que diferem do original.
  const parsed = useMemo(() => Object.fromEntries(all.map(f => [f.key, fromFieldText(text[f.key] ?? '', f.kind)])) as Record<keyof PricingInputs, number | null>, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const invalid = all.filter(f => {
    const v = parsed[f.key];
    return v === null || (f.kind === 'pct' && (v < 0 || v > 1));
  });
  const changed = useMemo(() => {
    const out: Partial<PricingInputs> = {};
    PRICE_FIELDS.forEach(k => {
      const v = parsed[k];
      if (v !== null && Math.abs(v - (inputs[k] ?? 0)) > 1e-9) out[k] = v;
    });
    return out;
  }, [parsed, inputs]);
  const nChanged = Object.keys(changed).length;

  const live = useMemo(() => {
    const cur = { ...inputs } as PricingInputs;
    PRICE_FIELDS.forEach(k => { const v = parsed[k]; if (v !== null) cur[k] = v; });
    return calcPricing(cur, tipo);
  }, [parsed, inputs, tipo]);

  const tryClose = () => {
    if (nChanged > 0 && !window.confirm('Tens alterações por gravar. Fechar e perdê-las?')) return;
    onClose();
  };

  async function gravar() {
    if (invalid.length > 0) { toast.error(`Valor inválido em ${invalid.map(f => f.label).join(', ')}.`); return; }
    if (nChanged === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('demos_gravar_precos', { p_chassis: chassis, p_inputs: changed as never });
      if (error) throw error;
      toast.success('Preços gravados.');
      onSaved(changed);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      toast.error(e.code === '42501' ? 'Sem permissão para gerir os preços desta viatura.' : `Não foi possível gravar: ${e.message ?? 'erro desconhecido'}`);
    } finally {
      setSaving(false);
    }
  }

  const input = (f: FieldDef, big = false) => {
    const bad = invalid.some(x => x.key === f.key);
    return (
      <label key={f.key} className="block" title={f.hint}>
        <span className={`block text-[10px] font-bold uppercase tracking-wide mb-1 ${big ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
          {f.label} <span className="font-normal normal-case text-muted-foreground/70">{f.kind === 'pct' ? '(%)' : '(€)'}</span>
        </span>
        <input
          inputMode="decimal"
          value={text[f.key] ?? ''}
          onChange={e => setText(p => ({ ...p, [f.key]: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void gravar(); } }}
          aria-invalid={bad}
          className={`w-full rounded-md border bg-background px-2.5 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-primary ${big ? 'py-2.5 text-base font-black border-green-500/60' : 'py-1.5 text-sm'} ${bad ? 'border-destructive' : 'border-border'} ${changed[f.key] !== undefined ? 'bg-amber-500/10' : ''}`}
        />
      </label>
    );
  };

  const out = (label: string, value: string, tone = '') => (
    <div>
      <span className="block text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`block text-sm font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );

  const temMargem = live.pvp_desc > 0 && (parsed.pvb ?? inputs.pvb) > 0;

  return (
    <Dialog open onOpenChange={o => { if (!o) tryClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border bg-muted/30 text-left">
          <DialogTitle className="text-lg font-black leading-tight">{titulo}</DialogTitle>
          <DialogDescription className="font-mono text-xs uppercase">{subtitulo ?? chassis}</DialogDescription>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4">
          <section className="rounded-xl border border-border overflow-hidden">
            <div className="p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest mb-3">1. Estrutura base (€)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{BASE.map(f => input(f))}</div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-border bg-muted/30 px-4 py-3">
              {out('Penetração opc.', perc(live.penetracao))}
              {out('PVP bruto (c/ IVA)', eur(live.pvp))}
            </div>
          </section>

          <section className="rounded-xl border border-border overflow-hidden">
            <div className="p-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-brand-primary mb-3">
                2. Descontos (%) <span className="text-[10px] font-medium normal-case text-muted-foreground ml-1">(ex.: 8,5)</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">{DESCS.map(f => input(f))}</div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-border bg-sky-500/5 px-4 py-3">
              {out('Corte acumulado', perc(live.desc_perc), 'text-sky-700 dark:text-sky-300')}
              {out('Desconto total líq.', eur(live.desc_eur), 'text-red-600')}
            </div>
          </section>

          <section className="relative rounded-xl border border-green-500/50 overflow-hidden">
            <div className="absolute inset-y-0 left-0 w-1.5 bg-green-500" />
            <div className="p-4 pl-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400 mb-3">3. Apuramento PVP e margem</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{input(FIM[0], true)}{input(FIM[1], true)}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-green-500/30 bg-green-500/5 px-4 py-3 pl-6">
              {out('Preço de custo (c/ IVA)', eur(live.p_custo))}
              {out(live.iva_dedutivel ? 'PVP s/ IVA' : 'PVP s/ IVA (ICE, não dedutível)', eur(live.pvp_sem_iva))}
              {out('Margem real (€)', temMargem ? eur(live.margem) : '—', temMargem ? (live.margem < 0 ? 'text-red-600 text-base' : 'text-green-600 text-base') : '')}
              {out('Margem real (%)', temMargem ? perc(live.margem_perc) : '—', temMargem ? (live.margem < 0 ? 'text-red-600 text-base' : 'text-green-600 text-base') : '')}
            </div>
          </section>

          <p className="text-[11px] text-muted-foreground leading-snug">
            Preço de custo = (PVB + OPC − DSC + ECO + LEG/TR + ISV) × 1,23, sem BSI. Margem = PVP Desc − P Custo + DEP.
            Só se gravam os campos alterados.
          </p>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {invalid.length > 0 ? <span className="text-destructive">Valor inválido: {invalid.map(f => f.label).join(', ')}</span>
              : nChanged > 0 ? `${nChanged} ${nChanged === 1 ? 'campo alterado' : 'campos alterados'}` : 'Sem alterações'}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={tryClose} className="px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors">Cancelar</button>
            <button
              type="button" onClick={gravar} disabled={saving || nChanged === 0 || invalid.length > 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Gravar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

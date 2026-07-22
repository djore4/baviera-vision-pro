import { useMemo, useState } from 'react';
import { Table2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import {
  BONUS_COLS, BONUS_MODELS, BONUS_TABLE, ALL_BONUS_MODELS,
  I7_MODEL, I7_RATE, lookupBonus, versionsForModel,
} from '@/data/bonusBmw';

const fmtPct = (rate: number | null) =>
  rate === null ? '—' : `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(rate * 100)} %`;

/** Índices onde começa um novo grupo de colunas (para desenhar separadores). */
const groupStart = new Set(
  BONUS_COLS.map((c, i) => (i > 0 && c.group !== BONUS_COLS[i - 1].group ? i : -1)).filter(i => i >= 0),
);

/**
 * Modal de consulta da Tabela de Bónus BMW.
 * `onApply(rate)` recebe a fração (ex.: 0.07) para preencher a MG. FIXA.
 */
export default function BonusBmwDialog({ onApply }: { onApply: (rate: number) => void }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState('');
  const [version, setVersion] = useState('');

  const versions = useMemo(() => versionsForModel(model), [model]);
  const rate = useMemo(() => lookupBonus(model, version), [model, version]);

  function pick(m: string, v: string, r: number) {
    onApply(r);
    setModel(m);
    setVersion(v);
    setOpen(false);
  }

  function applyCurrent() {
    if (rate !== null) { onApply(rate); setOpen(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors"
        >
          <Table2 className="h-3.5 w-3.5" /> Margens Fixas por Modelo
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-[min(96vw,60rem)] max-h-[90vh] overflow-hidden flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">Tabela de Bónus BMW</DialogTitle>
          <DialogDescription>
            Escolhe o modelo e a versão para aplicar automaticamente à <strong>MG. FIXA</strong>,
            ou clica diretamente numa célula da grelha.
          </DialogDescription>
        </DialogHeader>

        {/* Lookup rápido */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Modelo</span>
            <select
              value={model}
              onChange={e => { setModel(e.target.value); setVersion(''); }}
              className="w-28 px-2 py-1 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">—</option>
              {ALL_BONUS_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Versão</span>
            <select
              value={version}
              onChange={e => setVersion(e.target.value)}
              disabled={!model || model === I7_MODEL}
              className="w-28 px-2 py-1 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
            >
              <option value="">{model === I7_MODEL ? 'qualquer' : '—'}</option>
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Bónus</span>
            <div className="w-20 px-2 py-1 text-xs text-right tabular-nums rounded bg-background border border-border font-semibold">
              {model === I7_MODEL ? fmtPct(I7_RATE / 100) : fmtPct(rate)}
            </div>
          </div>
          <button
            type="button"
            onClick={applyCurrent}
            disabled={model === I7_MODEL ? false : rate === null}
            className="px-3 py-1.5 text-xs rounded bg-[#002060] text-white font-semibold hover:bg-[#002060]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Aplicar à MG. FIXA
          </button>
        </div>

        {/* Grelha completa */}
        <div className="overflow-auto rounded-lg border border-border">
          <table className="border-collapse text-[11px] tabular-nums">
            <thead>
              <tr className="bg-[#002060] text-white">
                <th className="sticky left-0 z-20 bg-[#002060] px-2 py-1 text-left font-semibold">Modelo</th>
                {BONUS_COLS.map((col, i) => (
                  <th
                    key={col.key}
                    className={`px-2 py-1 text-center font-semibold ${groupStart.has(i) ? 'border-l border-white/40' : ''}`}
                  >
                    {col.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BONUS_MODELS.map(m => (
                <tr key={m} className="border-t border-border even:bg-muted/30">
                  <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-semibold text-[#002060] dark:text-foreground border-r border-border">
                    {m}
                  </th>
                  {BONUS_COLS.map((col, i) => {
                    const v = BONUS_TABLE[m]?.[col.key];
                    const has = typeof v === 'number';
                    return (
                      <td
                        key={col.key}
                        className={`px-2 py-1 text-center ${groupStart.has(i) ? 'border-l border-border' : ''}`}
                      >
                        {has ? (
                          <button
                            type="button"
                            onClick={() => pick(m, col.key, (v as number) / 100)}
                            className="w-full rounded px-1 py-0.5 text-[#002060] dark:text-sky-300 font-medium hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors"
                            title={`Aplicar ${v}% à MG. FIXA (${m} ${col.key})`}
                          >
                            {v}%
                          </button>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* i7: linha especial — bónus fixo em todas as versões */}
              <tr className="border-t-2 border-[#002060]/40 bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/40 px-2 py-1 text-left font-semibold text-[#002060] dark:text-foreground border-r border-border">
                  {I7_MODEL}
                </th>
                <td colSpan={BONUS_COLS.length} className="px-2 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => pick(I7_MODEL, '', I7_RATE / 100)}
                    className="rounded px-3 py-0.5 text-[#002060] dark:text-sky-300 font-medium hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors"
                    title={`Aplicar ${I7_RATE}% à MG. FIXA (i7)`}
                  >
                    {I7_RATE}% (todas as versões)
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Valores em percentagem sobre a base (PVB + OPC). Confirmar sempre com a tabela oficial BMW.
        </p>
      </DialogContent>
    </Dialog>
  );
}

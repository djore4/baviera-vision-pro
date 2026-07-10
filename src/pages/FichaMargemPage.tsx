import { useState, useMemo, useEffect } from 'react';
import { FileDown, Save, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';

/* ── Tradução exata da sheet "Ficha" (Ficha de Margem 3.0) ── */

const MEDIA_MOVEL: Record<string, number> = {
  '0 a 1': 0.05,
  '2 a 3': 0.085,
  '4 ou +': 0.11,
};

/* ── MARGENS FIXAS (sheet MARGENS) — modelo × versão → margem (fração) ── */
const MARGENS_VERSIONS = ['16','20e','18d','18','20d','20','23d','25e','30e','30d','30','35e','40e','45e','35i','40','40d','50e','60e','50','60','M'];
const MARGENS_MODELS = ['S1','S2','S3','S4','i4','S5','S6','Z4','X1','X2','X3','X4','X5','X6','X7','S7','S8','iX1','iX2','iX','XM','i7'];
const DEFAULT_MARGENS: Record<string, Record<string, number>> = {
  S1:{'16':0.06,'18':0.07,'20':0.07,'18d':0.07,'20d':0.07,'35i':0.09},
  S2:{'16':0.06,'18':0.07,'20':0.07,'30':0.08,'40':0.09,'18d':0.07,'20d':0.07,'23d':0.07,'25e':0.07,'30e':0.07,'35i':0.09,'M':0.1},
  S3:{'20':0.07,'30':0.08,'40':0.09,'20e':0.06,'18d':0.07,'20d':0.07,'30e':0.07,'30d':0.08,'40d':0.09,'M':0.1},
  S4:{'20':0.07,'30':0.08,'40':0.09,'20d':0.07,'30d':0.08,'40d':0.09,'M':0.1},
  i4:{'35e':0.07,'40e':0.07,'50e':0.07},
  S5:{'20d':0.07,'30e':0.07,'30d':0.08,'40e':0.08,'40d':0.09,'M':0.1},
  S6:{'30':0.08,'20d':0.07,'30d':0.08,'40d':0.09},
  Z4:{'20':0.07,'30':0.08,'40':0.09},
  X1:{'18':0.07,'20':0.07,'18d':0.07,'23d':0.07,'25e':0.07,'30e':0.07,'35i':0.09},
  X2:{'18':0.07,'18d':0.07,'20d':0.07,'25e':0.07,'35i':0.09},
  X3:{'18d':0.07,'20d':0.07,'30e':0.07,'30d':0.08,'40d':0.09,'M':0.1},
  X4:{'20d':0.07,'30d':0.08,'40d':0.09,'M':0.1},
  X5:{'40':0.09,'50':0.1,'30d':0.08,'40d':0.09,'M':0.1},
  X6:{'40':0.09,'50':0.1,'30d':0.08,'40d':0.09,'M':0.1},
  X7:{'40':0.09,'60':0.1,'40d':0.09},
  S7:{'40':0.1,'40d':0.1,'50e':0.1,'60e':0.1},
  S8:{'40':0.1,'50':0.1,'40d':0.1,'M':0.1},
  iX1:{'20e':0.06,'30e':0.07},
  iX2:{'20e':0.06,'30e':0.07},
  iX:{'40e':0.08,'45e':0.08,'50e':0.08,'60e':0.08},
  XM:{'M':0.1},
  i7:{'16':0.09},
};
const MARGENS_PATH = 'margens-fixas.json';

type MargensState = Record<string, Record<string, string>>;
function buildInitialMargens(): MargensState {
  const m: MargensState = {};
  for (const model of MARGENS_MODELS) {
    m[model] = {};
    for (const ver of MARGENS_VERSIONS) {
      const v = DEFAULT_MARGENS[model]?.[ver];
      m[model][ver] = v === undefined ? '' : String(Math.round(v * 1000) / 10);
    }
  }
  return m;
}

const eur = (v: number | null) =>
  v === null || !isFinite(v) ? '—'
    : new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
const pct = (v: number | null) =>
  v === null || !isFinite(v) ? '—'
    : new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(v * 100) + ' %';
const num = (s: string) => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; };

/* Inputs */
function EurInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
      className="w-full text-right px-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
      placeholder="0,00" />
  );
}
function PctInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-right pr-5 pl-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
        placeholder="0" />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
    </div>
  );
}

export default function FichaMargemPage() {
  const { isAdmin } = useAuth();

  // Cabeçalho
  const [modelo, setModelo] = useState('');
  const [proposta, setProposta] = useState('');
  const [encChass, setEncChass] = useState('');
  const [matricula, setMatricula] = useState('');
  const [dataMatricula, setDataMatricula] = useState('');

  // Rúbricas (€)
  const [pvb, setPvb] = useState('');
  const [opc, setOpc] = useState('');
  const [bsi, setBsi] = useState('');
  const [eco, setEco] = useState('');
  const [legTr, setLegTr] = useState('');
  const [isv, setIsv] = useState('');
  const [recond, setRecond] = useState('');
  const [ofertas, setOfertas] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');

  // Percentagens (%)
  const [ivaPct, setIvaPct] = useState('23');
  const [mgFixaPct, setMgFixaPct] = useState('7');
  const [mgVarPct, setMgVarPct] = useState('5');
  const [pacPct, setPacPct] = useState('');
  const [apoioFrotaPct, setApoioFrotaPct] = useState('');
  const [apoioDemoPct, setApoioDemoPct] = useState('9');
  const [deprecPct, setDeprecPct] = useState('');
  const [bonusMPct, setBonusMPct] = useState('');

  const [mediaMovel, setMediaMovel] = useState('4 ou +');

  // Margens fixas (referência) — editável só para admin, persistida no storage
  const [margens, setMargens] = useState<MargensState>(buildInitialMargens);
  const [savingMargens, setSavingMargens] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.storage.from('excel-files').download(MARGENS_PATH);
        if (data) {
          const parsed = JSON.parse(await data.text());
          if (parsed && typeof parsed === 'object') {
            // Preenche a partir do guardado, mantendo a grelha completa.
            setMargens(prev => {
              const merged: MargensState = {};
              for (const model of MARGENS_MODELS) {
                merged[model] = {};
                for (const ver of MARGENS_VERSIONS) {
                  merged[model][ver] = parsed[model]?.[ver] ?? prev[model]?.[ver] ?? '';
                }
              }
              return merged;
            });
          }
        }
      } catch { /* usa defaults */ }
    })();
  }, []);

  const setCell = (model: string, ver: string, val: string) =>
    setMargens(m => ({ ...m, [model]: { ...m[model], [ver]: val } }));

  async function saveMargens() {
    setSavingMargens(true);
    try {
      const blob = new Blob([JSON.stringify(margens)], { type: 'application/json' });
      const { error } = await supabase.storage.from('excel-files').upload(MARGENS_PATH, blob, { upsert: true, contentType: 'application/json' });
      if (error) throw error;
      toast.success('Margens fixas guardadas.');
    } catch {
      toast.error('Falha ao guardar as margens.');
    } finally {
      setSavingMargens(false);
    }
  }

  const c = useMemo(() => {
    const _pvb = num(pvb), _opc = num(opc), _bsi = num(bsi), _eco = num(eco), _legTr = num(legTr), _isv = num(isv);
    const _recond = num(recond), _ofertas = num(ofertas);
    const iva = num(ivaPct) / 100;

    const base = _pvb + _opc;
    const sumPvbIsv = _pvb + _opc + _bsi + _eco + _legTr + _isv;
    const opcPctAuto = _pvb ? _opc / _pvb : null;

    const ivaEur = sumPvbIsv * iva;
    const pvp = sumPvbIsv + ivaEur;

    const mgFixaEur = (num(mgFixaPct) / 100) * base;
    const mgVarEur = (num(mgVarPct) / 100) * base;
    const pacEur = (num(pacPct) / 100) * base;
    const apoioFrotaEur = (num(apoioFrotaPct) / 100) * base;
    const apoioDemoEur = (num(apoioDemoPct) / 100) * base;
    const deprecEur = (num(deprecPct) / 100) * base;
    const bonusMEur = (num(bonusMPct) / 100) * base;
    const descTotalEur = mgFixaEur + mgVarEur + pacEur + apoioFrotaEur + apoioDemoEur + deprecEur + bonusMEur;
    const descTotalPct = base ? descTotalEur / base : null;

    const precoCusto = (sumPvbIsv - descTotalEur + _recond + _ofertas) * (1 + iva);
    const precoVendaN = precoVenda === '' ? null : num(precoVenda);
    const precoVendaSemIva = precoVendaN === null ? null : precoVendaN / 1.23;
    const margemEur = precoVendaN === null ? 0 : (precoVendaN - precoCusto) / 1.23;
    const margemPct = base ? margemEur / base : 0;

    const comissaoRate = MEDIA_MOVEL[mediaMovel] ?? null;
    const comissaoEur = comissaoRate === null ? null : comissaoRate * margemEur;

    return {
      opcPctAuto, ivaEur, pvp, mgFixaEur, mgVarEur, pacEur, apoioFrotaEur, apoioDemoEur, deprecEur, bonusMEur,
      descTotalEur, descTotalPct, precoCusto, precoVendaSemIva, margemEur, margemPct, comissaoRate, comissaoEur,
    };
  }, [pvb, opc, bsi, eco, legTr, isv, recond, ofertas, precoVenda,
      ivaPct, mgFixaPct, mgVarPct, pacPct, apoioFrotaPct, apoioDemoPct, deprecPct, bonusMPct, mediaMovel]);

  const meses = useMemo(() => {
    if (!dataMatricula) return '';
    const d = new Date(dataMatricula);
    if (isNaN(d.getTime())) return '';
    const m = Math.round(((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) / 30) * 10) / 10;
    return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(m)} meses`;
  }, [dataMatricula]);

  function exportPdf() {
    const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string));
    const rows: [string, string, string][] = [
      ['PVB', '-', eur(num(pvb))],
      ['OPC', pct(c.opcPctAuto), eur(num(opc))],
      ['BSI', '-', eur(num(bsi))],
      ['ECO', '-', eur(num(eco))],
      ['LEG / TR', '-', eur(num(legTr))],
      ['ISV', '-', eur(num(isv))],
      ['IVA', ivaPct + ' %', eur(c.ivaEur)],
      ['PVP', '-', eur(c.pvp)],
      ['MG. FIXA', mgFixaPct + ' %', eur(c.mgFixaEur)],
      ['MG. VARIÁVEL', mgVarPct + ' %', eur(c.mgVarEur)],
      ['PAC', (pacPct || '0') + ' %', eur(c.pacEur)],
      ['APOIO FROTA', (apoioFrotaPct || '0') + ' %', eur(c.apoioFrotaEur)],
      ['APOIO DEMO', apoioDemoPct + ' %', eur(c.apoioDemoEur)],
      ['DEPRECIAÇÕES', (deprecPct || '0') + ' %', eur(c.deprecEur)],
      ['BÓNUS M', (bonusMPct || '0') + ' %', eur(c.bonusMEur)],
      ['DESC. TOTAL', pct(c.descTotalPct), eur(c.descTotalEur)],
      ['RECONDICIONAMENTO', '-', eur(num(recond))],
      ['OFERTAS', '-', eur(num(ofertas))],
      ['PREÇO CUSTO', '-', eur(c.precoCusto)],
      ['PREÇO VENDA', '-', precoVenda === '' ? '—' : eur(num(precoVenda))],
      ['PREÇO VENDA (S/ IVA)', '-', eur(c.precoVendaSemIva)],
      ['MARGEM', pct(c.margemPct), eur(c.margemEur)],
      ['MÉDIA MÓVEL', pct(c.comissaoRate), mediaMovel],
      ['COMISSÃO', '-', eur(c.comissaoEur)],
    ];
    const strongRows = new Set(['PVP', 'DESC. TOTAL', 'PREÇO CUSTO', 'MARGEM', 'COMISSÃO']);
    const body = rows.map(([l, p, e]) =>
      `<tr${strongRows.has(l) ? ' style="font-weight:700;background:#eef2ff"' : ''}><td style="text-align:left">${esc(l)}</td><td>${esc(p)}</td><td style="text-align:right">${esc(e)}</td></tr>`
    ).join('');
    const info = [['MODELO', modelo], ['PROPOSTA', proposta], ['ENC / CHASS', encChass], ['MATRÍCULA', matricula], ['DATA MATRÍCULA', dataMatricula], ['IDADE', meses]]
      .map(([k, v]) => `<div><span style="color:#6b7280">${esc(k)}:</span> <strong>${esc(v || '—')}</strong></div>`).join('');

    const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"/><title>Ficha_Margem_${esc(proposta || modelo || '')}</title>
<style>*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:18px}
h1{font-size:16px;margin:0 0 8px}.info{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;font-size:11px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:11px}th{background:#002060;color:#fff;padding:4px 6px;text-align:right}th:first-child{text-align:left}
td{border:1px solid #e5e7eb;padding:3px 6px;text-align:center}@page{size:A4 portrait;margin:12mm}</style></head><body>
<h1>Ficha de Margem</h1><div class="info">${info}</div>
<table><thead><tr><th>RÚBRICA</th><th>%</th><th>€</th></tr></thead><tbody>${body}</tbody></table>
<script>window.onload=function(){window.focus();window.print();};</script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Permite pop-ups para exportar o PDF.'); return; }
    w.document.write(html); w.document.close();
  }

  const Auto = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
    <td className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${strong ? 'font-bold text-foreground' : 'text-foreground/80'}`}>{children}</td>
  );
  const Dash = () => <td className="px-2 py-1 text-right text-muted-foreground/50">-</td>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold tracking-tight">Ficha de Margem</h1>
        <button onClick={exportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
          <FileDown className="h-3.5 w-3.5" /> Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,520px)_1fr] gap-4 items-start">
        {/* ── Ficha ── */}
        <div className="space-y-4">
          {/* Cabeçalho */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-1.5 bg-[#002060] text-white text-[10px] font-semibold uppercase tracking-wide">Identificação</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
              <Field label="MODELO" value={modelo} onChange={setModelo} />
              <Field label="PROPOSTA" value={proposta} onChange={setProposta} />
              <Field label="ENC / CHASS" value={encChass} onChange={setEncChass} />
              <Field label="MATRÍCULA" value={matricula} onChange={setMatricula} />
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">DATA MATRÍCULA</label>
                <input type="date" value={dataMatricula} onChange={e => setDataMatricula(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-1">IDADE</label>
                <div className="px-2 py-1 text-xs rounded bg-muted border border-border text-foreground/80">{meses || '—'}</div>
              </div>
            </div>
          </div>

          {/* Rúbricas */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#002060] text-white">
                  <th className="px-2 py-1.5 text-left font-semibold">RÚBRICA</th>
                  <th className="px-2 py-1.5 text-right font-semibold w-28">%</th>
                  <th className="px-2 py-1.5 text-right font-semibold w-40">€</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <Row label="PVB"><Dash /><td className="px-2 py-1"><EurInput value={pvb} onChange={setPvb} /></td></Row>
                <Row label="OPC"><Auto>{pct(c.opcPctAuto)}</Auto><td className="px-2 py-1"><EurInput value={opc} onChange={setOpc} /></td></Row>
                <Row label="BSI"><Dash /><td className="px-2 py-1"><EurInput value={bsi} onChange={setBsi} /></td></Row>
                <Row label="ECO"><Dash /><td className="px-2 py-1"><EurInput value={eco} onChange={setEco} /></td></Row>
                <Row label="LEG / TR"><Dash /><td className="px-2 py-1"><EurInput value={legTr} onChange={setLegTr} /></td></Row>
                <Row label="ISV"><Dash /><td className="px-2 py-1"><EurInput value={isv} onChange={setIsv} /></td></Row>
                <Row label="IVA"><td className="px-2 py-1"><PctInput value={ivaPct} onChange={setIvaPct} /></td><Auto>{eur(c.ivaEur)}</Auto></Row>
                <Row label="PVP" highlight><Dash /><Auto strong>{eur(c.pvp)}</Auto></Row>

                <Row label="MG. FIXA"><td className="px-2 py-1"><PctInput value={mgFixaPct} onChange={setMgFixaPct} /></td><Auto>{eur(c.mgFixaEur)}</Auto></Row>
                <Row label="MG. VARIÁVEL"><td className="px-2 py-1"><PctInput value={mgVarPct} onChange={setMgVarPct} /></td><Auto>{eur(c.mgVarEur)}</Auto></Row>
                <Row label="PAC"><td className="px-2 py-1"><PctInput value={pacPct} onChange={setPacPct} /></td><Auto>{eur(c.pacEur)}</Auto></Row>
                <Row label="APOIO FROTA"><td className="px-2 py-1"><PctInput value={apoioFrotaPct} onChange={setApoioFrotaPct} /></td><Auto>{eur(c.apoioFrotaEur)}</Auto></Row>
                <Row label="APOIO DEMO"><td className="px-2 py-1"><PctInput value={apoioDemoPct} onChange={setApoioDemoPct} /></td><Auto>{eur(c.apoioDemoEur)}</Auto></Row>
                <Row label="DEPRECIAÇÕES"><td className="px-2 py-1"><PctInput value={deprecPct} onChange={setDeprecPct} /></td><Auto>{eur(c.deprecEur)}</Auto></Row>
                <Row label="BÓNUS M"><td className="px-2 py-1"><PctInput value={bonusMPct} onChange={setBonusMPct} /></td><Auto>{eur(c.bonusMEur)}</Auto></Row>
                <Row label="DESC. TOTAL" highlight><Auto strong>{pct(c.descTotalPct)}</Auto><Auto strong>{eur(c.descTotalEur)}</Auto></Row>

                <Row label="RECONDICIONAMENTO"><Dash /><td className="px-2 py-1"><EurInput value={recond} onChange={setRecond} /></td></Row>
                <Row label="OFERTAS"><Dash /><td className="px-2 py-1"><EurInput value={ofertas} onChange={setOfertas} /></td></Row>
                <Row label="PREÇO CUSTO" highlight><Dash /><Auto strong>{eur(c.precoCusto)}</Auto></Row>

                <Row label="PREÇO VENDA"><Dash /><td className="px-2 py-1"><EurInput value={precoVenda} onChange={setPrecoVenda} /></td></Row>
                <Row label="PREÇO VENDA (S/ IVA)"><Dash /><Auto>{eur(c.precoVendaSemIva)}</Auto></Row>
                <Row label="MARGEM" accent><Auto strong>{pct(c.margemPct)}</Auto><Auto strong>{eur(c.margemEur)}</Auto></Row>
              </tbody>
            </table>
          </div>

          {/* Comissão */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-border/50">
                <Row label="MÉDIA MÓVEL">
                  <td className="px-2 py-1">
                    <select value={mediaMovel} onChange={e => setMediaMovel(e.target.value)}
                      className="w-full px-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500">
                      {Object.keys(MEDIA_MOVEL).map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                  <Auto>{pct(c.comissaoRate)}</Auto>
                </Row>
                <Row label="COMISSÃO" accent><Dash /><Auto strong>{eur(c.comissaoEur)}</Auto></Row>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Margens fixas (referência) ── */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#002060] text-white">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Margens Fixas</span>
            {isAdmin ? (
              <button onClick={saveMargens} disabled={savingMargens}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-500 text-black rounded hover:bg-amber-400 disabled:opacity-50 transition-colors">
                <Save className="h-3 w-3" />{savingMargens ? 'A guardar...' : 'Guardar'}
              </button>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-white/60"><Lock className="h-3 w-3" /> só leitura</span>
            )}
          </div>
          <div className="overflow-auto max-h-[78vh]">
            <table className="text-[10px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted">
                  <th className="sticky left-0 z-20 bg-muted px-2 py-1 text-left font-semibold border-b border-r border-border">Modelo</th>
                  {MARGENS_VERSIONS.map(v => (
                    <th key={v} className="px-1.5 py-1 text-center font-semibold text-muted-foreground border-b border-border min-w-[2.4rem]">{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MARGENS_MODELS.map(model => (
                  <tr key={model} className="odd:bg-background even:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-0.5 font-semibold border-r border-border whitespace-nowrap">{model}</td>
                    {MARGENS_VERSIONS.map(ver => {
                      const val = margens[model]?.[ver] ?? '';
                      return (
                        <td key={ver} className="px-0.5 py-0.5 text-center">
                          {isAdmin ? (
                            <input
                              value={val}
                              onChange={e => setCell(model, ver, e.target.value)}
                              inputMode="decimal"
                              className={`w-9 text-center px-0.5 py-0.5 text-[10px] rounded border ${val ? 'bg-amber-100 dark:bg-amber-500/15 border-amber-400/50' : 'bg-transparent border-transparent hover:border-border'} focus:outline-none focus:ring-1 focus:ring-amber-500`}
                            />
                          ) : (
                            <span className={val ? 'text-foreground/80' : 'text-muted-foreground/30'}>{val ? val + '%' : '·'}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border">Valores em % (margem fixa por modelo × versão).</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children, highlight, accent }: { label: string; children: React.ReactNode; highlight?: boolean; accent?: boolean }) {
  return (
    <tr className={accent ? 'bg-amber-500/10' : highlight ? 'bg-muted/40' : ''}>
      <td className={`px-2 py-1 whitespace-nowrap ${highlight || accent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label}</td>
      {children}
    </tr>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500" />
    </div>
  );
}

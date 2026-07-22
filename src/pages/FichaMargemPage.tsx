import { useState, useMemo } from 'react';
import { FileDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import BonusBmwDialog from '@/components/BonusBmwDialog';

/* ── Tradução exata da sheet "Ficha" (Ficha de Margem 3.0) ── */

const MEDIA_MOVEL: Record<string, number> = {
  '0 a 1': 0.05,
  '2 a 3': 0.085,
  '4 ou +': 0.11,
};

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

  // Cabeçalho
  const [natureza, setNatureza] = useState('VN'); // VN (novo, sem matrícula) | VD (usado)
  const [modelo, setModelo] = useState('');
  const [docTipo, setDocTipo] = useState('Proposta'); // Proposta | Contrato (mutuamente exclusivos)
  const [docNum, setDocNum] = useState('');
  const [encChass, setEncChass] = useState('');
  const [pagamento, setPagamento] = useState('');
  const [tipoCliente, setTipoCliente] = useState('Particular'); // Particular | Empresa
  const [matricula, setMatricula] = useState('');
  const [dataMatricula, setDataMatricula] = useState('');
  const isVD = natureza === 'VD';

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
  const [mgFixaPct, setMgFixaPct] = useState('');
  const [mgVarPct, setMgVarPct] = useState('5');
  const [pacPct, setPacPct] = useState('');
  const [apoioFrotaPct, setApoioFrotaPct] = useState('');
  const [apoioDemoPct, setApoioDemoPct] = useState('');
  const [deprec, setDeprec] = useState(''); // valor absoluto em €
  const [bonusMPct, setBonusMPct] = useState('');
  const [apoioLabel, setApoioLabel] = useState(''); // descrição livre do apoio
  const [apoioValor, setApoioValor] = useState(''); // valor absoluto em € (desconto adicional)

  const [mediaMovel, setMediaMovel] = useState('4 ou +');

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
    const deprecEur = num(deprec); // valor absoluto em €
    const deprecPctAuto = base ? deprecEur / base : null;
    const bonusMEur = (num(bonusMPct) / 100) * base;
    const apoioEur = num(apoioValor); // valor absoluto em €, desconto adicional
    const apoioPctAuto = base ? apoioEur / base : null;
    const descTotalEur = mgFixaEur + mgVarEur + pacEur + apoioFrotaEur + apoioDemoEur + deprecEur + bonusMEur + apoioEur;
    const descTotalPct = base ? descTotalEur / base : null;

    const precoCusto = (sumPvbIsv - descTotalEur + _recond + _ofertas) * (1 + iva);
    const precoVendaN = precoVenda === '' ? null : num(precoVenda);
    const precoVendaSemIva = precoVendaN === null ? null : precoVendaN / 1.23;
    const margemEur = precoVendaN === null ? 0 : (precoVendaN - precoCusto) / 1.23;
    const margemPct = base ? margemEur / base : 0;

    const comissaoRate = MEDIA_MOVEL[mediaMovel] ?? null;
    const comissaoEur = comissaoRate === null ? null : comissaoRate * margemEur;

    return {
      opcPctAuto, ivaEur, pvp, mgFixaEur, mgVarEur, pacEur, apoioFrotaEur, apoioDemoEur, deprecEur, deprecPctAuto, bonusMEur,
      apoioEur, apoioPctAuto,
      descTotalEur, descTotalPct, precoCusto, precoVendaSemIva, margemEur, margemPct, comissaoRate, comissaoEur,
    };
  }, [pvb, opc, bsi, eco, legTr, isv, recond, ofertas, precoVenda,
      ivaPct, mgFixaPct, mgVarPct, pacPct, apoioFrotaPct, apoioDemoPct, deprec, bonusMPct, apoioValor, mediaMovel]);

  const meses = useMemo(() => {
    if (!dataMatricula) return '';
    const d = new Date(dataMatricula);
    if (isNaN(d.getTime())) return '';
    const m = Math.round(((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) / 30) * 10) / 10;
    return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(m)} meses`;
  }, [dataMatricula]);

  function limpar() {
    setNatureza('VN');
    setModelo(''); setDocTipo('Proposta'); setDocNum(''); setEncChass(''); setPagamento(''); setTipoCliente('Particular'); setMatricula(''); setDataMatricula('');
    setPvb(''); setOpc(''); setBsi(''); setEco(''); setLegTr(''); setIsv(''); setRecond(''); setOfertas(''); setPrecoVenda('');
    setIvaPct('23'); setMgFixaPct(''); setMgVarPct('5'); setPacPct(''); setApoioFrotaPct(''); setApoioDemoPct(''); setDeprec(''); setBonusMPct('');
    setApoioLabel(''); setApoioValor('');
    setMediaMovel('4 ou +');
    toast.success('Ficha limpa.');
  }

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
      ['DEPRECIAÇÕES', pct(c.deprecPctAuto), eur(c.deprecEur)],
      ['BÓNUS M', (bonusMPct || '0') + ' %', eur(c.bonusMEur)],
      [apoioLabel.trim() ? `APOIO — ${apoioLabel.trim()}` : 'APOIO', pct(c.apoioPctAuto), eur(c.apoioEur)],
      ['DESC. TOTAL', pct(c.descTotalPct), eur(c.descTotalEur)],
      ['RECONDICIONAMENTO', '-', eur(num(recond))],
      ['OFERTAS', '-', eur(num(ofertas))],
      ['PREÇO CUSTO', '-', eur(c.precoCusto)],
      ['PREÇO VENDA', '-', precoVenda === '' ? '—' : eur(num(precoVenda))],
      ['PREÇO VENDA (S/ IVA)', '-', eur(c.precoVendaSemIva)],
      ['MARGEM', pct(c.margemPct), eur(c.margemEur)],
    ];
    if (!isVD) {
      rows.push(['MÉDIA MÓVEL', pct(c.comissaoRate), mediaMovel]);
      rows.push(['COMISSÃO', '-', eur(c.comissaoEur)]);
    }
    const strongRows = new Set(['PVP', 'DESC. TOTAL', 'PREÇO CUSTO', 'MARGEM', 'COMISSÃO']);
    // Grupos com um separador antes para dar respiração à tabela numa folha A4.
    const groupStart = new Set(['MG. FIXA', 'RECONDICIONAMENTO', 'PREÇO VENDA', 'MÉDIA MÓVEL']);
    const body = rows.map(([l, p, e]) => {
      const cls = [strongRows.has(l) ? 'strong' : '', groupStart.has(l) ? 'sep' : ''].filter(Boolean).join(' ');
      return `<tr${cls ? ` class="${cls}"` : ''}><td class="lbl">${esc(l)}</td><td class="pct">${esc(p)}</td><td class="eur">${esc(e)}</td></tr>`;
    }).join('');
    const infoPairs: [string, string][] = [['NATUREZA', natureza], ['MODELO', modelo], [docTipo.toUpperCase(), docNum], ['ENC / CHASS', encChass], ['PAGAMENTO', pagamento], ['TIPO', tipoCliente]];
    if (isVD) { infoPairs.push(['MATRÍCULA', matricula], ['DATA MATRÍCULA', dataMatricula], ['IDADE', meses]); }
    const info = infoPairs.map(([k, v]) => `<div class="cell"><span class="k">${esc(k)}</span><span class="v">${esc(v || '—')}</span></div>`).join('');
    const vdMsg = isVD ? '<p class="note">Ver com João Duarte, o melhor chefe do mundo! :)</p>' : '';
    const dataHoje = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

    const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"/><title>Ficha_Margem_${esc(docNum || modelo || '')}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:11px;line-height:1.35}
  .sheet{max-width:150mm;margin:0 auto;padding:14mm 12mm}
  header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #002060;padding-bottom:6px;margin-bottom:12px}
  h1{font-size:17px;margin:0;color:#002060;letter-spacing:.3px}
  .date{font-size:10px;color:#6b7280}
  .info{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 18px;margin-bottom:14px}
  .info .cell{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted #d1d5db;padding-bottom:2px}
  .info .k{color:#6b7280;text-transform:uppercase;font-size:9px;letter-spacing:.4px}
  .info .v{font-weight:600;text-align:right}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  col.c-lbl{width:52%}col.c-pct{width:20%}col.c-eur{width:28%}
  th{background:#002060;color:#fff;padding:5px 8px;font-size:10px;letter-spacing:.4px;text-transform:uppercase}
  th.lbl{text-align:left}th.pct,th.eur{text-align:right}
  td{padding:3px 8px;border-bottom:1px solid #eef1f5}
  td.lbl{text-align:left;color:#374151}
  td.pct{text-align:right;color:#6b7280;font-variant-numeric:tabular-nums}
  td.eur{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tbody tr:nth-child(even){background:#fafbfc}
  tr.sep td{border-top:1px solid #c7ccd6}
  tr.strong td{font-weight:700;background:#eef2ff!important;color:#111827}
  tr.strong td.lbl{color:#002060}
  .note{margin-top:14px;padding:8px 10px;font-weight:700;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:4px;text-align:center}
  @page{size:A4 portrait;margin:0}
</style></head><body>
<div class="sheet">
  <header><h1>Ficha de Margem</h1><span class="date">${esc(dataHoje)}</span></header>
  <div class="info">${info}</div>
  <table>
    <colgroup><col class="c-lbl"/><col class="c-pct"/><col class="c-eur"/></colgroup>
    <thead><tr><th class="lbl">Rúbrica</th><th class="pct">%</th><th class="eur">€</th></tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${vdMsg}
</div>
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
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-end gap-2">
        <BonusBmwDialog onApply={rate => {
          setMgFixaPct(String(Math.round(rate * 1000) / 10));
          toast.success(`MG. FIXA preenchida: ${pct(rate)}`);
        }} />
        <button onClick={limpar} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> Limpar
        </button>
        <button onClick={exportPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
          <FileDown className="h-3.5 w-3.5" /> Exportar PDF
        </button>
      </div>

      <div className="space-y-4">
          {/* Cabeçalho (condensado) */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-1 bg-[#002060] text-white text-[10px] font-semibold uppercase tracking-wide">Identificação</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5">
              <div>
                <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">NATUREZA</label>
                <select value={natureza} onChange={e => setNatureza(e.target.value)}
                  className="w-full px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="VN">VN</option>
                  <option value="VD">VD</option>
                </select>
              </div>
              <Field label="MODELO" value={modelo} onChange={setModelo} />
              <div>
                <div className="mb-0.5 flex rounded overflow-hidden border border-border">
                  {['Proposta', 'Contrato'].map(t => (
                    <button key={t} type="button" onClick={() => setDocTipo(t)}
                      className={`flex-1 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide transition-colors ${
                        docTipo === t ? 'bg-[#002060] text-white' : 'text-muted-foreground hover:bg-muted'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
                <input value={docNum} onChange={e => setDocNum(e.target.value)}
                  placeholder={`Nº ${docTipo.toLowerCase()}`}
                  className="w-full px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500" />
              </div>
              <Field label="ENC / CHASS" value={encChass} onChange={setEncChass} />
              <div>
                <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">PAGAMENTO</label>
                <select value={pagamento} onChange={e => setPagamento(e.target.value)}
                  className="w-full px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="">—</option>
                  <option value="BMW FS">BMW FS</option>
                  <option value="Financiamento Interno">Financiamento Interno</option>
                  <option value="Financiamento Externo">Financiamento Externo</option>
                  <option value="Pronto Pagamento">Pronto Pagamento</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">TIPO</label>
                <select value={tipoCliente} onChange={e => setTipoCliente(e.target.value)}
                  className="w-full px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500">
                  <option value="Particular">Particular</option>
                  <option value="Empresa">Empresa</option>
                </select>
              </div>
              {isVD && <Field label="MATRÍCULA" value={matricula} onChange={setMatricula} />}
              {isVD && (
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">DATA MATRÍCULA</label>
                  <input type="date" value={dataMatricula} onChange={e => setDataMatricula(e.target.value)}
                    className="w-full px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500" />
                </div>
              )}
              {isVD && (
                <div>
                  <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">IDADE</label>
                  <div className="px-2 py-0.5 text-[11px] rounded bg-muted border border-border text-foreground/80">{meses || '—'}</div>
                </div>
              )}
            </div>
          </div>

          {/* Rúbricas */}
          <div className="rounded-lg border border-border overflow-x-auto">
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
                <Row label="DEPRECIAÇÕES"><Auto>{pct(c.deprecPctAuto)}</Auto><td className="px-2 py-1"><EurInput value={deprec} onChange={setDeprec} /></td></Row>
                <Row label="BÓNUS M"><td className="px-2 py-1"><PctInput value={bonusMPct} onChange={setBonusMPct} /></td><Auto>{eur(c.bonusMEur)}</Auto></Row>
                <tr>
                  <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>APOIO</span>
                      <input value={apoioLabel} onChange={e => setApoioLabel(e.target.value)} placeholder="descrição" size={1}
                        className="flex-1 min-w-0 px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    </div>
                  </td>
                  <Auto>{pct(c.apoioPctAuto)}</Auto>
                  <td className="px-2 py-1"><EurInput value={apoioValor} onChange={setApoioValor} /></td>
                </tr>
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

          {/* Comissão — apenas para VN */}
          {isVD ? (
            <div className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Ver com João Duarte, o melhor chefe do mundo! :)</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
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
          )}
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
      <label className="block text-[9px] font-medium text-muted-foreground mb-0.5">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500" />
    </div>
  );
}

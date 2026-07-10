import { useState, useMemo } from 'react';

/* ── Tradução exata da sheet "Ficha" (Ficha de Margem 3.0) ──
   Células editáveis (a amarelo) = inputs; automáticas = fórmulas. */

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

/* Inputs */
function EurInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
      className="w-full text-right px-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
      placeholder="0,00"
    />
  );
}
function PctInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-right pr-5 pl-2 py-1 text-xs rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60 text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
        placeholder="0"
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">%</span>
    </div>
  );
}

const num = (s: string) => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; };

export default function FichaMargemPage() {
  // Cabeçalho
  const [modelo, setModelo] = useState('');
  const [proposta, setProposta] = useState('');
  const [encChass, setEncChass] = useState('');
  const [matricula, setMatricula] = useState('');
  const [dataMatricula, setDataMatricula] = useState('');

  // Rúbricas (€) — editáveis
  const [pvb, setPvb] = useState('');
  const [opc, setOpc] = useState('');
  const [bsi, setBsi] = useState('');
  const [eco, setEco] = useState('');
  const [legTr, setLegTr] = useState('');
  const [isv, setIsv] = useState('');
  const [recond, setRecond] = useState('');
  const [ofertas, setOfertas] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');

  // Percentagens (%) — editáveis (em unidades de percentagem, ex.: 23 = 23%)
  const [ivaPct, setIvaPct] = useState('23');
  const [mgFixaPct, setMgFixaPct] = useState('7');
  const [mgVarPct, setMgVarPct] = useState('5');
  const [pacPct, setPacPct] = useState('');
  const [apoioFrotaPct, setApoioFrotaPct] = useState('');
  const [apoioDemoPct, setApoioDemoPct] = useState('9');
  const [deprecPct, setDeprecPct] = useState('');
  const [bonusMPct, setBonusMPct] = useState('');

  const [mediaMovel, setMediaMovel] = useState('4 ou +');

  const c = useMemo(() => {
    const _pvb = num(pvb), _opc = num(opc), _bsi = num(bsi), _eco = num(eco), _legTr = num(legTr), _isv = num(isv);
    const _recond = num(recond), _ofertas = num(ofertas);
    const iva = num(ivaPct) / 100;

    const base = _pvb + _opc;                                   // SUM(E10:E11)
    const sumPvbIsv = _pvb + _opc + _bsi + _eco + _legTr + _isv; // SUM(E10:E15)
    const opcPctAuto = _pvb ? _opc / _pvb : null;               // D11

    const ivaEur = sumPvbIsv * iva;                             // E16
    const pvp = sumPvbIsv + ivaEur;                             // E17

    const mgFixaEur = (num(mgFixaPct) / 100) * base;
    const mgVarEur = (num(mgVarPct) / 100) * base;
    const pacEur = (num(pacPct) / 100) * base;
    const apoioFrotaEur = (num(apoioFrotaPct) / 100) * base;
    const apoioDemoEur = (num(apoioDemoPct) / 100) * base;
    const deprecEur = (num(deprecPct) / 100) * base;
    const bonusMEur = (num(bonusMPct) / 100) * base;
    const descTotalEur = mgFixaEur + mgVarEur + pacEur + apoioFrotaEur + apoioDemoEur + deprecEur + bonusMEur; // E25
    const descTotalPct = base ? descTotalEur / base : null;    // D25

    const precoCusto = (sumPvbIsv - descTotalEur + _recond + _ofertas) * (1 + iva); // E28
    const precoVendaN = precoVenda === '' ? null : num(precoVenda);
    const precoVendaSemIva = precoVendaN === null ? null : precoVendaN / 1.23;       // E30
    const margemEur = precoVendaN === null ? 0 : (precoVendaN - precoCusto) / 1.23;   // E31
    const margemPct = base ? margemEur / base : 0;              // D31

    const comissaoRate = MEDIA_MOVEL[mediaMovel] ?? null;      // E33
    const comissaoEur = comissaoRate === null ? null : comissaoRate * margemEur; // E34

    return {
      opcPctAuto, ivaEur, pvp,
      mgFixaEur, mgVarEur, pacEur, apoioFrotaEur, apoioDemoEur, deprecEur, bonusMEur,
      descTotalEur, descTotalPct, precoCusto, precoVendaSemIva, margemEur, margemPct,
      comissaoRate, comissaoEur,
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

  /* Célula automática (€ ou %) */
  const Auto = ({ children, strong }: { children: React.ReactNode; strong?: boolean }) => (
    <td className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${strong ? 'font-bold text-foreground' : 'text-foreground/80'}`}>{children}</td>
  );
  const Dash = () => <td className="px-2 py-1 text-right text-muted-foreground/50">-</td>;

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Ficha de Margem</h1>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100 dark:bg-amber-500/15 border border-amber-400/60" /> Editável</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted border border-border" /> Automática</span>
        </div>
      </div>

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

      {/* Tabela de rúbricas */}
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

      <p className="text-[10px] text-muted-foreground">
        As percentagens de margem/apoios seguem a referência de <strong>margens fixas</strong> por modelo/versão do ficheiro original.
        Preenche as células a amarelo; as restantes são calculadas automaticamente.
      </p>
    </div>
  );
}

/* Linha da tabela: label + 2 células (% e €) */
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

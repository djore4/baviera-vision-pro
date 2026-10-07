import { useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import {
  analisePvp, calcIsv, custosTotais, idadeEmMeses, pvpParaMargem,
  type Combustivel, type Homologacao, type RegimeIva,
} from '@/lib/importacao';
import { ISV_2026 } from '@/lib/importacao-isv-tables';

const eur = (v: number | null) =>
  v === null || !isFinite(v) ? '—'
    : new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' €';
const pct = (v: number | null) =>
  v === null || !isFinite(v) ? '—'
    : new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v * 100) + ' %';
const num = (s: string) => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; };
const numOrNull = (s: string) => (s.trim() === '' ? null : num(s));

const inputCls = 'w-full px-2 py-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-muted-foreground mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-muted-foreground/80 mt-0.5">{hint}</span>}
    </label>
  );
}

function Num({ value, onChange, placeholder = '0,00', suffix }: { value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string }) {
  return (
    <div className="relative">
      <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className={`${inputCls} text-right ${suffix ? 'pr-8' : ''}`} />
      {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <h2 className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40 border-b border-border">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 text-sm ${strong ? 'font-semibold border-t border-border mt-1 pt-2' : ''} ${muted ? 'text-muted-foreground' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

const INICIAL = {
  modelo: '', combustivel: 'gasolina' as Combustivel, homologacao: 'WLTP' as Homologacao,
  cc: '', co2: '', matricula: '', particulas: false, ambientalManual: '', isvManual: '',
  compra: '', transporte: '', dav: '', inspecao: '', registo: '', outrosLeg: '',
  preparacao: '', outros: '', regime: 'margem' as RegimeIva, iva: '23',
  margemAlvo: '10', pvpMercado: '',
};

export default function ImportacaoPage() {
  const [f, setF] = useState(INICIAL);
  const set = <K extends keyof typeof INICIAL>(k: K, v: (typeof INICIAL)[K]) => setF(prev => ({ ...prev, [k]: v }));

  const isEletrico = f.combustivel === 'eletrico';
  const isDiesel = f.combustivel === 'diesel';

  const isv = useMemo(() => calcIsv({
    combustivel: f.combustivel,
    homologacao: f.homologacao,
    cilindradaCc: num(f.cc),
    co2GKm: num(f.co2),
    primeiraMatricula: f.matricula,
    dieselParticulasAcima: isDiesel && f.particulas,
    ambientalManual: numOrNull(f.ambientalManual),
    totalManual: numOrNull(f.isvManual),
  }), [f, isDiesel]);

  const legalizacao = num(f.dav) + num(f.inspecao) + num(f.registo) + num(f.outrosLeg);

  const op = useMemo(() => ({
    compra: num(f.compra), transporte: num(f.transporte), legalizacao,
    preparacao: num(f.preparacao), outros: num(f.outros), isv: isv.total,
    regime: f.regime, ivaPct: num(f.iva),
  }), [f, legalizacao, isv.total]);

  const custos = custosTotais(op);
  const margemAlvo = num(f.margemAlvo) / 100;
  const pvpSugerido = pvpParaMargem(op, margemAlvo);
  const sugerido = analisePvp(op, pvpSugerido);
  const temMercado = f.pvpMercado.trim() !== '';
  const mercado = analisePvp(op, num(f.pvpMercado));
  const meses = idadeEmMeses(f.matricula);
  const semCusto = custos.total <= 0;

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Importação</h1>
          <p className="text-xs text-muted-foreground">
            Simulador de importação de usados da UE: do preço de compra ao preço de venda em Portugal e à rentabilidade teórica.
          </p>
        </div>
        <button onClick={() => setF(INICIAL)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors shrink-0">
          <RotateCcw className="h-3.5 w-3.5" /> Limpar
        </button>
      </div>

      {!ISV_2026.verified && (
        <div role="alert" className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p>
            <strong>Tabelas de ISV {ISV_2026.ano} por validar.</strong> A componente de cilindrada e a redução por idade ainda não foram
            conferidas com a lei, e a tabela de CO₂ não está carregada: a componente ambiental tem de ser introduzida à mão (Simulador ISV da AT).
            Trata o ISV como estimativa até estar validado.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-4">
          <Card title="1. Viatura">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-3">
                <Field label="Marca / modelo (opcional)">
                  <input value={f.modelo} onChange={e => set('modelo', e.target.value)} className={inputCls} placeholder="ex.: BMW 320d Touring" />
                </Field>
              </div>
              <Field label="Propulsão">
                <select value={f.combustivel} onChange={e => set('combustivel', e.target.value as Combustivel)} className={inputCls}>
                  <option value="gasolina">Gasolina (inclui híbrido)</option>
                  <option value="diesel">Diesel (inclui híbrido)</option>
                  <option value="phev">Híbrido plug-in</option>
                  <option value="eletrico">Elétrico</option>
                </select>
              </Field>
              <Field label="Homologação CO₂">
                <select value={f.homologacao} onChange={e => set('homologacao', e.target.value as Homologacao)} className={inputCls} disabled={isEletrico}>
                  <option value="WLTP">WLTP</option>
                  <option value="NEDC">NEDC</option>
                </select>
              </Field>
              <Field label="1.ª matrícula" hint={meses === null ? 'Define a redução por idade' : `${Math.floor(meses / 12)} anos e ${meses % 12} meses`}>
                <input type="month" value={f.matricula} onChange={e => set('matricula', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Cilindrada">
                <Num value={f.cc} onChange={v => set('cc', v)} placeholder="0" suffix="cm³" />
              </Field>
              <Field label="Emissões CO₂">
                <Num value={f.co2} onChange={v => set('co2', v)} placeholder="0" suffix="g/km" />
              </Field>
              {isDiesel && (
                <label className="flex items-center gap-2 text-xs self-end pb-2">
                  <input type="checkbox" checked={f.particulas} onChange={e => set('particulas', e.target.checked)} />
                  Partículas acima do limite (+{ISV_2026.agravamentoParticulas} €)
                </label>
              )}
            </div>
          </Card>

          <Card title="2. Compra e custos de importação">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Preço de compra" hint={f.regime === 'margem' ? 'Com IVA do país de origem (não dedutível)' : 'Sem IVA'}>
                <Num value={f.compra} onChange={v => set('compra', v)} suffix="€" />
              </Field>
              <Field label="Transporte da viatura">
                <Num value={f.transporte} onChange={v => set('transporte', v)} suffix="€" />
              </Field>
              <Field label="Preparação / recondicionamento">
                <Num value={f.preparacao} onChange={v => set('preparacao', v)} suffix="€" />
              </Field>
            </div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mt-4 mb-2">Legalização</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="DAV / certificado"><Num value={f.dav} onChange={v => set('dav', v)} suffix="€" /></Field>
              <Field label="Inspeção (IPO)"><Num value={f.inspecao} onChange={v => set('inspecao', v)} suffix="€" /></Field>
              <Field label="Registo e matrícula"><Num value={f.registo} onChange={v => set('registo', v)} suffix="€" /></Field>
              <Field label="Outros (COC, despachante…)"><Num value={f.outrosLeg} onChange={v => set('outrosLeg', v)} suffix="€" /></Field>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              <Field label="Outros custos"><Num value={f.outros} onChange={v => set('outros', v)} suffix="€" /></Field>
            </div>
          </Card>

          <Card title="3. ISV">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="ISV ambiental (CO₂) à mão" hint={isv.ambientalEmFalta ? 'Obrigatório: tabela de CO₂ não carregada' : 'Opcional: substitui o cálculo'}>
                <Num value={f.ambientalManual} onChange={v => set('ambientalManual', v)} suffix="€" />
              </Field>
              <Field label="ISV total à mão" hint="Opcional: substitui todo o cálculo (ex.: valor da AT)">
                <Num value={f.isvManual} onChange={v => set('isvManual', v)} suffix="€" />
              </Field>
            </div>
            {isv.manual ? (
              <Row label="ISV (introduzido à mão)" value={eur(isv.total)} strong />
            ) : isEletrico ? (
              <Row label="Elétrico: isento de ISV" value={eur(0)} strong />
            ) : (
              <>
                <Row label="Componente cilindrada" value={eur(isv.cilindrada)} />
                <Row label="Componente ambiental (CO₂)" value={isv.ambientalEmFalta ? 'em falta' : eur(isv.ambiental)} />
                {isv.reducaoIdadePct > 0 && <Row label={`Redução por idade (${pct(isv.reducaoIdadePct)})`} value={`− ${eur(isv.reducaoIdade)}`} muted />}
                {isv.agravamento > 0 && <Row label="Agravamento partículas" value={eur(isv.agravamento)} />}
                {isv.reducaoPhev > 0 && <Row label={`Desconto híbrido plug-in (${pct(ISV_2026.phevReducao)})`} value={`− ${eur(isv.reducaoPhev)}`} muted />}
                <Row label="ISV a pagar" value={eur(isv.total)} strong />
              </>
            )}
            {isv.ambientalEmFalta && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Falta a componente ambiental: o ISV e a rentabilidade abaixo estão subavaliados até a preencheres.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-2 self-start">
          <Card title="4. Venda em Portugal">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Regime de IVA" hint={f.regime === 'margem' ? 'IVA só sobre a margem' : 'IVA sobre o PVP todo'}>
                <select value={f.regime} onChange={e => set('regime', e.target.value as RegimeIva)} className={inputCls}>
                  <option value="margem">Regime de margem</option>
                  <option value="normal">Regime normal</option>
                </select>
              </Field>
              <Field label="Taxa de IVA"><Num value={f.iva} onChange={v => set('iva', v)} placeholder="23" suffix="%" /></Field>
              <Field label="Margem alvo" hint="Sobre o custo total">
                <Num value={f.margemAlvo} onChange={v => set('margemAlvo', v)} placeholder="10" suffix="%" />
              </Field>
              <Field label="PVP de mercado" hint="Opcional: testa um preço real">
                <Num value={f.pvpMercado} onChange={v => set('pvpMercado', v)} suffix="€" />
              </Field>
            </div>
          </Card>

          <Card title="Custo total de entrada">
            <Row label="Compra" value={eur(custos.compra)} />
            <Row label="ISV" value={eur(custos.isv)} />
            <Row label="Transporte" value={eur(custos.transporte)} />
            <Row label="Legalização" value={eur(custos.legalizacao)} />
            {custos.preparacao > 0 && <Row label="Preparação" value={eur(custos.preparacao)} />}
            {custos.outros > 0 && <Row label="Outros" value={eur(custos.outros)} />}
            <Row label="Custo total" value={eur(custos.total)} strong />
          </Card>

          <Card title="Preço de venda sugerido">
            {semCusto ? (
              <p className="text-xs text-muted-foreground">Introduz o preço de compra para calcular.</p>
            ) : (
              <>
                <div className="text-center py-1">
                  <div className="text-2xl font-bold text-foreground tabular-nums">{eur(pvpSugerido)}</div>
                  <div className="text-[11px] text-muted-foreground">PVP para {pct(margemAlvo)} de margem sobre o custo</div>
                </div>
                <Row label="IVA incluído" value={eur(sugerido.iva)} muted />
                <Row label="Receita líquida" value={eur(sugerido.receitaLiquida)} />
                <Row label="Margem" value={`${eur(sugerido.margemEur)} (${pct(sugerido.margemPctVenda)} da venda)`} strong />
              </>
            )}
          </Card>

          {temMercado && !semCusto && (
            <Card title="Rentabilidade ao PVP de mercado">
              <Row label="PVP" value={eur(mercado.pvp)} />
              <Row label="IVA incluído" value={eur(mercado.iva)} muted />
              <Row label="Receita líquida" value={eur(mercado.receitaLiquida)} />
              <Row label="Custo total" value={eur(custos.total)} muted />
              <div className={`mt-2 rounded px-3 py-2 text-center ${mercado.margemEur >= 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                <div className="text-xl font-bold tabular-nums">{eur(mercado.margemEur)}</div>
                <div className="text-[11px]">{pct(mercado.margemPctCusto)} sobre o custo · {pct(mercado.margemPctVenda)} da venda</div>
              </div>
            </Card>
          )}

          <p className="text-[10px] text-muted-foreground leading-snug">
            Rentabilidade teórica antes de financiamento, IUC, garantia, comissões e custo de imobilização do stock.
          </p>
        </div>
      </div>
    </div>
  );
}

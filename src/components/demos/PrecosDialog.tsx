import { useMemo, useState } from 'react';
import { Archive, Loader2, Save, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { calcPricing, tipoFlags, type PricingInputs, type Tipo } from '@/lib/demoPricing';
import { MARCAS, TIPOS_NEGOCIO } from '@/lib/viaturasFiltros';
import { matriculaCompacta, normalizarMatricula } from '@/lib/viaturaFormat';
import { PRICE_FIELDS, toFieldText, fromFieldText, type Kind } from '@/lib/precoCampos';
import { calcularEscalao30 } from '@/lib/escaloes30';
import { descontoMaxPara, descMaxAplicavel, descMaxAcumulado, INCORPORACAO_OPCIONAIS, type DescMax } from '@/lib/descontosMax';

/* ── Janela da viatura (gestão de preços pelo responsável local) ──────────────
 * Mesma mecânica da gestão VD da plataforma Caetano: 0. identificação (só leitura) e escalões
 * de 30 dias desde a matrícula; descontos máximos do modelo; 1. estrutura base, 2. descontos,
 * 3. apuramento do PVP e da margem, com o cálculo em direto. As fórmulas são as do Excel
 * "PARQUE BMW" (lib/demoPricing.ts): o preço de custo NÃO inclui o BSI.
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
  { key: 'mgb', label: 'MGB · MG fixa', hint: 'Margem fixa', kind: 'pct' },
  { key: 'esf', label: 'ESF · MG var.', hint: 'Margem variável', kind: 'pct' },
  { key: 'pac', label: 'PAC', kind: 'pct' },
  { key: 'dem', label: 'DEM · Apoio dem.', hint: 'Apoio demonstração', kind: 'pct' },
  { key: 'sup', label: 'SUP · Apoio sup.', hint: 'Apoio suplementar', kind: 'pct' },
];
const FIM: FieldDef[] = [
  { key: 'depreciacoes', label: 'DEP', hint: 'Depreciações (€)', kind: 'eur' },
  { key: 'pvp_desc', label: 'PVP Desc / Final', hint: 'Preço de venda com IVA (€)', kind: 'eur' },
];

const eur = (n: number) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const perc = (n: number) => (n * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

export interface VeiculoPrecos {
  chassis: string;
  titulo: string;
  matricula: string;
  local: string;
  encomenda: string | null;
  dataMatricula: string | null;
  kms: number | null;
  modelo: string | null;
  versao: string | null;
  estadoEntrega: string | null;
}

/** Modo "nova viatura": a identificação edita-se aqui e grava por demos_criar_viatura(). */
export interface NovaViaturaConfig {
  /** Concessões que a pessoa pode escolher (administrador: todas; restantes: as suas). */
  locais: string[];
  /** Modelos conhecidos, para sugerir. */
  modelos: string[];
  chassisExistentes: string[];
  /** Matrículas existentes, sem hífenes. */
  matriculasExistentes: string[];
}

export interface PrecosDialogProps {
  /** Viatura existente (modo edição). */
  veiculo?: VeiculoPrecos;
  nova?: NovaViaturaConfig;
  inputs: PricingInputs;
  /** Obrigatório em modo edição; em "nova" deriva-se da tecnologia escolhida. */
  tipo?: Tipo;
  onClose: () => void;
  /** Valores gravados (só os campos alterados). */
  onSaved?: (inputs: Partial<PricingInputs>) => void;
  /** Viatura criada (linha completa devolvida pela base de dados). */
  onCriada?: (row: Record<string, unknown>) => void;
  /** Abre o cartão da viatura (foto de capa, partilhar, copiar resumo). */
  onAbrirCartao?: () => void;
  /** Arquiva a viatura como vendida (pede confirmação e fecha a janela se correr bem). */
  onArquivar?: () => Promise<void>;
}

const TECNOLOGIAS = ['ICE', 'BEV', 'PHEV', 'M'];

interface Ident {
  encomenda: string; chassis: string; matricula: string; dataMatricula: string; kms: string;
  modelo: string; versao: string; estadoEntrega: string; negocio: string; marca: string;
  tipologia: string[]; locais: string[]; iva: boolean; linkFotos: string;
}
const IDENT_VAZIA: Ident = {
  encomenda: '', chassis: '', matricula: '', dataMatricula: '', kms: '', modelo: '', versao: '', estadoEntrega: '',
  negocio: 'VD', marca: 'BMW', tipologia: [], locais: [], iva: false, linkFotos: '',
};

export default function PrecosDialog({ veiculo, nova, inputs, tipo: tipoProp, onClose, onSaved, onCriada, onAbrirCartao, onArquivar }: PrecosDialogProps) {
  const [ident, setIdent] = useState<Ident>(() => ({ ...IDENT_VAZIA, locais: nova && nova.locais.length === 1 ? [nova.locais[0]] : [] }));
  const setI = <K extends keyof Ident>(k: K, v: Ident[K]) => setIdent(p => ({ ...p, [k]: v }));
  const tipo: Tipo = nova ? tipoFlags(ident.tipologia) : tipoProp!;
  const ver: VeiculoPrecos = nova
    ? { chassis: ident.chassis, titulo: 'Nova viatura', matricula: ident.matricula, local: ident.locais.join(', '), encomenda: ident.encomenda,
        dataMatricula: ident.dataMatricula || null, kms: ident.kms ? Number(ident.kms) : null, modelo: ident.modelo, versao: ident.versao, estadoEntrega: ident.estadoEntrega }
    : veiculo!;
  const chassis = ver.chassis;
  const [arquivando, setArquivando] = useState(false);
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
  const identSuja = nova ? JSON.stringify(ident) !== JSON.stringify({ ...IDENT_VAZIA, locais: nova.locais.length === 1 ? [nova.locais[0]] : [] }) : false;
  const sujo = nChanged > 0 || identSuja;

  const live = useMemo(() => {
    const cur = { ...inputs } as PricingInputs;
    PRICE_FIELDS.forEach(k => { const v = parsed[k]; if (v !== null) cur[k] = v; });
    return calcPricing(cur, tipo);
  }, [parsed, inputs, tipo]);

  const tryClose = () => {
    if (sujo && !window.confirm(nova ? 'Tens dados por gravar. Fechar e perdê-los?' : 'Tens alterações por gravar. Fechar e perdê-las?')) return;
    onClose();
  };

  /** Erros de identificação em falta/inválida (só modo "nova"). */
  const errosIdent = (): string[] => {
    if (!nova) return [];
    const e: string[] = [];
    if (!ident.encomenda.trim()) e.push('Encomenda');
    if (!ident.chassis.trim()) e.push('Chassis');
    if (!ident.matricula.trim() || !normalizarMatricula(ident.matricula)) e.push('Matrícula (AA-00-BB)');
    if (!ident.modelo.trim()) e.push('Modelo');
    if (!ident.versao.trim()) e.push('Versão');
    if (ident.locais.length === 0) e.push('Concessão');
    if (ident.kms && !/^\d+$/.test(ident.kms)) e.push('Quilómetros');
    return e;
  };

  async function criar() {
    if (!nova) return;
    const faltas = errosIdent();
    if (faltas.length > 0) { toast.error(`Preenche: ${faltas.join(', ')}.`); return; }
    if (invalid.length > 0) { toast.error(`Valor inválido em ${invalid.map(f => f.label).join(', ')}.`); return; }
    const ch = ident.chassis.trim().toUpperCase();
    const mat = normalizarMatricula(ident.matricula)!;
    if (nova.chassisExistentes.some(c => c.toUpperCase() === ch)) { toast.error(`O chassis ${ch} já existe no parque.`); return; }
    if (nova.matriculasExistentes.includes(matriculaCompacta(mat))) { toast.error(`A matrícula ${mat} já está associada a outra viatura.`); return; }
    setSaving(true);
    try {
      const todos: Partial<PricingInputs> = {};
      PRICE_FIELDS.forEach(k => { todos[k] = parsed[k] ?? 0; });
      const { data, error } = await supabase.rpc('demos_criar_viatura', { p: {
        chassis: ch, matricula: mat, encomenda: ident.encomenda.trim(), modelo: ident.modelo.trim(), versao: ident.versao.trim(),
        estado_negocio: ident.negocio, marca: ident.marca, tipologia: ident.tipologia, local: ident.locais,
        data_matricula: ident.dataMatricula || null, kms: ident.kms || null, estado_entrega: ident.estadoEntrega.trim() || null,
        link_fotos: ident.linkFotos.trim() || null, iva_dedutivel: ident.iva, inputs: todos,
      } as never });
      if (error) throw error;
      toast.success('Viatura adicionada.');
      onCriada?.(data as Record<string, unknown>);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      toast.error(e.code === '42501' ? 'Sem permissão para adicionar viaturas neste local.' : (e.message ?? 'Não foi possível adicionar a viatura.'));
    } finally {
      setSaving(false);
    }
  }

  async function gravar() {
    if (nova) { await criar(); return; }
    if (invalid.length > 0) { toast.error(`Valor inválido em ${invalid.map(f => f.label).join(', ')}.`); return; }
    if (nChanged === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('demos_gravar_precos', { p_chassis: chassis, p_inputs: changed as never });
      if (error) throw error;
      toast.success('Preços gravados.');
      onSaved?.(changed);
    } catch (err) {
      const e = err as { message?: string; code?: string };
      toast.error(e.code === '42501' ? 'Sem permissão para gerir os preços desta viatura.' : `Não foi possível gravar: ${e.message ?? 'erro desconhecido'}`);
    } finally {
      setSaving(false);
    }
  }

  async function arquivar() {
    if (!onArquivar) return;
    setArquivando(true);
    try { await onArquivar(); } finally { setArquivando(false); }
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
  const escalao = calcularEscalao30(ver.dataMatricula);
  const identLeitura: [string, string][] = [
    ['Encomenda', ver.encomenda || '—'],
    ['Chassis', ver.chassis],
    ['Matrícula', ver.matricula || '—'],
    ['Data matrícula', ver.dataMatricula ? new Date(ver.dataMatricula).toLocaleDateString('pt-PT') : '—'],
    ['Quilómetros', (ver.kms ?? 0).toLocaleString('pt-PT')],
    ['Modelo', ver.modelo || '—'],
    ['Versão', ver.versao || '—'],
    ['Estado entrega', ver.estadoEntrega || '—'],
  ];
  const campo = (rotulo: string, key: keyof Ident, opts?: { type?: string; list?: string; placeholder?: string; upper?: boolean; span?: string; obrig?: boolean }) => (
    <label key={key} className={`block ${opts?.span ?? ''}`}>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{rotulo}{opts?.obrig && <span className="text-destructive"> *</span>}</span>
      <input
        type={opts?.type ?? 'text'} list={opts?.list} placeholder={opts?.placeholder}
        value={String(ident[key] ?? '')} onChange={e => setI(key, e.target.value as never)}
        className={`w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary ${opts?.upper ? 'uppercase' : ''}`}
      />
    </label>
  );
  const botoes = (rotulo: string, opcoes: readonly string[], on: (o: string) => boolean, toggle: (o: string) => void) => (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{rotulo}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={rotulo}>
        {opcoes.map(o => (
          <button
            key={o} type="button" aria-pressed={on(o)} onClick={() => toggle(o)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${on(o) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-background text-muted-foreground border-border hover:text-brand-primary hover:border-brand-primary'}`}
          >{o}</button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={o => { if (!o) tryClose(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border bg-muted/30 text-left pr-12">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black leading-tight">{ver.titulo}</DialogTitle>
              <DialogDescription className="font-mono text-xs uppercase">
                {nova ? 'Identificação, preços e parametrização' : `${ver.matricula} · ${ver.local}`}
              </DialogDescription>
            </div>
            {onAbrirCartao && (
              <button
                type="button" onClick={onAbrirCartao}
                title="Cartão da viatura: foto de capa, partilhar e copiar resumo"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
              >
                <Share2 className="h-3.5 w-3.5" /> Cartão / partilhar
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4">
          <section className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest">0. Identificação da viatura</h3>
            {nova ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {campo('Encomenda', 'encomenda', { obrig: true })}
                  {campo('Chassis', 'chassis', { obrig: true, upper: true })}
                  {campo('Matrícula', 'matricula', { obrig: true, upper: true, placeholder: 'AA-00-BB' })}
                  {campo('Data matrícula', 'dataMatricula', { type: 'date' })}
                  {campo('Quilómetros', 'kms', { type: 'number', placeholder: 'Ex: 0' })}
                  {campo('Modelo', 'modelo', { obrig: true, list: 'demos-modelos' })}
                  {campo('Versão', 'versao', { obrig: true, span: 'md:col-span-2' })}
                  {campo('Estado entrega', 'estadoEntrega', { placeholder: 'Ex: Imediata' })}
                </div>
                <datalist id="demos-modelos">{nova.modelos.map(m => <option key={m} value={m} />)}</datalist>
                <div className="grid sm:grid-cols-2 gap-3">
                  {botoes('Tipo de viatura', TIPOS_NEGOCIO, o => ident.negocio === o, o => setI('negocio', o))}
                  {botoes('Marca', MARCAS, o => ident.marca === o, o => setI('marca', o))}
                  {botoes('Tecnologia', TECNOLOGIAS, o => ident.tipologia.includes(o), o => setI('tipologia', ident.tipologia.includes(o) ? ident.tipologia.filter(x => x !== o) : [...ident.tipologia, o]))}
                  {botoes('Concessão (multi-seleção) *', nova.locais, o => ident.locais.includes(o), o => setI('locais', ident.locais.includes(o) ? ident.locais.filter(x => x !== o) : [...ident.locais, o]))}
                </div>
                <div className="grid sm:grid-cols-[auto_1fr] gap-3 items-end">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none pb-2">
                    <input type="checkbox" checked={ident.iva} onChange={e => setI('iva', e.target.checked)} className="h-4 w-4 accent-[hsl(var(--brand-primary))]" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">IVA dedutível</span>
                  </label>
                  {campo('Link fotos / galeria', 'linkFotos', { type: 'url', placeholder: 'https://...' })}
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
                {identLeitura.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k}</dt>
                    <dd className="text-sm font-semibold truncate" title={v}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {escalao && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-3">
                {([
                  ['Dias desde matrícula', escalao.futura ? 'Data futura' : String(escalao.dias), ''],
                  ['Períodos de 30 dias', String(escalao.periodos), 'text-brand-primary'],
                  ['Próximo escalão em', escalao.faltam === 1 ? '1 dia' : `${escalao.faltam} dias`, escalao.faltam <= 5 ? 'text-orange-600' : ''],
                  ['Data próximo escalão', escalao.proxima.toLocaleDateString('pt-PT', { timeZone: 'UTC' }), ''],
                ] as const).map(([k, v, tone]) => (
                  <div key={k}>
                    <span className="block text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">{k}</span>
                    <span className={`block text-lg font-black tabular-nums ${tone}`}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <DescMaxPanel modelo={ver.modelo} tipo={tipo} penetracao={live.penetracao} periodos={escalao?.futura === false ? escalao.periodos : 0} />
          </section>

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
                2. Descontos e apoios (%) <span className="text-[10px] font-medium normal-case text-muted-foreground ml-1">(ex.: 8,5)</span>
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
            {nova ? 'Os valores por preencher ficam a zero (ECO e LEG/TR com os valores habituais).' : 'Só se gravam os campos alterados.'}
          </p>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {onArquivar && !nova && (
              <button
                type="button" onClick={arquivar} disabled={arquivando || saving}
                title="Marcar como vendida: os dados e o preço ficam arquivados em Vendidas"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
              >
                {arquivando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />} Vendida (Arquivar)
              </button>
            )}
            <span className="text-xs text-muted-foreground truncate">
              {invalid.length > 0 ? <span className="text-destructive">Valor inválido: {invalid.map(f => f.label).join(', ')}</span>
                : nova ? 'Os campos com * são obrigatórios'
                : nChanged > 0 ? `${nChanged} ${nChanged === 1 ? 'campo alterado' : 'campos alterados'}` : 'Sem alterações'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={tryClose} className="px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors">Cancelar</button>
            <button
              type="button" onClick={gravar} disabled={saving || arquivando || invalid.length > 0 || (!nova && nChanged === 0)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {nova ? 'Adicionar' : 'Gravar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const pct = (n: number) => (n * 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 }) + ' %';

/* Desconto máximo do modelo e tipologia (máx. total e acumulação mensal). O valor aplicável é o
 * "com 19% de opcionais" quando a penetração (OPC / PVB) o atinge; acompanha o preço em edição. */
function DescMaxPanel({ modelo, tipo, penetracao, periodos }: {
  modelo: string | null; tipo: Tipo; penetracao: number; periodos: number;
}) {
  const m = descontoMaxPara(modelo, tipo);
  if (!m) {
    return (
      <p className="text-[11px] text-muted-foreground rounded-lg border border-dashed border-border px-3 py-2">
        Sem linha de desconto máximo para "{modelo || '—'}" ({tipo.bev ? 'BEV' : tipo.xev ? 'PHEV' : 'ICE'}).
      </p>
    );
  }
  const { valor, comIncorporacao } = descMaxAplicavel(m.linha, penetracao);
  const cel = (titulo: string, v: DescMax, ativo: boolean) => (
    <div className={`rounded-md border px-3 py-2 ${ativo ? 'border-brand-primary bg-brand-primary/5' : 'border-border opacity-60'}`}>
      <span className="block text-[10px] font-semibold text-muted-foreground leading-tight">{titulo}</span>
      <span className="block text-base font-black tabular-nums">{pct(v.max)}</span>
      <span className="block text-[10px] text-muted-foreground">{v.mensal === null ? 'sem acumulação mensal' : `${pct(v.mensal)} mensal`}</span>
    </div>
  );
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Desconto máximo · {m.grupo} · {m.linha.modelos.join(', ')}
        </h4>
        <span className="text-[10px] text-muted-foreground">
          Penetração de opcionais {pct(penetracao)} ({comIncorporacao ? 'atinge' : 'abaixo de'} {pct(INCORPORACAO_OPCIONAIS)})
        </span>
      </div>
      {m.linha.sem ? (
        <div className="grid grid-cols-2 gap-2">
          {cel('Com 19% de opcionais', m.linha.com, comIncorporacao)}
          {cel('Sem 19% de opcionais', m.linha.sem, !comIncorporacao)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">{cel('Com ou sem 19% de opcionais', m.linha.com, true)}</div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Acumulado ao fim de {periodos} {periodos === 1 ? 'período' : 'períodos'} de 30 dias:{' '}
        <strong className="text-foreground tabular-nums">{pct(descMaxAcumulado(valor, periodos))}</strong>
        {valor.mensal !== null && <> (mensal × períodos, limitado a {pct(valor.max)})</>}
      </p>
    </div>
  );
}

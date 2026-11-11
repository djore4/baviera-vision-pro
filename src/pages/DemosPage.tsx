import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { canonicalLocal, locaisDoPerfil, locaisDoGrupo } from '@/lib/locations';
import {
  Search, X, MapPin, Gauge, Calendar, ExternalLink, Share2, Copy,
  ChevronUp, ChevronDown, ChevronsUpDown, RotateCcw, ImageOff,
  Camera, Trash2, Loader2, Pencil, Plus, Archive,
} from 'lucide-react';
import { toBlob } from 'html-to-image';
import { client } from '@/clients';
import { chassisCurto, formatMatricula, matriculaCompacta, parseNum } from '@/lib/viaturaFormat';
import { calcPricing, tipoFlags, type Pricing, type PricingInputs, type Tipo } from '@/lib/demoPricing';
import PrecosDialog from '@/components/demos/PrecosDialog';
import { comissaoFixa } from '@/lib/demo-comissao';
import VendidasPanel from '@/components/demos/VendidasPanel';
import { chip, btnPrimary, btnSecondary, btnGhost } from '@/lib/chip';
import { TIPOS_NEGOCIO, MARCAS, TODAS, TODOS, tipoNegocio, marcasDe, opcoesFiltro, concessaoInicial } from '@/lib/viaturasFiltros';

/* ── Parque de demonstradores (VN · Demos) ────────────────────────────────────
 * Parque de viaturas (tabela `viaturas`, ainda partilhada com a plataforma Caetano).
 * A tabela mostra as mesmas colunas a todos os perfis (identificação, PVP, PVP Desc, PVP s/IVA).
 * Os preços são recalculados em runtime a partir de `inputs`, segundo o racional do Excel
 * "PARQUE BMW" (ver lib/demoPricing.ts). Os economics (custo, descontos, margem) vivem na
 * janela da viatura (components/demos/PrecosDialog.tsx), que abre ao clicar na linha para o
 * administrador e para quem tem 'demos:precos' (nas viaturas do seu local); os restantes
 * abrem o cartão de partilha.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Viatura {
  chassis: string;
  matricula: string | null;
  modelo: string | null;
  versao: string | null;
  encomenda: string | null;
  estado_entrega: string | null;
  data_matricula: string | null;
  tipologia: unknown;
  local: unknown;
  marca: string | null;
  estado_negocio: string | null;
  iva_dedutivel?: boolean | null;
  link_fotos: string | null;
  observacoes: string | null;
  kms: number | null;
  reserva_expira: string | null;
  reserva_user: string | null;
  inputs: unknown;
  stats: unknown;
}

const TEMPLATE_INPUTS: PricingInputs = {
  pvb: 0, opc: 0, bsi: 0, eco: 4.2, leg: 1550, isv: 0,
  mgb: 0, esf: 0, pac: 0, dem: 0, sup: 0, pvp_desc: 0, depreciacoes: 0,
};

/* Normaliza campos que podem vir como array, string JSON ou CSV. */
function getArr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; }
    catch { return v.includes(',') ? v.split(',').map(s => s.trim()) : [v]; }
  }
  return [];
}

/* Locais de uma viatura em nomes canónicos ("Caetano Aveiro" e "Aveiro" são o mesmo). */
const localsOfRow = (r: { local: unknown }): string[] => getArr(r.local).map(l => canonicalLocal(l) ?? l);

function getInps(v: unknown): PricingInputs {
  if (!v) return { ...TEMPLATE_INPUTS };
  if (typeof v === 'string') {
    try { return { ...TEMPLATE_INPUTS, ...JSON.parse(v) }; } catch { return { ...TEMPLATE_INPUTS }; }
  }
  return typeof v === 'object' ? { ...TEMPLATE_INPUTS, ...(v as Partial<PricingInputs>) } : { ...TEMPLATE_INPUTS };
}

function idadeDias(dataMatricula: string | null): number {
  if (!dataMatricula) return 0;
  const diff = Date.now() - new Date(dataMatricula).getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

function isReservado(v: Viatura): boolean {
  return !!v.reserva_expira && new Date(v.reserva_expira).getTime() > Date.now();
}

const eur = (n: number | null | undefined) =>
  (n || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const eur0 = (n: number | null | undefined) =>
  (n || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' €';
const perc = (n: number | null | undefined) =>
  ((n || 0) * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const perc1 = (n: number | null | undefined) =>
  ((n || 0) * 100).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';

interface Row extends Viatura {
  _inps: PricingInputs; _p: Pricing; _idade: number;
  _local: string; _tipologia: string[]; _tipo: Tipo;
  _negocio: 'VD' | 'VU'; _marcas: string[];
  /** Comissão fixa por modelo (só VD de automóvel); null se o modelo não consta da tabela. */
  _comissao: number | null;
  /** Prémio de venda (€) que acresce à comissão; 0 = sem prémio. Vem de demos_premios. */
  _premio: number;
}

function buildRow(v: Viatura): Row {
  const tipologia = getArr(v.tipologia);
  const tipo = tipoFlags(tipologia);
  const inps = getInps(v.inputs);
  return {
    ...v,
    _inps: inps,
    _p: calcPricing(inps, tipo),
    _idade: idadeDias(v.data_matricula),
    _local: getArr(v.local).join(', ') || '—',
    _tipologia: tipologia,
    _tipo: tipo,
    _negocio: tipoNegocio(v.estado_negocio),
    _marcas: marcasDe(getArr(v.marca)),
    _comissao: tipoNegocio(v.estado_negocio) === 'VD' && !marcasDe(getArr(v.marca)).some(m => /motorrad/i.test(m))
      ? comissaoFixa(v.modelo, v.versao) : null,
    _premio: 0,
  };
}

/* ── Colunas (espelham o Excel "PARQUE BMW") ──────────────────────────────── */
type Group = 'id' | 'preco' | 'venda';
const GROUPS: { key: Group; label: string }[] = [
  { key: 'id', label: 'Viatura' },
  { key: 'preco', label: 'Preço' },
  { key: 'venda', label: 'Venda' },
];

interface Col {
  key: string;
  label: string;
  title?: string;
  group: Group;
  align?: 'right' | 'center';
  sort: (r: Row) => string | number;
  cell: (r: Row, reservado: boolean) => ReactNode;
  cls?: string;
}


const text = (get: (r: Row) => string | null): Pick<Col, 'sort' | 'cell'> => ({
  sort: r => (get(r) ?? '').toLowerCase(), cell: r => get(r) || '—',
});

const TIPO_TAGS: { k: keyof Tipo; label: string }[] = [
  { k: 'ice', label: 'ICE' }, { k: 'xev', label: 'xEV' }, { k: 'bev', label: 'BEV' },
  { k: 'qor', label: 'QoR' }, { k: 'm', label: 'M' },
];

const COLS: Col[] = [
  {
    key: 'local', label: 'Local', group: 'id', align: 'center',
    sort: r => r._local.toLowerCase(),
    cell: r => <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-semibold border border-border">{r._local}</span>,
  },
  {
    key: 'negocio', label: 'Tipo / Marca', group: 'id', align: 'center',
    sort: r => `${r._negocio} ${r._marcas.join(' ')}`.toLowerCase(),
    cell: r => (
      <span className="inline-flex items-center gap-1">
        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${r._negocio === 'VU' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400' : 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'}`}>{r._negocio}</span>
        {r._marcas.some(m => m !== 'BMW') && <span className="text-[9px] font-semibold text-muted-foreground">{r._marcas.filter(m => m !== 'BMW').join(', ')}</span>}
      </span>
    ),
  },
  { key: 'modelo', label: 'Modelo', group: 'id', ...text(r => r.modelo), cell: () => null /* render dedicado */ },
  { key: 'versao', label: 'Versão', group: 'id', ...text(r => r.versao), cls: 'text-muted-foreground' },
  { key: 'encomenda', label: 'Enc', group: 'id', ...text(r => r.encomenda), cls: 'text-muted-foreground font-mono' },
  { key: 'chassis', label: 'Chassis', title: 'Últimos 7 caracteres', group: 'id', ...text(r => chassisCurto(r.chassis)), cls: 'text-muted-foreground font-mono uppercase' },
  { key: 'matricula', label: 'Matrícula', group: 'id', ...text(r => matriculaCompacta(r.matricula)), cls: 'text-foreground/80 font-mono uppercase font-medium' },
  {
    key: 'data_matricula', label: 'Data', group: 'id', align: 'center', cls: 'text-muted-foreground',
    sort: r => r.data_matricula ? new Date(r.data_matricula).getTime() : 0,
    cell: r => r.data_matricula ? new Date(r.data_matricula).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—',
  },
  { key: 'idade', label: 'Idade', group: 'id', align: 'center', sort: r => r._idade, cell: r => <AgeBadge dias={r._idade} /> },
  {
    key: 'tipo', label: 'Tipo', title: 'ICE · xEV · BEV · QoR · M', group: 'id', align: 'center',
    sort: r => TIPO_TAGS.filter(t => r._tipo[t.k]).map(t => t.label).join(' '),
    cell: r => {
      const tags = TIPO_TAGS.filter(t => r._tipo[t.k]);
      if (!tags.length) return <span className="text-muted-foreground/40">—</span>;
      return (
        <span className="inline-flex gap-0.5">
          {tags.map(t => (
            <span key={t.k} className="px-1 py-0.5 rounded bg-brand-primary/10 text-brand-primary text-[9px] font-bold">{t.label}</span>
          ))}
        </span>
      );
    },
  },

  {
    key: 'pvp', label: 'PVP', title: '(PVB + OPC + BSI + ECO + LEG/TR + ISV) × 1,23', group: 'preco', align: 'right',
    sort: r => r._p.pvp, cls: 'text-muted-foreground line-through',
    cell: r => r._p.pvp > 0 ? eur0(r._p.pvp) : '—',
  },

  {
    key: 'pvp_desc', label: 'PVP Desc', title: 'Preço de venda (com IVA)', group: 'venda', align: 'right',
    sort: r => r._p.pvp_desc,
    cell: (r, reservado) => r._p.pvp_desc > 0
      ? <span className={`font-bold ${reservado ? 'text-red-600' : 'text-brand-primary'}`}>{eur0(r._p.pvp_desc)}</span>
      : '—',
  },
  {
    key: 'comissao', label: 'Comissão', title: 'Comissão fixa por modelo + prémio de venda (se existir)', group: 'venda', align: 'right',
    sort: r => (r._comissao ?? 0) + r._premio,
    cell: r => {
      const total = (r._comissao ?? 0) + r._premio;
      if (total <= 0) return <span className="text-muted-foreground/40">—</span>;
      return r._premio > 0 ? (
        <span className="inline-flex flex-col items-end leading-tight">
          <span className="font-black text-orange-600 dark:text-orange-400">{eur0(total)}</span>
          <span className="text-[9px] font-semibold text-muted-foreground">{r._comissao ? `${eur0(r._comissao)} + ` : ''}{eur0(r._premio)} prémio</span>
        </span>
      ) : <span className="font-semibold text-foreground/80">{eur0(total)}</span>;
    },
  },
  {
    key: 'pvp_siva', label: 'PVP s/IVA', title: 'xEV/BEV: PVP DESC / 1,23 (IVA dedutível) · ICE: PVP DESC', group: 'venda', align: 'right',
    sort: r => r._p.pvp_sem_iva, cls: 'text-foreground/80 font-medium',
    cell: r => r._p.pvp_desc > 0 ? eur0(r._p.pvp_sem_iva) : '—',
  },
];

const DESC_FIRST = new Set(['pvp', 'pvp_desc', 'pvp_siva', 'idade', 'comissao']);

/* Primeira coluna de cada grupo leva separador vertical. */
const groupStarts = (cols: Col[]) => new Set(cols.filter((c, i) => i > 0 && cols[i - 1].group !== c.group).map(c => c.key));

const MODELO_W_KEY = 'demos.modeloWidth';
const MODELO_W_DEFAULT = 88;
const clampModeloW = (w: number) => Math.min(320, Math.max(56, Math.round(w)));
function loadModeloW(): number {
  try { const v = Number(localStorage.getItem(MODELO_W_KEY)); return v ? clampModeloW(v) : MODELO_W_DEFAULT; } catch { return MODELO_W_DEFAULT; }
}
function AgeBadge({ dias }: { dias: number }) {
  const cls = dias <= 90
    ? 'border-green-500/40 text-green-600 bg-green-500/10'
    : dias <= 180
      ? 'border-yellow-500/40 text-yellow-600 bg-yellow-500/10'
      : 'border-red-500/40 text-red-600 bg-red-500/10';
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {dias === 0 ? 'Novo' : `${dias} dias`}
    </span>
  );
}

/* Filtro em chips de seleção múltipla: vazio = todos (o chip "Todas" fica ativo). */
function ChipFilter({ label, options, selected, onToggle, onClear }: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={onClear} aria-pressed={selected.size === 0} className={chip(selected.size === 0)}>Todas</button>
        {options.map(o => (
          <button key={o} type="button" onClick={() => onToggle(o)} aria-pressed={selected.has(o)} className={chip(selected.has(o))}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* Filtro de escolha única em botões ("Todas" ou uma opção), como na Gestão VD. */
function PillFilter({ label, todos, options, value, onChange, divider }: {
  label: string; todos: string; options: string[]; value: string; onChange: (v: string) => void; divider?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${divider ? 'lg:border-l lg:border-border lg:pl-4' : ''}`}>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {[todos, ...options].map(o => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o} className={chip(value === o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export default function DemosPage() {
  const { session } = useAuth();
  const { canEdit, isAdmin, me, capabilities } = usePermissions();
  const groups = GROUPS;
  const cols = COLS;
  // Janela de preço (economics): administrador, ou 'demos:precos' nas viaturas dos locais da pessoa
  // (a base de dados valida). Os restantes abrem o cartão. Sem a migração, só o cartão.
  const meusLocais = useMemo(() => locaisDoPerfil(me?.local), [me?.local]);
  const podeGerirPrecos = (r: Pick<Row, 'local'>) => {
    if (!capabilities.demosPrecos) return false;
    if (isAdmin) return true;
    if (!canEdit('demos:precos')) return false;
    const ls = localsOfRow(r);
    return ls.length > 0 && ls.every(l => meusLocais.includes(l));
  };
  // Adicionar viaturas ('demos:inserir-viaturas', nos seus locais) e arquivar/consultar vendidas
  // ('demos:precos', nas do seu local): a base de dados valida; aqui só se decide o que mostrar.
  const podeAdicionar = capabilities.demosGestao && (isAdmin || canEdit('demos:inserir-viaturas'));
  const podeArquivo = capabilities.demosGestao && (isAdmin || canEdit('demos:precos'));
  const [vista, setVista] = useState<'parque' | 'vendidas'>('parque');
  const [novaOpen, setNovaOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [capas, setCapas] = useState<Record<string, string>>({});
  // Prémios de venda (demos_premios). `premiosOk` = a tabela existe (migração aplicada): só então se edita.
  const [premios, setPremios] = useState<Record<string, number>>({});
  const [premiosOk, setPremiosOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Filtros de escolha única (Concessão, Tipo, Marca), como na Gestão VD da Sales Force.
  // Por defeito, o parque abre na concessão do perfil (escolhida em Utilizadores), se for só uma.
  const [fLocal, setFLocal] = useState<string>(() => concessaoInicial(locaisDoPerfil(me?.local)));
  const [fTipo, setFTipo] = useState<string>(TODOS);
  const [fMarca, setFMarca] = useState<string>(TODAS);
  const [fModelos, setFModelos] = useState<Set<string>>(new Set());
  const localInit = useRef(false);
  const [fTipologia, setFTipologia] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [selectedChassis, setSelectedChassis] = useState<string | null>(null);
  const [precosChassis, setPrecosChassis] = useState<string | null>(null);
  const [modeloW, setModeloW] = useState<number>(loadModeloW);

  const carregar = useCallback(async () => {
    setLoading(true);
    // demos_viaturas() só devolve descontos, custo e margem ao administrador (e a quem gere os preços do seu local).
    // Sem a função (migração 20261012120000 por aplicar) lê-se a tabela, como antes.
    let viaturasQ = await supabase.rpc('demos_viaturas');
    if (viaturasQ.error && (viaturasQ.error as { code?: string }).code === 'PGRST202') {
      console.warn('demos_viaturas() em falta na base de dados: a ler a tabela viaturas. Aplicar a migração 20261012120000.');
      viaturasQ = await supabase.from('viaturas').select('*') as unknown as typeof viaturasQ;
    }
    const [viaturasRes, capasRes, premiosRes] = await Promise.all([
      Promise.resolve(viaturasQ),
      supabase.from('demo_capas').select('chassis, url'),
      supabase.from('demos_premios').select('chassis, premio'),
    ]);
    if (viaturasRes.error) { setError(viaturasRes.error.message); setRows([]); setLoading(false); return; }
    setError(null);
    const capaMap: Record<string, string> = {};
    for (const c of (capasRes.data as { chassis: string; url: string }[]) ?? []) {
      if (c.chassis && c.url) capaMap[c.chassis] = c.url;
    }
    const premioMap: Record<string, number> = {};
    for (const p of (premiosRes.data as { chassis: string; premio: number }[] | null) ?? []) {
      if (p.chassis && Number(p.premio) > 0) premioMap[p.chassis] = Number(p.premio);
    }
    setPremios(premioMap);
    setPremiosOk(!premiosRes.error);
    setRows(((viaturasRes.data as Viatura[]) ?? []).map(buildRow));
    setCapas(capaMap);
    setLoading(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const handleCapaChange = (chassis: string, url: string | null) =>
    setCapas(prev => {
      const next = { ...prev };
      if (url) next[chassis] = url; else delete next[chassis];
      return next;
    });

  const opcoesLocal = useMemo(() => opcoesFiltro(locaisDoGrupo(), rows.flatMap(localsOfRow)), [rows]);
  const opcoesTipo = useMemo(() => opcoesFiltro(TIPOS_NEGOCIO, rows.map(r => r._negocio)), [rows]);
  const opcoesMarca = useMemo(() => opcoesFiltro(MARCAS, rows.flatMap(r => r._marcas)), [rows]);
  const modelos = useMemo(() => [...new Set(rows.map(r => (r.modelo ?? '').trim()).filter(Boolean))].sort(), [rows]);
  const locais = useMemo(() => [...new Set(rows.flatMap(localsOfRow))].sort(), [rows]);
  const tipologias = useMemo(() => [...new Set(rows.flatMap(r => r._tipologia))].sort(), [rows]);

  // Se o parque não tiver nenhuma viatura da concessão inicial, passa a "Todas" — só uma vez,
  // para não mostrar uma tabela vazia por causa do filtro inicial.
  useEffect(() => {
    if (localInit.current || rows.length === 0) return;
    localInit.current = true;
    setFLocal(prev => (prev === TODAS || locais.includes(prev) ? prev : TODAS));
  }, [rows, locais]);

  const viewRows = useMemo(() => rows.map(r => ({ ...r, _premio: premios[r.chassis] ?? 0 })), [rows, premios]);
  const selected = selectedChassis ? viewRows.find(r => r.chassis === selectedChassis) ?? null : null;
  const precosRow = precosChassis ? viewRows.find(r => r.chassis === precosChassis) ?? null : null;

  // Preços gravados: atualiza a linha em memória (a base de dados já tem os valores novos).
  const handlePrecosSaved = (chassis: string, changed: Partial<PricingInputs>) => {
    setRows(prev => prev.map(r => r.chassis === chassis
      ? buildRow({ ...r, inputs: { ...r._inps, ...changed } })
      : r));
    setPrecosChassis(null);
  };

  // Arquivar como vendida (como na Gestão VD): preço e dados ficam cristalizados em "Vendidas".
  const arquivar = async (chassis: string) => {
    const r = rows.find(x => x.chassis === chassis);
    if (!r) return;
    const nome = [r.modelo, r.versao].filter(Boolean).join(' ') || chassisCurto(chassis);
    if (!window.confirm(`Marcar ${nome} como VENDIDA?\n\nOs dados e o preço atuais ficam arquivados em "Vendidas" e a viatura sai do parque ativo.`)) return;
    const { error: err } = await supabase.rpc('demos_arquivar_viatura', { p_chassis: chassis });
    if (err) {
      toast.error(err.code === '42501' ? 'Sem permissão para arquivar esta viatura.' : `Não foi possível arquivar: ${err.message}`);
      return;
    }
    setRows(prev => prev.filter(x => x.chassis !== chassis));
    setPrecosChassis(null);
    toast.success('Viatura arquivada em "Vendidas".');
  };

  // Largura da coluna Modelo, ajustável arrastando a margem do cabeçalho (rato ou toque).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const w0 = modeloW; let w = w0;
    const move = (ev: PointerEvent) => { w = clampModeloW(w0 + ev.clientX - x0); setModeloW(w); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem(MODELO_W_KEY, String(w)); } catch { /* sem storage */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const resetModeloW = () => {
    setModeloW(MODELO_W_DEFAULT);
    try { localStorage.removeItem(MODELO_W_KEY); } catch { /* sem storage */ }
  };

  // Com um só local filtrado, a coluna Local seria sempre igual: esconde-se.
  const hideLocal = fLocal !== TODAS;
  const visibleCols = useMemo(
    () => cols.filter(c => !(hideLocal && c.key === 'local')),
    [cols, hideLocal],
  );

  // Local e Modelo ficam fixas à esquerda ao deslizar a tabela (essencial em mobile).
  const localThRef = useRef<HTMLTableCellElement>(null);
  const [localW, setLocalW] = useState(0);
  useLayoutEffect(() => {
    const el = localThRef.current;
    if (!el) { setLocalW(0); return; }
    setLocalW(el.offsetWidth);
    const ro = new ResizeObserver(() => setLocalW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hideLocal, loading]);
  const sticky = (key: string, tint: string) => {
    if (key !== 'local' && key !== 'modelo') return { cls: '', style: undefined };
    return {
      cls: `sticky z-10 bg-card ${tint} ${key === 'modelo' ? 'border-r border-border' : ''}`,
      style: { left: key === 'local' ? 0 : (hideLocal ? 0 : localW) },
    };
  };
  // Tons equivalentes aos fundos semitransparentes das linhas, sobre fundo opaco.
  const TINT_HEAD = 'shadow-[inset_0_0_0_999px_hsl(var(--muted)/0.5)]';
  // Prémio de venda: a linha fica realçada (laranja) em relação ao resto da listagem.
  const tintRow = (reservado: boolean, premio = false) => premio
    ? 'shadow-[inset_0_0_0_999px_rgb(249_115_22/0.12)] group-hover:shadow-[inset_0_0_0_999px_rgb(249_115_22/0.2)]'
    : reservado
      ? 'shadow-[inset_0_0_0_999px_rgb(234_179_8/0.05)] group-hover:shadow-[inset_0_0_0_999px_rgb(234_179_8/0.1)]'
      : 'group-hover:shadow-[inset_0_0_0_999px_hsl(var(--muted)/0.3)]';
  const groupStart = useMemo(() => groupStarts(visibleCols), [visibleCols]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = viewRows.filter(r => {
      if (fTipo !== TODOS && r._negocio !== fTipo) return false;
      if (fMarca !== TODAS && !r._marcas.includes(fMarca)) return false;
      if (fModelos.size && !fModelos.has((r.modelo ?? '').trim())) return false;
      if (fLocal !== TODAS && !localsOfRow(r).includes(fLocal)) return false;
      if (fTipologia.size && !r._tipologia.some(t => fTipologia.has(t))) return false;
      if (!q) return true;
      return [r.modelo, r.versao, r.chassis, r.matricula, formatMatricula(r.matricula), r.encomenda, r._local]
        .some(v => (v ?? '').toString().toLowerCase().includes(q));
    });

    const col = sort && COLS.find(c => c.key === sort.key);
    if (sort && col) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const va = col.sort(a); const vb = col.sort(b);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    } else {
      // Ordenação por defeito: reservados primeiro, depois idade descendente.
      list.sort((a, b) => {
        const rr = (isReservado(b) ? 1 : 0) - (isReservado(a) ? 1 : 0);
        return rr !== 0 ? rr : b._idade - a._idade;
      });
    }
    return list;
  }, [viewRows, search, fTipo, fMarca, fModelos, fLocal, fTipologia, sort]);

  // Totais do que está filtrado (como a linha de totais de uma tabela Excel).
  const totals = useMemo(() => {
    const vendidos = filtered.filter(r => r._p.pvp_desc > 0);
    return { n: vendidos.length, pvpDesc: vendidos.reduce((s, r) => s + r._p.pvp_desc, 0) };
  }, [filtered]);

  const toggleIn = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (v: string) =>
    set(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  const toggleSort = (key: string) =>
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: DESC_FIRST.has(key) ? 'desc' : 'asc' };
      if (prev.dir === (DESC_FIRST.has(key) ? 'desc' : 'asc')) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return null; // terceiro clique limpa
    });

  const filtersActive = !!search || fTipo !== TODOS || fMarca !== TODAS || fModelos.size > 0 || fLocal !== TODAS || fTipologia.size > 0;
  const resetFilters = () => {
    setSearch(''); setFTipo(TODOS); setFMarca(TODAS); setFModelos(new Set()); setFLocal(TODAS); setFTipologia(new Set());
  };

  const alignCls = (a?: 'right' | 'center') => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  const sepCls = (key: string) => groupStart.has(key) ? 'border-l border-border' : '';

  return (
    <div className="space-y-3 min-w-0 overflow-x-clip">
      {/* Cabeçalho: só as ações (o título do parque repetia o nome do tab); o arquivo mantém o título */}
      {(vista === 'vendidas' || podeArquivo || podeAdicionar) && (
      <div className="flex flex-wrap items-end justify-between gap-3">
        {vista === 'vendidas' && (
          <div>
            <h2 className="text-xl font-black leading-tight">Viaturas vendidas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Arquivo: dados e preço cristalizados no momento da venda.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {podeArquivo && (
            <button
              onClick={() => setVista(v => (v === 'vendidas' ? 'parque' : 'vendidas'))}
              className={btnSecondary}
            >
              <Archive className="h-3.5 w-3.5" /> {vista === 'vendidas' ? 'Voltar ao parque' : 'Vendidas'}
            </button>
          )}
          {podeAdicionar && vista === 'parque' && (
            <button
              onClick={() => setNovaOpen(true)}
              className={btnPrimary}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar viatura
            </button>
          )}
        </div>
      </div>
      )}

      {vista === 'vendidas' ? (
        <VendidasPanel onRepor={() => { void carregar(); }} />
      ) : (<>
      {/* Filtros: Concessão · Tipo · Marca · Pesquisa (escolha única, "Todas/Todos" = sem filtro) */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
          <PillFilter label="Concessão" todos={TODAS} options={opcoesLocal} value={fLocal} onChange={setFLocal} />
          <PillFilter label="Tipo" todos={TODOS} options={opcoesTipo} value={fTipo} onChange={setFTipo} divider />
          <PillFilter label="Marca" todos={TODAS} options={opcoesMarca} value={fMarca} onChange={setFMarca} divider />
          <div className="lg:ml-auto w-full lg:w-96 flex flex-col gap-1.5">
            <label htmlFor="demos-pesquisa" className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pesquisar</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                id="demos-pesquisa" type="search"
                className="w-full pl-8 pr-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Modelo, versão, matrícula, chassis, encomenda..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {(tipologias.length > 0 || modelos.length > 0 || filtersActive) && (
          <div className="grid gap-3 border-t border-border pt-3">
            <ChipFilter label="Tecnologia" options={tipologias} selected={fTipologia} onToggle={toggleIn(setFTipologia)} onClear={() => setFTipologia(new Set())} />
            <ChipFilter label="Modelo" options={modelos} selected={fModelos} onToggle={toggleIn(setFModelos)} onClear={() => setFModelos(new Set())} />
            {filtersActive && (
              <div>
                <button
                  onClick={resetFilters}
                  className={btnGhost}
                >
                  <RotateCcw className="h-3 w-3" /> Limpar filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20">
          Erro ao carregar o parque: {error}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar parque...</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30">
                {groups.map((g, i) => (
                  <th
                    key={g.key}
                    colSpan={visibleCols.filter(c => c.group === g.key).length}
                    className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 text-center whitespace-nowrap border-b border-border ${i > 0 ? 'border-l' : ''}`}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-muted/50">
                {visibleCols.map(c => {
                  const active = sort?.key === c.key;
                  const st = sticky(c.key, TINT_HEAD);
                  return (
                    <th
                      key={c.key}
                      ref={c.key === 'local' ? localThRef : undefined}
                      onClick={() => toggleSort(c.key)}
                      title={c.title}
                      style={{ ...st.style, ...(c.key === 'modelo' ? { width: modeloW, minWidth: modeloW, maxWidth: modeloW } : {}) }}
                      className={`${st.cls || (c.key === 'modelo' ? 'relative' : '')} px-2.5 py-2 font-semibold text-muted-foreground whitespace-nowrap border-b border-border transition-colors cursor-pointer select-none hover:text-foreground ${alignCls(c.align)} ${sepCls(c.key)}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                        {c.label}
                        {active
                          ? (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-brand-primary" /> : <ChevronDown className="h-3 w-3 text-brand-primary" />)
                          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                      </span>
                      {c.key === 'modelo' && (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          title="Arrastar para ajustar a largura (duplo clique repõe)"
                          onPointerDown={startResize}
                          onClick={e => e.stopPropagation()}
                          onDoubleClick={e => { e.stopPropagation(); resetModeloW(); }}
                          className="absolute top-0 right-0 h-full w-3 cursor-col-resize touch-none flex justify-end group/rs"
                        >
                          <span className="w-px h-full bg-border group-hover/rs:bg-brand-primary group-active/rs:bg-brand-primary" />
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const reservado = isReservado(r);
                const destaque = r._premio > 0;
                return (
                  <tr
                    key={r.chassis}
                    onClick={() => (podeGerirPrecos(r) ? setPrecosChassis(r.chassis) : setSelectedChassis(r.chassis))}
                    data-premio={destaque ? 'sim' : undefined}
                    className={`group border-b border-border/50 cursor-pointer transition-colors ${destaque ? 'bg-orange-500/10 hover:bg-orange-500/20' : reservado ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-muted/30'}`}
                  >
                    {visibleCols.map(c => c.key === 'modelo' ? (
                      <td key={c.key} style={sticky(c.key, '').style} className={`${sticky(c.key, tintRow(reservado, destaque)).cls} px-2.5 py-1.5 font-semibold text-foreground whitespace-nowrap`}>
                        <span
                          className="flex items-center gap-1.5 overflow-hidden"
                          style={{ maxWidth: modeloW - 20 }}
                          title={[r.modelo, reservado ? '(em negociação)' : ''].filter(Boolean).join(' ')}
                        >
                          {destaque && <span className="text-orange-500 shrink-0 text-[11px] leading-none" title="Prémio de venda" aria-label="Com prémio de venda">★</span>}
                          {reservado && <span className="h-2 w-2 rounded-full bg-yellow-400 shrink-0" aria-label="Em negociação" />}
                          {capas[r.chassis] && (
                            <img src={capas[r.chassis]} alt="" className="h-5 w-7 rounded object-cover border border-border shrink-0" loading="lazy" />
                          )}
                          <span className="truncate">{r.modelo || '—'}</span>
                        </span>
                      </td>
                    ) : (
                      <td key={c.key} style={sticky(c.key, '').style} className={`${sticky(c.key, tintRow(reservado, destaque)).cls} px-2.5 py-1.5 whitespace-nowrap ${alignCls(c.align)} ${c.cls ?? ''} ${sepCls(c.key)}`}>
                        {c.cell(r, reservado)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {totals.n > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  {visibleCols.map(c => {
                    const v = c.key === 'pvp_desc' ? eur0(totals.pvpDesc) : c.key === 'modelo' ? 'Total' : '';
                    const tone = c.key === 'pvp_desc' ? 'text-brand-primary' : 'text-muted-foreground';
                    return (
                      <td key={c.key} style={sticky(c.key, '').style} className={`${sticky(c.key, TINT_HEAD).cls} px-2.5 py-2 whitespace-nowrap ${alignCls(c.align)} ${tone} ${sepCls(c.key)}`}>{v}</td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">Nenhuma viatura encontrada.</div>
          )}
        </div>
      )}
      </>)}

      {selected && (
        <ShareCard
          row={selected}
          capa={capas[selected.chassis]}
          canEdit={canEdit('demos')}
          email={session?.user.email ?? null}
          onCapaChange={handleCapaChange}
          onClose={() => setSelectedChassis(null)}
        />
      )}

      {precosRow && (
        <PrecosDialog
          key={precosRow.chassis}
          veiculo={{
            chassis: precosRow.chassis,
            titulo: [precosRow.modelo, precosRow.versao].filter(Boolean).join(' ') || 'Viatura',
            matricula: precosRow.matricula ? formatMatricula(precosRow.matricula) : chassisCurto(precosRow.chassis),
            local: precosRow._local,
            encomenda: precosRow.encomenda,
            dataMatricula: precosRow.data_matricula,
            kms: precosRow.kms,
            modelo: precosRow.modelo,
            versao: precosRow.versao,
            estadoEntrega: precosRow.estado_entrega,
          }}
          editarIdent={isAdmin ? {
            locais: opcoesLocal,
            modelos,
            chassisExistentes: rows.map(r => r.chassis),
            matriculasExistentes: rows.map(r => matriculaCompacta(r.matricula)).filter(Boolean),
            inicial: {
              encomenda: precosRow.encomenda ?? '',
              chassis: precosRow.chassis,
              matricula: precosRow.matricula ? formatMatricula(precosRow.matricula) : '',
              dataMatricula: precosRow.data_matricula ? String(precosRow.data_matricula).slice(0, 10) : '',
              kms: precosRow.kms != null ? String(precosRow.kms) : '',
              modelo: precosRow.modelo ?? '',
              versao: precosRow.versao ?? '',
              estadoEntrega: precosRow.estado_entrega ?? '',
              negocio: precosRow.estado_negocio === 'VU' ? 'VU' : 'VD',
              marca: precosRow._marcas.includes('BMW Motorrad') ? 'BMW Motorrad' : 'BMW',
              tipologia: precosRow._tipologia,
              locais: getArr(precosRow.local),
              iva: precosRow.iva_dedutivel === true,
              linkFotos: precosRow.link_fotos ?? '',
            },
          } : undefined}
          inputs={precosRow._inps}
          tipo={precosRow._tipo}
          onClose={() => setPrecosChassis(null)}
          onSaved={(changed, identAlterada) => {
            if (identAlterada) { setPrecosChassis(null); void carregar(); return; }
            handlePrecosSaved(precosRow.chassis, changed);
          }}
          comissao={precosRow._comissao}
          premio={precosRow._premio}
          premioDisponivel={premiosOk}
          onPremioSaved={valor => setPremios(prev => {
            const n = { ...prev };
            if (valor > 0) n[precosRow.chassis] = valor; else delete n[precosRow.chassis];
            return n;
          })}
          onAbrirCartao={() => { setPrecosChassis(null); setSelectedChassis(precosRow.chassis); }}
          onArquivar={capabilities.demosGestao ? () => arquivar(precosRow.chassis) : undefined}
        />
      )}

      {novaOpen && (
        <PrecosDialog
          nova={{
            locais: isAdmin ? opcoesLocal : meusLocais,
            modelos,
            chassisExistentes: rows.map(r => r.chassis),
            matriculasExistentes: rows.map(r => matriculaCompacta(r.matricula)).filter(Boolean),
          }}
          inputs={{ ...TEMPLATE_INPUTS }}
          onClose={() => setNovaOpen(false)}
          onCriada={row => { setRows(prev => [buildRow(row as unknown as Viatura), ...prev]); setNovaOpen(false); }}
        />
      )}
    </div>
  );
}

/* ── Cartão de partilha / detalhe ─────────────────────────────────────────────*/
const TRANSPARENT_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function shareText(r: Row): string {
  const L: string[] = [];
  L.push(`🚗 ${[r.modelo, r.versao].filter(Boolean).join(' ')}`.trim());
  const meta = [r._local !== '—' ? `📍 ${r._local}` : '', r._tipologia.join('/')].filter(Boolean).join(' · ');
  if (meta) L.push(meta);
  if (r.matricula) L.push(`Matrícula: ${formatMatricula(r.matricula)}`);
  L.push(`Kms: ${(r.kms ?? 0).toLocaleString('pt-PT')} · ${r._idade} dias`);
  if (r._p.pvp > 0) L.push(`PVP: ${eur(r._p.pvp)}`);
  if (r._p.desc_eur > 0) L.push(`Desconto: ${eur(r._p.desc_eur)} (${perc(r._p.desc_perc)})`);
  if (r._p.pvp_desc > 0) L.push(`💰 PVP Final: ${eur(r._p.pvp_desc)}`);
  if (r.link_fotos && r.link_fotos.trim() !== '') L.push(`📷 Fotos: ${r.link_fotos}`);
  return L.join('\n');
}

function ShareCard({ row, capa, canEdit, email, onCapaChange, onClose }: {
  row: Row;
  capa?: string;
  canEdit: boolean;
  email: string | null;
  onCapaChange: (chassis: string, url: string | null) => void;
  onClose: () => void;
}) {
  const inps = row._inps;
  const s = row._p;
  const reservado = isReservado(row);
  // Foto automática (og:image do link). undefined = a carregar; null = indisponível.
  const [autoPhoto, setAutoPhoto] = useState<string | null | undefined>(undefined);
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A capa manual (upload) tem prioridade; só se procura a automática sem capa.
  useEffect(() => {
    let alive = true;
    setImgError(false);
    if (capa) { setAutoPhoto(undefined); return; }
    const link = row.link_fotos?.trim();
    if (!link) { setAutoPhoto(null); return; }
    setAutoPhoto(undefined);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('foto-preview', { body: { url: link } });
        if (!alive) return;
        setAutoPhoto(error ? null : ((data as { image?: string | null })?.image ?? null));
      } catch { if (alive) setAutoPhoto(null); }
    })();
    return () => { alive = false; };
  }, [row.link_fotos, capa]);

  const finalUrl = capa ?? (typeof autoPhoto === 'string' ? autoPhoto : null);
  const photoLoading = !capa && autoPhoto === undefined && !!row.link_fotos?.trim();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Escolhe um ficheiro de imagem.'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem demasiado grande (máx. 8 MB).'); return; }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const safe = row.chassis.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${safe}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('demo-capas').upload(key, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('demo-capas').getPublicUrl(key);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase.from('demo_capas')
        .upsert({ chassis: row.chassis, url, updated_by: email, updated_at: new Date().toISOString() });
      if (dbErr) throw dbErr;
      onCapaChange(row.chassis, url);
      setImgError(false);
      toast.success('Foto de capa atualizada.');
    } catch (err) {
      toast.error('Falha ao carregar a foto: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removerCapa() {
    setUploading(true);
    try {
      const { error } = await supabase.from('demo_capas').delete().eq('chassis', row.chassis);
      if (error) throw error;
      onCapaChange(row.chassis, null);
      toast.success('Foto removida.');
    } catch (err) {
      toast.error('Falha ao remover: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  // PNG do cartão, pré-gerado quando a foto estabiliza: o navigator.share tem de ser
  // chamado logo no clique (Safari/iOS rejeitam se houver trabalho assíncrono antes).
  const cardRef = useRef<HTMLDivElement>(null);
  const pngRef = useRef<Blob | null>(null);
  const [sharing, setSharing] = useState(false);

  const gerarPng = async (): Promise<Blob> => {
    const node = cardRef.current;
    if (!node) throw new Error('cartão indisponível');
    const blob = await toBlob(node, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff',
      imagePlaceholder: TRANSPARENT_PX,
    });
    if (!blob) throw new Error('imagem vazia');
    return blob;
  };

  useEffect(() => {
    pngRef.current = null;
    if (photoLoading) return;
    let alive = true;
    const t = setTimeout(() => {
      gerarPng().then(b => { if (alive) pngRef.current = b; }).catch(() => { /* gera no clique */ });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [row, finalUrl, imgError, photoLoading]);

  async function partilhar() {
    const titulo = [row.modelo, row.versao].filter(Boolean).join(' ') || 'Viatura';
    const nome = `${titulo} ${row.matricula ? formatMatricula(row.matricula) : chassisCurto(row.chassis)}`
      .trim().replace(/[^\w\-À-ÿ]+/g, '_');
    setSharing(true);
    try {
      const blob = pngRef.current ?? await gerarPng();
      const file = new File([blob], `${nome}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: titulo });
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // utilizador cancelou
          // NotAllowedError (gesto expirado) e afins: descarrega em alternativa.
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Imagem PNG descarregada.');
    } catch (e) {
      toast.error('Não foi possível gerar a imagem: ' + (e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(shareText(row)); toast.success('Resumo copiado.'); }
    catch { toast.error('Não foi possível copiar.'); }
  }

  const line = (label: string, value: string, opts?: { strong?: boolean; className?: string }) => (
    <div className="flex justify-between items-center py-1">
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-xs ${opts?.strong ? 'font-black' : 'font-semibold'} ${opts?.className ?? 'text-foreground'}`}>{value}</span>
    </div>
  );

  /* Corpo do cartão (vertical). share=true: versão para imagem — largura fixa, independente
   * do ecrã, e sem controlos nem informação interna (custo, reserva, notas). */
  const body = (share: boolean) => (
    <div className={share ? 'bg-card w-[512px]' : 'bg-card'}>
      {/* Hero / foto */}
      <div className="relative">
        <div className="aspect-[16/9] w-full bg-gradient-to-br from-brand-dark to-brand-primary overflow-hidden flex items-center justify-center">
          {photoLoading ? (
            <div className="animate-pulse text-white/70 text-xs">A obter foto...</div>
          ) : finalUrl && !imgError ? (
            <img
              src={finalUrl}
              alt={`${row.modelo ?? ''} ${row.versao ?? ''}`}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-white/90">
              <img src={client.logo.src} alt={client.logo.alt} className="h-12 w-12 opacity-90" />
              <span className="text-lg font-black tracking-tight text-center px-4">{[row.modelo, row.versao].filter(Boolean).join(' ')}</span>
              {!share && (canEdit
                ? <span className="flex items-center gap-1 text-[10px] text-white/70"><Camera className="h-3 w-3" /> define uma foto de capa</span>
                : row.link_fotos && <span className="flex items-center gap-1 text-[10px] text-white/60"><ImageOff className="h-3 w-3" /> sem foto de capa</span>)}
            </div>
          )}
        </div>

        {/* Controlo de capa (admin/edição) */}
        {!share && canEdit && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 bg-black/45 hover:bg-black/65 text-white text-[11px] font-semibold rounded-full px-2.5 py-1 transition-colors disabled:opacity-60"
              title="Carregar foto de capa"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {capa ? 'Alterar foto' : 'Definir foto'}
            </button>
            {capa && !uploading && (
              <button
                onClick={removerCapa}
                className="bg-black/45 hover:bg-red-600/80 text-white rounded-full p-1.5 transition-colors"
                title="Remover foto de capa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 flex-wrap">
          {reservado
            ? <span className="px-2 py-0.5 rounded bg-yellow-400 text-yellow-950 text-[10px] font-bold uppercase tracking-wider shadow">Em negociação</span>
            : <span className="px-2 py-0.5 rounded bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider shadow">Disponível</span>}
          {row._tipologia.map(t => (
            <span key={t} className="px-2 py-0.5 rounded bg-white/90 text-brand-dark text-[10px] font-bold uppercase tracking-wider shadow">{t}</span>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground leading-tight">{[row.modelo, row.versao].filter(Boolean).join(' ') || '—'}</h2>
            <p className="text-xs text-muted-foreground font-mono uppercase mt-0.5 flex items-center gap-2 flex-wrap">
              {row.matricula ? formatMatricula(row.matricula) : chassisCurto(row.chassis)}
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row._local}</span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-xl font-black ${reservado ? 'text-red-600' : 'text-brand-primary'}`}>
              {s.pvp_desc > 0 ? eur0(s.pvp_desc) : 'N/A'}
            </div>
            {s.pvp > 0 && s.pvp > s.pvp_desc && (
              <div className="text-[11px] text-muted-foreground line-through">{eur0(s.pvp)}</div>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/40 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1"><Gauge className="h-3 w-3" />Kms</div>
            <div className="text-sm font-bold text-foreground mt-0.5">{(row.kms ?? 0).toLocaleString('pt-PT')}</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1"><Calendar className="h-3 w-3" />Matrícula</div>
            <div className="text-sm font-bold text-foreground mt-0.5">{row.data_matricula ? new Date(row.data_matricula).toLocaleDateString('pt-PT') : '—'}</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Idade</div>
            <div className="text-sm font-bold text-foreground mt-0.5">{row._idade} dias</div>
          </div>
        </div>

        {row.estado_entrega && row.estado_entrega.trim() !== '' && (
          <div className={`text-center text-xs font-bold py-2 rounded-lg border ${
            row.estado_entrega.toLowerCase().includes('imediata')
              ? 'bg-green-500/10 text-green-600 border-green-500/30'
              : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
          }`}>
            Entrega: {row.estado_entrega}
          </div>
        )}

        {/* Decomposição de preço */}
        <div className="border border-border rounded-lg p-3">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Decomposição de preço</h3>
          {line('Preço Base (PVB)', eur(inps.pvb))}
          {line('Opcionais (OPC)', eur(inps.opc))}
          {line('BSI', eur(inps.bsi))}
          {line('ECO', eur(inps.eco))}
          {line('Legalização', eur(inps.leg))}
          {line('ISV', eur(inps.isv))}
          <div className="border-t border-border my-1" />
          {line('PVP', eur(s.pvp), { strong: true })}
          {line(`Desconto (${perc(s.desc_perc)})`, '- ' + eur(s.desc_eur), { className: 'text-red-600' })}
          {!share && line('IVA (s/ custo)', eur(s.iva))}
          {!share && line('Preço de custo', eur(s.p_custo), { strong: true })}
          <div className="border-t border-border my-1" />
          {line('PVP Final', eur(s.pvp_desc), { strong: true, className: 'text-brand-primary' })}
          {line(s.iva_dedutivel ? 'PVP s/ IVA' : 'PVP s/ IVA (ICE, não dedutível)', eur(s.pvp_sem_iva))}
        </div>

        {!share && reservado && (
          <div className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2.5">
            Reservado por <strong className="text-foreground">{row.reserva_user || 'Desconhecido'}</strong>
            {row.reserva_expira && <> · válido até {new Date(row.reserva_expira).toLocaleString('pt-PT')}</>}
          </div>
        )}

        {!share && row.observacoes && row.observacoes.trim() !== '' && (
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Observações: </span>{row.observacoes}
          </div>
        )}

        {/* Ações */}
        {!share && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={partilhar}
              disabled={sharing}
              title="Partilhar o cartão como imagem PNG"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors disabled:opacity-60"
            >
              {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Partilhar
            </button>
            <button
              onClick={copiar}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar resumo
            </button>
            {row.link_fotos && row.link_fotos.trim() !== '' && (
              <a
                href={row.link_fotos}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
                title="Abrir álbum de fotos"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Fotos
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {body(false)}
        <button onClick={onClose} className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Cópia fora do ecrã usada para gerar o PNG de partilha. */}
      <div aria-hidden className="fixed top-0 left-[-10000px] pointer-events-none">
        <div ref={cardRef}>{body(true)}</div>
      </div>
    </div>
  );
}

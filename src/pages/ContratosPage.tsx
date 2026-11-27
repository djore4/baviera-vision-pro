import { useMemo, useState } from 'react';
import { Search, ShieldPlus, Wrench, Zap, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { chip } from '@/lib/chip';
import { cn } from '@/lib/utils';
import {
  MANUTENCAO_BEV, MANUTENCAO_ICE, RI_CONTRATOS, RI_MODELOS, VIGENCIA, type TabelaManutencao,
} from '@/lib/contratos-data';
import {
  agruparManutencao, agruparModelosRI, descricaoRI, filtrarPorCodigo, fmtAnos, fmtKm, fmtPreco, linhasDoModelo,
  precoDe, type ComIva,
} from '@/lib/contratos';

/* ── Tab Contratos (Transversal) ──────────────────────────────────────────────
 * Tabelas de preços (PVP) dos contratos de manutenção BSI/MSI (ICE e BEV) e da
 * extensão de garantia (Repair Inclusive), em vigor desde 01/11/2026. Só leitura,
 * para consulta das equipas comerciais: 'view' chega. Dados em lib/contratos-data.
 * ──────────────────────────────────────────────────────────────────────────── */

type Vista = 'ice' | 'bev' | 'ri';
const VISTAS: { key: Vista; label: string; curto: string; icon: LucideIcon }[] = [
  { key: 'ice', label: 'Manutenção ICE', curto: 'ICE', icon: Wrench },
  { key: 'bev', label: 'Manutenção BEV', curto: 'BEV', icon: Zap },
  { key: 'ri', label: 'Extensão de Garantia', curto: 'Garantia', icon: ShieldPlus },
];

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{children}</p>
);

const TODOS = -1;

/* Controlos comuns: com/sem IVA e pesquisa por código de opção. */
function Barra({ iva, onIva, query, onQuery }: {
  iva: ComIva; onIva: (v: ComIva) => void; query: string; onQuery: (q: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="IVA" className="flex gap-2">
        <button className={chip(iva === 'com')} aria-pressed={iva === 'com'} onClick={() => onIva('com')}>PVP com IVA</button>
        <button className={chip(iva === 'sem')} aria-pressed={iva === 'sem'} onClick={() => onIva('sem')}>PVP sem IVA</button>
      </div>
      <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query} onChange={e => onQuery(e.target.value)} placeholder="Código de opção (ex.: 07NG)"
          aria-label="Pesquisar por código de opção" className="pl-9"
        />
      </div>
    </div>
  );
}

const Cartao = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5', className)}>{children}</div>
);

const Vazio = ({ children }: { children: React.ReactNode }) => (
  <p className="py-8 text-center text-xs font-bold text-muted-foreground">{children}</p>
);

const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th className={cn('whitespace-nowrap px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground', className)}>{children}</th>
);

/* ── Manutenção (ICE e BEV): mesma estrutura, tabelas diferentes ────────────── */
function Manutencao({ tabela, rotuloCat }: { tabela: TabelaManutencao; rotuloCat: string }) {
  const [iva, setIva] = useState<ComIva>('com');
  const [modelo, setModelo] = useState<number>(TODOS);
  const [query, setQuery] = useState('');

  const linhas = useMemo(
    () => filtrarPorCodigo(modelo === TODOS ? tabela.linhas : linhasDoModelo(tabela, modelo, iva), query),
    [tabela, modelo, iva, query],
  );
  const secoes = useMemo(() => agruparManutencao(linhas), [linhas]);

  return (
    <div className="space-y-4">
      <Cartao>
        <Label>Modelo</Label>
        <div className="flex flex-wrap gap-2">
          <button className={chip(modelo === TODOS)} aria-pressed={modelo === TODOS} onClick={() => setModelo(TODOS)}>Todos os modelos</button>
          {tabela.modelos.map((m, i) => (
            <button key={m} className={chip(modelo === i)} aria-pressed={modelo === i} onClick={() => setModelo(i)}>{m}</button>
          ))}
        </div>
        <div className="mt-4"><Barra iva={iva} onIva={setIva} query={query} onQuery={setQuery} /></div>
      </Cartao>

      {secoes.length === 0 ? (
        <Vazio>{query ? 'Nenhum contrato com esse código.' : 'Sem contratos disponíveis para este modelo.'}</Vazio>
      ) : modelo === TODOS ? (
        secoes.map(s => (
          <Cartao key={s.chave} className="px-0 sm:px-0">
            <h3 className="mb-2 px-4 text-sm font-black sm:px-5">{s.titulo}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-xs">
                <thead>
                  <tr className="border-y border-border bg-muted/50">
                    <Th className="sticky left-0 z-10 bg-muted">Código</Th>
                    <Th>Duração</Th>
                    <Th>Quilometragem</Th>
                    {tabela.modelos.map(m => <Th key={m} className="text-right">{m}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.linhas.map(l => (
                    <tr key={`${l.codigo}-${l.intervalo}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 font-mono font-black text-primary">{l.codigo}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtAnos(l.anos)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtKm(l.km)}</td>
                      {tabela.modelos.map((m, i) => (
                        <td key={m} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fmtPreco(precoDe(l, i, iva))}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cartao>
        ))
      ) : (
        secoes.map(s => (
          <Cartao key={s.chave}>
            <h3 className="mb-3 text-sm font-black">
              {s.titulo} <span className="text-xs font-bold text-muted-foreground">· {tabela.modelos[modelo]}</span>
            </h3>
            <div className="space-y-2">
              {s.linhas.map(l => (
                <div key={`${l.codigo}-${l.intervalo}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-black text-primary">{l.codigo}</span>
                    <p className="text-sm font-bold">{fmtAnos(l.anos)} · {fmtKm(l.km)}</p>
                  </div>
                  <span className="whitespace-nowrap text-lg font-black tabular-nums">{fmtPreco(precoDe(l, modelo, iva))}</span>
                </div>
              ))}
            </div>
          </Cartao>
        ))
      )}
      <p className="text-[11px] text-muted-foreground">
        {rotuloCat} Valores por contrato, em vigor desde 01/11/2026. “—” = contrato não disponível para o modelo.
      </p>
    </div>
  );
}

/* ── Extensão de garantia (Repair Inclusive) ────────────────────────────────── */
function Garantia() {
  const [iva, setIva] = useState<ComIva>('com');
  const [modelo, setModelo] = useState<number>(TODOS);
  const [query, setQuery] = useState('');

  const grupos = useMemo(() => agruparModelosRI(RI_MODELOS), []);
  const contratos = useMemo(() => filtrarPorCodigo(RI_CONTRATOS, query), [query]);
  const indices = modelo === TODOS ? RI_MODELOS.map((_, i) => i) : [modelo];

  return (
    <div className="space-y-4">
      <Cartao>
        <Label>Modelo</Label>
        <div className="space-y-3">
          <button className={chip(modelo === TODOS)} aria-pressed={modelo === TODOS} onClick={() => setModelo(TODOS)}>Todos os modelos</button>
          {grupos.map(g => (
            <div key={g.grupo}>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{g.grupo}</p>
              <div className="flex flex-wrap gap-2">
                {g.itens.map(m => (
                  <button key={m.indice} className={chip(modelo === m.indice)} aria-pressed={modelo === m.indice} onClick={() => setModelo(m.indice)}>{m.nome}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4"><Barra iva={iva} onIva={setIva} query={query} onQuery={setQuery} /></div>
      </Cartao>

      {contratos.length === 0 ? <Vazio>Nenhum contrato com esse código.</Vazio> : (
        <Cartao className="px-0 sm:px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-xs">
              <thead>
                <tr className="border-y border-border bg-muted/50">
                  <Th className="sticky left-0 z-10 bg-muted">Código</Th>
                  <Th>Duração / km</Th>
                  <Th>Conteúdo</Th>
                  {indices.map(i => <Th key={i} className="text-right">{RI_MODELOS[i].nome}</Th>)}
                </tr>
              </thead>
              <tbody>
                {contratos.map(c => (
                  <tr key={c.codigo} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-mono font-black text-primary">{c.codigo}</td>
                    <td className="whitespace-nowrap px-3 py-2">{descricaoRI(c)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{c.conteudo}</td>
                    {indices.map(i => (
                      <td key={i} className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">
                        {fmtPreco((iva === 'com' ? c.com : c.sem)[i])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}
      <p className="text-[11px] text-muted-foreground">
        Repair Inclusive: valores por contrato, em vigor desde 01/11/2026. Duração em anos / quilometragem máxima.
      </p>
    </div>
  );
}

export default function ContratosPage() {
  const [vista, setVista] = useState<Vista>('ice');
  const [visitadas, setVisitadas] = useState<Set<Vista>>(new Set(['ice']));

  const escolher = (v: string) => {
    setVista(v as Vista);
    setVisitadas(s => new Set(s).add(v as Vista));
  };

  return (
    <Tabs value={vista} onValueChange={escolher} className="mx-auto max-w-6xl animate-fade-in">
      <div className="mb-4">
        <h2 className="text-lg font-black">Contratos de manutenção e extensão de garantia</h2>
        <p className="text-xs text-muted-foreground">Tabelas de preços PVP · {VIGENCIA}</p>
      </div>

      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/60 p-1 sm:inline-flex sm:w-auto">
        {VISTAS.map(({ key, label, curto, icon: Icon }) => (
          <TabsTrigger
            key={key} value={key} aria-label={label}
            className="flex-col gap-0.5 px-1 py-2 text-[11px] leading-tight data-[state=active]:shadow-sm sm:flex-row sm:gap-1.5 sm:px-4 sm:py-1.5 sm:text-sm"
          >
            <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">{curto}</span>
            <span className="hidden sm:inline">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="ice" forceMount className="mt-4 data-[state=inactive]:hidden">
        {visitadas.has('ice') && <Manutencao tabela={MANUTENCAO_ICE} rotuloCat="BSI/MSI — modelos a combustão (ICE)." />}
      </TabsContent>
      <TabsContent value="bev" forceMount className="mt-4 data-[state=inactive]:hidden">
        {visitadas.has('bev') && <Manutencao tabela={MANUTENCAO_BEV} rotuloCat="BSI/MSI — modelos elétricos (BEV), novos e usados." />}
      </TabsContent>
      <TabsContent value="ri" forceMount className="mt-4 data-[state=inactive]:hidden">
        {visitadas.has('ri') && <Garantia />}
      </TabsContent>
    </Tabs>
  );
}

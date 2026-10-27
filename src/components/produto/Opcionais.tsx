import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  fmtEuro, listDisponibilidade, listOpcionais, listOpModelos, listOpMotorizacoes, modelosDaSerie, ordenarSecoes,
  pesquisarModelos, type Disponibilidade, type Modelo, type OpMotorizacao, type OpTipo, type Opcional,
} from '@/lib/produto';
import { Label10, ModelPicker, StepBadge } from './ModelPicker';
import { pill } from './pill';

const TipoBadge = ({ tipo }: { tipo: OpTipo }) =>
  tipo === 'serie'
    ? <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-black text-background">◼ Série</span>
    : tipo === 'opcional'
      ? <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">◻ Opcional</span>
      : <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">N/D</span>;

const Preco = ({ v }: { v: number | null }) =>
  v === null || v === undefined ? null
    : v > 0 ? <span className="text-xs font-bold text-muted-foreground">{fmtEuro(v)}</span>
      : v === 0 ? <span className="text-xs font-bold text-green-600">Grátis</span> : null;

/* Opcionais: série → modelo → uma motorização, e lista dos opcionais dessa
 * motorização (filtrável por secção). Um clique abre o detalhe com preço,
 * disponibilidade nas outras motorizações, descrição e regras. */
export function Opcionais() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [serie, setSerie] = useState<string | null>(null);
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [mots, setMots] = useState<OpMotorizacao[]>([]);
  const [motId, setMotId] = useState<string | null>(null);
  const [lista, setLista] = useState<Opcional[] | null>(null);
  const [secao, setSecao] = useState('Todas');
  const [aberto, setAberto] = useState<Opcional | null>(null);
  const [disp, setDisp] = useState<Disponibilidade[] | null>(null);
  const modeloReq = useRef(0);
  const motReq = useRef(0);

  useEffect(() => {
    listOpModelos().then(setModelos).catch(e => setErro(e.message)).finally(() => setLoading(false));
  }, []);

  const reset = () => { setModelo(null); setMots([]); setMotId(null); setLista(null); };

  const visiveis = useMemo(() => {
    if (query.trim()) return pesquisarModelos(modelos, query);
    return serie ? modelosDaSerie(modelos, serie) : null;
  }, [modelos, query, serie]);

  const onQuery = (q: string) => { setQuery(q); setSerie(null); if (!q.trim()) reset(); };
  const onSerie = (s: string) => { setQuery(''); setSerie(s); reset(); };

  const onModelo = async (m: Modelo) => {
    const req = ++modeloReq.current;
    setModelo(m); setMots([]); setMotId(null); setLista(null);
    try {
      const r = await listOpMotorizacoes(m.id);
      if (req === modeloReq.current) setMots(r);
    } catch (e) { setErro((e as Error).message); }
  };

  const onMot = async (id: string) => {
    const req = ++motReq.current;
    setMotId(id); setLista(null); setSecao('Todas');
    try {
      const r = await listOpcionais(id);
      if (req === motReq.current) setLista(r);
    } catch (e) { setErro((e as Error).message); }
  };

  const abrir = async (o: Opcional) => {
    setAberto(o); setDisp(null);
    try { setDisp(await listDisponibilidade(o.id)); } catch { setDisp([]); }
  };

  const secoes = useMemo(() => ['Todas', ...ordenarSecoes(lista ?? [])], [lista]);
  const filtrada = useMemo(
    () => (secao === 'Todas' ? lista : lista?.filter(o => o.secao === secao)) ?? [],
    [lista, secao],
  );

  return (
    <div>
      {erro && (
        <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">
          ⚠️ {erro}
        </div>
      )}

      <ModelPicker
        modelos={modelos} loading={loading} query={query} onQuery={onQuery} serie={serie} onSerie={onSerie}
        visiveis={visiveis} modeloId={modelo?.id ?? null} onModelo={onModelo}
      />

      {modelo && (
        <div className="mb-5 rounded-xl border border-border bg-card px-4 py-4 shadow-sm animate-fade-in sm:px-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StepBadge n={2} />
              <Label10>Motorização</Label10>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{modelo.nome}</span>
            </div>
            <button className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive"
              onClick={() => { setMotId(null); setLista(null); }}>Limpar</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {mots.length === 0
              ? ['w-24', 'w-32', 'w-20'].map(w => <div key={w} className={cn('h-9 animate-pulse rounded-full bg-muted', w)} />)
              : mots.map(m => (
                <button key={m.id} className={cn(pill(motId === m.id), 'rounded-full')} onClick={() => onMot(m.id)}>{m.nome}</button>
              ))}
          </div>
        </div>
      )}

      {motId && (
        <div className="animate-fade-in">
          <div className="mb-3 flex items-center gap-3">
            <StepBadge n={3} />
            <Label10>Opcionais</Label10>
          </div>
          {lista === null ? (
            <p className="py-4 text-center text-xs text-muted-foreground">A carregar opcionais...</p>
          ) : (
            <>
              <div className="mb-3 overflow-x-auto rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
                <div className="flex flex-wrap gap-2">
                  {secoes.map(s => (
                    <button key={s} className={cn(pill(secao === s), 'py-1.5')} onClick={() => setSecao(s)}>{s}</button>
                  ))}
                </div>
              </div>
              {filtrada.length === 0 ? (
                <p className="py-8 text-center text-xs font-bold text-muted-foreground">Nenhum opcional encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {filtrada.map(o => (
                    <button key={o.id} onClick={() => abrir(o)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary hover:shadow-sm">
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black text-primary">{o.codigo}</span>
                          <TipoBadge tipo={o.tipo} />
                          <Preco v={o.preco_iva} />
                        </div>
                        <p className="truncate text-sm font-bold">{o.nome}</p>
                        {o.secao && <p className="mt-0.5 text-xs text-muted-foreground">{o.secao}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={!!aberto} onOpenChange={o => { if (!o) setAberto(null); }}>
        <DialogContent className="max-h-[85vh] max-w-lg gap-0 overflow-hidden p-0">
          {aberto && (
            <>
              <DialogHeader className="border-b border-border bg-muted px-5 py-4 text-left">
                <p className="font-mono text-xs font-bold text-primary">{aberto.codigo}</p>
                <DialogTitle className="text-base font-black">{aberto.nome}</DialogTitle>
                <DialogDescription className="sr-only">Detalhe do opcional</DialogDescription>
              </DialogHeader>
              <div className="max-h-[calc(85vh-5rem)] space-y-4 overflow-y-auto p-5">
                {aberto.preco_iva !== null && aberto.preco_iva !== undefined && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Preço c/ IVA</p>
                      <p className="mt-0.5 text-xl font-black text-primary">{aberto.preco_iva === 0 ? 'Grátis (série)' : fmtEuro(aberto.preco_iva)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Preço s/ IVA</p>
                      <p className="mt-0.5 text-sm font-bold text-muted-foreground">{aberto.preco_siva ? fmtEuro(aberto.preco_siva) : ''}</p>
                    </div>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Disponibilidade</p>
                  <div className="flex flex-wrap gap-2">
                    {disp === null ? <p className="text-xs text-muted-foreground">A carregar...</p>
                      : disp.length === 0 ? <p className="text-xs text-muted-foreground">Sem dados.</p>
                        : disp.map((d, i) => (
                          <div key={i} className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5',
                            d.tipo === 'serie' ? 'bg-foreground text-background'
                              : d.tipo === 'opcional' ? 'border border-primary/20 bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground')}>
                            <span className="text-xs font-black">{d.tipo === 'serie' ? '◼' : d.tipo === 'opcional' ? '◻' : '—'}</span>
                            <span className="text-xs font-bold">{d.motorizacao}</span>
                          </div>
                        ))}
                  </div>
                </div>
                {aberto.descricao && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Descrição</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{aberto.descricao}</p>
                  </div>
                )}
                {aberto.regras && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">Regras / Compatibilidade</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{aberto.regras}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

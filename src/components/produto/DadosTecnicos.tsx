import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MAX_COMPARAR, chavesSpecs, getSpecs, listModelos, listMotorizacoes, modelosDaSerie, pesquisarModelos,
  type Modelo, type Motorizacao, type Specs,
} from '@/lib/produto';
import { Label10, ModelPicker, StepBadge } from './ModelPicker';
import { pill } from './pill';

/* Dados Técnicos: escolhe-se série → modelo → até 4 motorizações, e compara-se a
 * ficha técnica lado a lado. Valores a azul = diferem entre as motorizações. */
export function DadosTecnicos() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [serie, setSerie] = useState<string | null>(null);
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [mots, setMots] = useState<Motorizacao[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [cache, setCache] = useState<Record<string, Specs>>({});
  const tabelaRef = useRef<HTMLDivElement>(null);
  const modeloReq = useRef(0);

  useEffect(() => {
    listModelos().then(setModelos).catch(e => setErro(e.message)).finally(() => setLoading(false));
  }, []);

  const reset = () => { setModelo(null); setMots([]); setSel([]); setCache({}); };

  const visiveis = useMemo(() => {
    if (query.trim()) return pesquisarModelos(modelos, query);
    return serie ? modelosDaSerie(modelos, serie) : null;
  }, [modelos, query, serie]);

  const onQuery = (q: string) => { setQuery(q); setSerie(null); if (!q.trim()) reset(); };
  const onSerie = (s: string) => { setQuery(''); setSerie(s); reset(); };

  const onModelo = async (m: Modelo) => {
    const req = ++modeloReq.current;
    setModelo(m); setMots([]); setSel([]); setCache({});
    try {
      const r = await listMotorizacoes(m.id);
      if (req === modeloReq.current) setMots(r);
    } catch (e) { setErro((e as Error).message); }
  };

  const toggle = useCallback(async (id: string) => {
    if (sel.includes(id)) { setSel(s => s.filter(x => x !== id)); return; }
    if (sel.length >= MAX_COMPARAR) { toast.error(`Máximo de ${MAX_COMPARAR} motorizações para comparar.`); return; }
    setSel(s => [...s, id]);
    if (!cache[id]) {
      try {
        const specs = await getSpecs(id);
        setCache(c => ({ ...c, [id]: specs }));
      } catch (e) { setErro((e as Error).message); }
    }
  }, [sel, cache]);

  useEffect(() => {
    if (sel.length > 0) tabelaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [sel.length]);

  const escolhidas = sel.map(id => mots.find(m => m.id === id)).filter((m): m is Motorizacao => !!m);
  const chaves = chavesSpecs(sel, cache);
  const nomeMot = (m: Motorizacao) => m.nome_visual || m.codigo;

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
              onClick={() => { setSel([]); setCache({}); }}>Limpar</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {mots.length === 0
              ? ['w-24', 'w-32', 'w-20'].map(w => <div key={w} className={cn('h-9 animate-pulse rounded-full bg-muted', w)} />)
              : mots.map(m => (
                <button key={m.id} className={cn(pill(sel.includes(m.id)), 'rounded-full')} onClick={() => toggle(m.id)}>
                  {nomeMot(m)}
                </button>
              ))}
          </div>
        </div>
      )}

      {escolhidas.length > 0 && (
        <div ref={tabelaRef} className="animate-fade-in">
          <div className="mb-3 flex items-center gap-3">
            <StepBadge n={3} />
            <Label10>Especificações</Label10>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">— valores a azul indicam diferenças entre motorizações</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="sticky left-0 z-10 w-[42%] bg-muted px-4 py-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground sm:px-5">Especificação</th>
                    {escolhidas.map(m => (
                      <th key={m.id} className="border-l border-border bg-muted px-3 py-4 text-left sm:px-5">
                        <p className="text-xs font-black leading-tight text-primary">{nomeMot(m)}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{m.codigo}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chaves.length === 0 ? (
                    <tr><td colSpan={1 + escolhidas.length} className="py-12 text-center text-sm text-muted-foreground">Sem especificações.</td></tr>
                  ) : chaves.map(chave => {
                    const valores = escolhidas.map(m => cache[m.id]?.[chave] ?? '—');
                    const iguais = valores.every(v => v === valores[0]);
                    return (
                      <tr key={chave} className="border-b border-border even:bg-muted/30">
                        <td className="sticky left-0 bg-card px-4 py-3 text-xs font-medium leading-snug text-muted-foreground sm:px-5">{chave}</td>
                        {valores.map((v, i) => (
                          <td key={i} className={cn('border-l border-border px-3 py-3 text-xs font-bold leading-snug sm:px-5',
                            v === '—' ? 'text-muted-foreground/40' : !iguais ? 'text-primary' : 'text-foreground')}>{v}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {escolhidas.length > 0 && (
        <div className="sticky bottom-0 z-20 -mx-1 mt-4 flex items-center justify-between gap-3 border-t-2 border-primary bg-card px-4 py-3 shadow-2xl">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">A ver</p>
            <p className="truncate text-xs font-bold">{escolhidas.map(nomeMot).join(' · ')}</p>
          </div>
          <button className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground"
            onClick={() => tabelaRef.current?.scrollIntoView?.({ behavior: 'smooth' })}>Ver Tabela ↓</button>
        </div>
      )}
    </div>
  );
}

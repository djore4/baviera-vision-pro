import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  MAX_COMPARAR, getSpecs, linhasOutras, linhasPrincipais, listModelos, listMotorizacoes, pesquisarModelos,
  type LinhaValores, type Modelo, type Motorizacao, type SlotComparador,
} from '@/lib/produto';
import { Label10 } from './ModelPicker';

/* Comparador: até 4 motorizações de quaisquer modelos, lado a lado. Cada slot
 * escolhe-se em dois passos (modelo → motorização). A tabela aparece a partir de
 * 2 slots completos; a azul, o que difere. */

type Passo = { slot: number; modelo: Modelo | null; mots: Motorizacao[] | null } | null;

const nomeMot = (m: Motorizacao) => m.nome_visual || m.codigo;

function Tabela({ titulo, linhas, slots }: { titulo?: string; linhas: LinhaValores[]; slots: SlotComparador[] }) {
  if (linhas.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[400px] text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="w-[42%] bg-muted px-4 py-3 text-left text-xs font-black uppercase text-muted-foreground">{titulo ?? 'Especificação'}</th>
              {slots.map(s => (
                <th key={s.mot.id} className="border-l border-border bg-muted px-3 py-3 text-left">
                  <p className="text-xs font-black leading-tight text-primary">{s.modelo.nome}</p>
                  <p className="mt-0.5 text-xs font-bold text-muted-foreground">{nomeMot(s.mot)}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.label} className="border-b border-border transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.label}</td>
                {l.valores.map((v, i) => (
                  <td key={i} className={cn('border-l border-border px-3 py-2.5 text-xs font-bold',
                    v === '—' ? 'text-muted-foreground/40' : l.difere ? 'text-primary' : 'text-foreground')}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Comparador() {
  const [slots, setSlots] = useState<(SlotComparador | null)[]>(Array(MAX_COMPARAR).fill(null));
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [passo, setPasso] = useState<Passo>(null);
  const [q, setQ] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    if (passo && modelos === null) listModelos().then(setModelos).catch(e => setErro(e.message));
  }, [passo, modelos]);

  const abrir = (slot: number) => { setQ(''); setPasso({ slot, modelo: null, mots: null }); };

  const escolherModelo = async (m: Modelo) => {
    if (!passo) return;
    setPasso({ ...passo, modelo: m, mots: null });
    try {
      const mots = await listMotorizacoes(m.id);
      setPasso(p => (p && p.modelo?.id === m.id ? { ...p, mots } : p));
    } catch (e) { setErro((e as Error).message); }
  };

  const escolherMot = async (mot: Motorizacao) => {
    if (!passo?.modelo) return;
    const { slot, modelo } = passo;
    try {
      const specs = await getSpecs(mot.id);
      setSlots(s => s.map((x, i) => (i === slot ? { modelo, mot, specs } : x)));
      setPasso(null);
    } catch (e) { setErro((e as Error).message); }
  };

  const limparSlot = (i: number) => setSlots(s => s.map((x, j) => (j === i ? null : x)));

  const completos = slots.filter((s): s is SlotComparador => !!s);
  const specs = useMemo(() => completos.map(s => s.specs), [completos]);
  const principais = useMemo(() => (completos.length >= 2 ? linhasPrincipais(specs) : []), [completos.length, specs]);
  const outras = useMemo(() => (completos.length >= 2 && todas ? linhasOutras(specs) : []), [completos.length, specs, todas]);
  const lista = useMemo(() => pesquisarModelos(modelos ?? [], q), [modelos, q]);

  return (
    <div>
      {erro && (
        <div role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">⚠️ {erro}</div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {slots.map((s, i) => s ? (
          <div key={i} className="flex min-h-36 flex-col gap-2 rounded-xl border-2 border-primary bg-card p-4">
            <div className="flex justify-between">
              <div className="flex-1">
                <p className="text-xs font-black">{s.modelo.nome}</p>
                <p className="mt-1 text-xs font-bold text-primary">{nomeMot(s.mot)}</p>
              </div>
              <button aria-label="Remover" className="ml-1 text-muted-foreground hover:text-destructive" onClick={() => limparSlot(i)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-auto flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-xs font-bold uppercase text-primary">Pronto</span>
            </div>
          </div>
        ) : (
          <button key={i} onClick={() => abrir(i)}
            className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card p-4 transition-colors hover:border-primary">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground"><Plus className="h-5 w-5" /></span>
            <span className="text-center text-xs font-bold uppercase text-muted-foreground">Adicionar viatura</span>
          </button>
        ))}
      </div>

      {completos.length === 1 && (
        <p className="py-6 text-center text-xs font-bold text-muted-foreground">Adicione pelo menos mais uma viatura para comparar.</p>
      )}

      {completos.length >= 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label10>Comparação</Label10>
            <div className="flex items-center gap-4">
              <button className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
                onClick={() => setTodas(t => !t)}>{todas ? 'Só principais' : 'Todas as especificações'}</button>
              <button className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive"
                onClick={() => setSlots(Array(MAX_COMPARAR).fill(null))}>Limpar tudo</button>
            </div>
          </div>
          <Tabela linhas={principais} slots={completos} />
          {todas && <Tabela titulo="Outras especificações" linhas={outras} slots={completos} />}
        </div>
      )}

      <Dialog open={!!passo} onOpenChange={o => { if (!o) setPasso(null); }}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-3">
          <DialogHeader className="text-left">
            <DialogTitle>{passo?.modelo ? `Motorização — ${passo.modelo.nome}` : 'Escolher modelo'}</DialogTitle>
            <DialogDescription className="sr-only">Escolha o modelo e a motorização a comparar</DialogDescription>
          </DialogHeader>
          {!passo?.modelo && (
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar modelo ou código" />
          )}
          <div className="-mr-2 flex-1 space-y-1 overflow-y-auto pr-2">
            {!passo?.modelo ? (
              modelos === null ? <p className="py-6 text-center text-xs text-muted-foreground">A carregar...</p>
                : lista.length === 0 ? <p className="py-6 text-center text-xs font-bold text-muted-foreground">Nenhum modelo encontrado.</p>
                  : lista.map(m => (
                    <button key={m.id} onClick={() => escolherModelo(m)}
                      className="w-full rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5">
                      <p className="text-sm font-black">{m.nome}</p>
                      <p className="font-mono text-xs text-muted-foreground">{m.codigo}</p>
                    </button>
                  ))
            ) : passo.mots === null ? (
              <p className="py-6 text-center text-xs text-muted-foreground">A carregar...</p>
            ) : (
              <>
                {passo.mots.map(m => (
                  <button key={m.id} onClick={() => escolherMot(m)}
                    className="w-full rounded-xl border border-border px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5">
                    <p className="text-sm font-black">{nomeMot(m)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{m.codigo}</p>
                  </button>
                ))}
                <button className="pt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
                  onClick={() => setPasso(p => (p ? { ...p, modelo: null, mots: null } : p))}>← Outro modelo</button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

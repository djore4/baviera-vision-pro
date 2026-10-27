import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { pill } from './pill';
import { seriesPresentes, type Modelo } from '@/lib/produto';

/* Passo 1 de Dados Técnicos e Opcionais: pesquisa + série + modelo. Sem pesquisa, a
 * lista de modelos só aparece depois de escolhida uma série; com pesquisa, mostra os
 * modelos que correspondem (e nenhuma série fica ativa). */

export const StepBadge = ({ n }: { n: number }) => (
  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">{n}</span>
);

export const Label10 = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{children}</p>
);

interface Props {
  modelos: Modelo[];
  query: string;
  onQuery: (q: string) => void;
  serie: string | null;
  onSerie: (s: string) => void;
  /** Modelos a mostrar no 2.º cartão (null = escondido). */
  visiveis: Modelo[] | null;
  modeloId: string | null;
  onModelo: (m: Modelo) => void;
  loading?: boolean;
}

export function ModelPicker({ modelos, query, onQuery, serie, onSerie, visiveis, modeloId, onModelo, loading }: Props) {
  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Inserir código ou palavra para pesquisa"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mb-3 rounded-xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
        {loading ? (
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">A carregar...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...seriesPresentes(modelos), 'Todos'].map(s => (
              <button key={s} className={cn(pill(serie === s), 'sm:px-6 text-sm')} onClick={() => onSerie(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {visiveis && (
        <div className="mb-5 rounded-xl border border-border bg-card px-4 py-4 shadow-sm animate-fade-in sm:px-5">
          <div className="mb-3"><Label10>Outras categorias</Label10></div>
          {visiveis.length === 0 ? (
            <p className="py-2 text-xs font-bold text-muted-foreground">Nenhum modelo encontrado.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {visiveis.map(m => (
                <button key={m.id} className={pill(modeloId === m.id)} onClick={() => onModelo(m)}>{m.nome}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

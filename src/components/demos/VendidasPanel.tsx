import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { chassisCurto, formatMatricula } from '@/lib/viaturaFormat';

/* ── Arquivo de viaturas vendidas (consulta e recuperação) ────────────────────
 * Mesmo arquivo da Gestão VD da Sales Force (tabela viaturas_vendidas): dados e preço
 * cristalizados no momento da venda. Só se acede por demos_vendidas() / demos_repor_viatura(),
 * que limitam ao administrador e a quem gere os preços do seu local.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Vendida {
  id: number;
  chassis: string | null;
  matricula: string | null;
  modelo: string | null;
  versao: string | null;
  encomenda: string | null;
  local: unknown;
  preco_final: number | null;
  data_venda: string | null;
  vendido_por: string | null;
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
const eur = (n: number | null) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }));

export default function VendidasPanel({ onRepor }: { onRepor: () => void }) {
  const [rows, setRows] = useState<Vendida[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [aRepor, setARepor] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('demos_vendidas');
    if (error) { setErro(error.message); setRows([]); } else { setErro(null); setRows((data as unknown as Vendida[]) ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(v => [v.modelo, v.versao, v.matricula, formatMatricula(v.matricula), v.chassis, v.encomenda]
      .some(x => (x ?? '').toString().toLowerCase().includes(t)));
  }, [rows, q]);

  async function repor(v: Vendida) {
    const nome = `${[v.modelo, v.versao].filter(Boolean).join(' ')} (${v.matricula ? formatMatricula(v.matricula) : chassisCurto(v.chassis)})`;
    if (!window.confirm(`Recuperar ${nome} para o parque ativo?\n\nSai de "Vendidas".`)) return;
    setARepor(v.id);
    const { error } = await supabase.rpc('demos_repor_viatura', { p_id: v.id });
    setARepor(null);
    if (error) {
      toast.error(error.code === '23505' ? 'Já existe no parque uma viatura com este chassis.'
        : error.code === '42501' ? 'Sem permissão para recuperar esta viatura.' : `Não foi possível recuperar: ${error.message}`);
      return;
    }
    toast.success('Viatura recuperada para o parque.');
    setRows(prev => prev.filter(x => x.id !== v.id));
    onRepor();
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Pesquisar (modelo, matrícula, chassis, encomenda)..."
          className="w-full pl-8 pr-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {erro && <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20">Erro ao carregar o arquivo: {erro}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar vendidas...</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                {['Data venda', 'Viatura', 'Matrícula', 'Chassis', 'Enc', 'Local', 'Preço final', 'Vendido por', ''].map((h, i) => (
                  <th key={i} className={`px-2.5 py-2 font-semibold whitespace-nowrap border-b border-border ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(v => (
                <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">{v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-PT') : '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-semibold">{[v.modelo, v.versao].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-mono uppercase">{v.matricula ? formatMatricula(v.matricula) : '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-mono uppercase text-muted-foreground">{chassisCurto(v.chassis) || '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap font-mono text-muted-foreground">{v.encomenda || '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{lista(v.local).join(', ') || '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-right font-bold text-brand-primary">{eur(v.preco_final)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground">{v.vendido_por || '—'}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-right">
                    <button
                      onClick={() => repor(v)} disabled={aRepor === v.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border border-border rounded-md hover:bg-brand-primary hover:text-white hover:border-brand-primary transition-colors disabled:opacity-50"
                    >
                      {aRepor === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Recuperar viatura
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {rows.length === 0 ? 'Nenhuma viatura vendida registada.' : 'Nenhuma viatura encontrada.'}
            </div>
          )}
        </div>
      )}
      {!loading && rows.length > 0 && <p className="text-[11px] text-muted-foreground">{filtradas.length} de {rows.length} vendidas</p>}
    </div>
  );
}

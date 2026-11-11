import { useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { exportControlExcel } from '@/lib/control-export';
import { RECORDS_CHANGED_EVENT } from '@/components/RecordEditor';
import {
  parseFaturasReport, planFaturas, aplicarFaturas, type FaturasPlano,
} from '@/lib/faturas-report';

const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Controlo de faturas: carrega o relatório de vendas, mostra o que muda (data de
 *  fatura e de matrícula, por chassis) e só grava depois de confirmado. */
export function FaturasControl() {
  const { data, loading, refresh } = useData();
  const { canEdit } = usePermissions();
  const podeGravar = canEdit('dados') || canEdit('database');
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [plano, setPlano] = useState<FaturasPlano | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !data) return;
    setError(null); setDone(null); setPlano(null); setWorking(true);
    try {
      const rows = parseFaturasReport(await file.arrayBuffer());
      if (rows.length === 0) throw new Error('O relatório não tem viaturas.');
      setFileName(file.name);
      setPlano(planFaturas(data.control, rows));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler o relatório');
    } finally {
      setWorking(false);
    }
  };

  const aplicar = async () => {
    if (!plano) return;
    setWorking(true); setError(null);
    try {
      const n = await aplicarFaturas(plano.alteracoes);
      setDone(n); setPlano(null);
      window.dispatchEvent(new CustomEvent(RECORDS_CHANGED_EVENT));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gravar');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4 lg:col-span-1">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Controlo de Faturas</h2>
      <p className="text-xs text-muted-foreground">
        Carrega o <strong>relatório de vendas</strong>. Cada viatura é cruzada pelo chassis (7 últimos caracteres do VIN) e
        a <strong>data de fatura</strong> e a <strong>data de matrícula</strong> são atualizadas. <strong>O relatório manda</strong>:
        datas diferentes são substituídas. Antes de gravar vês o que muda.
      </p>
      <Button size="lg" className="w-full gap-2" onClick={() => inputRef.current?.click()}
        disabled={loading || working || !data || !podeGravar}>
        {working ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        {working ? 'A processar...' : 'Carregar relatório de faturas'}
      </Button>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onFile} />
      <Button variant="outline" size="lg" className="w-full gap-2"
        onClick={() => data && exportControlExcel(data.control)}
        disabled={loading || !data || data.control.length === 0}>
        <Download className="h-5 w-5" />
        Descarregar Excel VN
      </Button>
      <p className="text-[11px] text-muted-foreground">Cópia dos dados atuais, só para consulta.</p>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
      {done !== null && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
          <p className="text-sm font-medium text-foreground">{done} registos atualizados</p>
        </div>
      )}

      {plano && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="faturas-plano">
          <p className="text-xs text-muted-foreground">Relatório <span className="font-medium">{fileName}</span></p>
          <div className="grid grid-cols-2 gap-2 text-center">
            {[
              ['A atualizar', plano.alteracoes.length],
              ['Já certos', plano.iguais],
              ['Sem correspondência', plano.semCorrespondencia.length],
              ['Ambíguos / anuladas', plano.ambiguos.length + plano.anuladas.length],
            ].map(([l, n]) => (
              <div key={l as string} className="rounded border border-border p-2">
                <p className="text-lg font-bold tabular-nums">{n}</p>
                <p className="text-[10px] text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>

          {plano.alteracoes.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border border-border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-card text-muted-foreground">
                  <tr><th className="px-2 py-1 text-left">Resp</th><th className="px-2 py-1 text-left">Chassis</th>
                    <th className="px-2 py-1 text-left">Campo</th><th className="px-2 py-1 text-left">Atual → Relatório</th></tr>
                </thead>
                <tbody>
                  {plano.alteracoes.flatMap(a => [
                    a.dfat && { k: `${a.id}-f`, a, campo: 'DFAT', ch: a.dfat },
                    a.dmat && { k: `${a.id}-m`, a, campo: 'DMAT', ch: a.dmat },
                  ]).filter(Boolean).map(x => {
                    const r = x as { k: string; a: typeof plano.alteracoes[number]; campo: string; ch: { de: string | null; para: string } };
                    return (
                      <tr key={r.k} className="border-t border-border">
                        <td className="px-2 py-1 font-medium">{r.a.resp}</td>
                        <td className="px-2 py-1">{r.a.chas}</td>
                        <td className="px-2 py-1">{r.campo}</td>
                        <td className="px-2 py-1 tabular-nums">
                          {fmt(r.ch.de)} → <strong>{fmt(r.ch.para)}</strong>
                          {r.ch.de && <span className="ml-1 text-amber-600">substitui</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(plano.semCorrespondencia.length > 0 || plano.ambiguos.length > 0 || plano.anuladas.length > 0) && (
            <div className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] space-y-1">
                {plano.semCorrespondencia.length > 0 && <p><strong>Sem registo na plataforma</strong> (não gravados): {plano.semCorrespondencia.join(', ')}</p>}
                {plano.ambiguos.length > 0 && <p><strong>Chassis com mais de um registo</strong> (não gravados): {plano.ambiguos.map(a => a.vin).join(', ')}</p>}
                {plano.anuladas.length > 0 && <p><strong>Faturas anuladas</strong> (movimentos que se neutralizam, ignoradas): {plano.anuladas.join(', ')}</p>}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setPlano(null)} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
            <button onClick={aplicar} disabled={working || plano.alteracoes.length === 0}
              className="px-4 py-1.5 text-xs bg-primary text-primary-foreground font-semibold rounded disabled:opacity-50">
              Aplicar {plano.alteracoes.length} alterações
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

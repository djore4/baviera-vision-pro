import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  fmtDia, importLeads, parseLeadsFile, parseLeadsText, planImport,
  type Lead, type ParsedImport,
} from '@/lib/campanha-i3';

const EMPTY: ParsedImport = { rows: [], erros: [], avisos: [] };
const PREVIEW_ROWS = 8;

interface Props {
  open: boolean;
  existentes: Lead[];
  onClose: () => void;
  /** Chamado com as oportunidades inseridas e o número de duplicadas ignoradas. */
  onImported: (inseridas: Lead[], duplicadas: number) => void;
}

/* Importar a tabela da campanha: cola-se do Excel (ou carrega-se o ficheiro), vê-se o que
 * vai entrar e o que já existe, e confirma-se. Pode repetir-se ao longo do dia com a
 * lista acumulada: o que já foi importado é ignorado, não duplica. */
export function ImportDialog({ open, existentes, onClose, onImported }: Props) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport>(EMPTY);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const plan = useMemo(() => planImport(parsed.rows, existentes), [parsed, existentes]);
  const temDados = parsed.rows.length > 0 || parsed.erros.length > 0;

  const reset = () => { setText(''); setParsed(EMPTY); setFileName(null); if (fileRef.current) fileRef.current.value = ''; };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const onText = (v: string) => { setText(v); setFileName(null); setParsed(v.trim() ? parseLeadsText(v) : EMPTY); };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      setText('');
      setParsed(parseLeadsFile(await f.arrayBuffer()));
      setFileName(f.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível ler o ficheiro.');
    }
  };

  const confirm = async () => {
    if (plan.novas.length === 0) return;
    setBusy(true);
    try {
      const inseridas = await importLeads(plan.novas);
      onImported(inseridas, plan.duplicadas.length + (plan.novas.length - inseridas.length));
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível importar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) close(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar oportunidades</DialogTitle>
          <DialogDescription>
            Cola a tabela do Excel (com o cabeçalho: Nome Entidade, E-mail Entidade, Contacto Entidade, Data Contacto, Polo)
            ou carrega o ficheiro. Podes colar a lista acumulada do dia: as que já existem são ignoradas.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text} onChange={e => onText(e.target.value)} rows={6} spellCheck={false}
          placeholder={'Nome Entidade\tE-mail Entidade\tContacto Entidade\tData Contacto\tPolo\nTiago Gonçalves\timperyal@gmail.com\t925344820\t29/10/2026\tDCC - Aveiro'}
          className="font-mono text-xs" aria-label="Tabela colada"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Ficheiro" onChange={e => void onFile(e.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Carregar Excel / CSV
          </Button>
          {fileName && <span>{fileName}</span>}
        </div>

        {temDados && (
          <div className="space-y-3" data-testid="import-preview">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-700 dark:bg-green-500/20 dark:text-green-300">
                {plan.novas.length} {plan.novas.length === 1 ? 'nova' : 'novas'}
              </span>
              {plan.duplicadas.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                  {plan.duplicadas.length} já {plan.duplicadas.length === 1 ? 'existe' : 'existem'}
                </span>
              )}
              {parsed.erros.length > 0 && (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-700 dark:bg-red-500/20 dark:text-red-300">
                  {parsed.erros.length} {parsed.erros.length === 1 ? 'linha ignorada' : 'linhas ignoradas'}
                </span>
              )}
            </div>

            {plan.novas.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr><th className="px-2 py-1.5">Nome</th><th className="px-2 py-1.5">E-mail</th><th className="px-2 py-1.5">Contacto</th><th className="px-2 py-1.5">Data</th><th className="px-2 py-1.5">Polo</th></tr>
                  </thead>
                  <tbody>
                    {plan.novas.slice(0, PREVIEW_ROWS).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1.5">{r.nome}</td>
                        <td className="px-2 py-1.5">{r.email ?? '—'}</td>
                        <td className="px-2 py-1.5">{r.contacto ?? '—'}</td>
                        <td className="px-2 py-1.5">{fmtDia(r.data_contacto)}</td>
                        <td className="px-2 py-1.5">{r.polo ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.novas.length > PREVIEW_ROWS && (
                  <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">… e mais {plan.novas.length - PREVIEW_ROWS}.</p>
                )}
              </div>
            )}

            {plan.duplicadas.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Já existem: {plan.duplicadas.slice(0, 6).map(d => d.lead.nome).join(', ')}
                {plan.duplicadas.length > 6 ? ` e mais ${plan.duplicadas.length - 6}` : ''} (mesmo email ou telefone).
              </p>
            )}

            {[...parsed.erros, ...parsed.avisos].length > 0 && (
              <ul className="space-y-0.5 rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                {[...parsed.erros, ...parsed.avisos].slice(0, 8).map((x, i) => (
                  <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Linha {x.linha}: {x.msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || plan.novas.length === 0}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Importar {plan.novas.length > 0 ? plan.novas.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DOC_ACCEPT, MAX_MB, deleteAnexo, fmtTamanho, listAnexos, uploadAnexo, urlDownload, validarDocumento, type Anexo,
} from '@/lib/marketing-data';

/* Brochuras, convites, programas… para descarregar. Até 5 MB por ficheiro. */
export function DocumentosPanel({ eventoId, readOnly = false }: { eventoId: string; readOnly?: boolean }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setAnexos([]);
    listAnexos(eventoId).then(a => { if (vivo) setAnexos(a); });
    return () => { vivo = false; };
  }, [eventoId]);

  const onFiles = async (files: FileList | null) => {
    const sel = Array.from(files ?? []);
    if (input.current) input.current.value = '';
    if (sel.length === 0) return;
    setUploading(true);
    for (const f of sel) {
      const invalido = validarDocumento(f);
      if (invalido) { toast.error(invalido); continue; }
      try { const novo = await uploadAnexo(eventoId, f); setAnexos(a => [...a, novo]); }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível carregar o ficheiro.'); }
    }
    setUploading(false);
  };

  const abrir = async (a: Anexo) => {
    setBusyId(a.id);
    try { window.open(await urlDownload(a), '_blank', 'noopener'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível abrir o ficheiro.'); }
    finally { setBusyId(null); }
  };

  const remover = async (a: Anexo) => {
    setBusyId(a.id);
    try { await deleteAnexo(a); setAnexos(l => l.filter(x => x.id !== a.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível remover o ficheiro.'); }
    finally { setBusyId(null); }
  };

  return (
    <section data-testid="documentos" className="space-y-3">
      {anexos.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{readOnly ? 'Sem documentos.' : 'Sem documentos. Anexa brochuras, convites ou o programa.'}</p>
      ) : (
        <ul className="space-y-1.5">
          {anexos.map(a => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={a.nome}>
                {a.nome}
                {a.tamanho != null && <span className="ml-1.5 text-xs text-muted-foreground">{fmtTamanho(a.tamanho)}</span>}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrir(a)} disabled={busyId === a.id} aria-label={`Descarregar ${a.nome}`}>
                {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </Button>
              {!readOnly && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remover(a)} disabled={busyId === a.id} aria-label={`Remover ${a.nome}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <>
          <input ref={input} type="file" multiple accept={DOC_ACCEPT} className="hidden" data-testid="documentos-input" onChange={e => onFiles(e.target.files)} />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
              Anexar ficheiro
            </Button>
            <span className="text-xs text-muted-foreground">PDF, imagens ou Office, até {MAX_MB} MB cada.</span>
          </div>
        </>
      )}
    </section>
  );
}

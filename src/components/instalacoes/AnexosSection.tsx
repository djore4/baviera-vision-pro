import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  ANEXO_ACCEPT, deleteAnexo, fmtTamanho, listAnexos, uploadAnexo, urlAnexo, validarAnexo, type Anexo,
} from '@/lib/instalacoes';

interface Props {
  ocorrenciaId: string;
  canEdit: boolean;
}

export function AnexosSection({ ocorrenciaId, canEdit }: Props) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    setAnexos([]);
    listAnexos(ocorrenciaId).then(a => { if (alive) setAnexos(a); });
    return () => { alive = false; };
  }, [ocorrenciaId]);

  const onFiles = async (files: FileList | null) => {
    const sel = Array.from(files ?? []);
    if (input.current) input.current.value = '';
    if (sel.length === 0) return;
    setUploading(true);
    for (const f of sel) {
      const invalido = validarAnexo(f);
      if (invalido) { toast.error(invalido); continue; }
      try {
        const novo = await uploadAnexo(ocorrenciaId, f);
        setAnexos(a => [...a, novo]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível carregar o anexo.');
      }
    }
    setUploading(false);
  };

  const abrir = async (a: Anexo) => {
    setBusyId(a.id);
    try {
      window.open(await urlAnexo(a), '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível abrir o anexo.');
    } finally {
      setBusyId(null);
    }
  };

  const remover = async (a: Anexo) => {
    setBusyId(a.id);
    try {
      await deleteAnexo(a);
      setAnexos(l => l.filter(x => x.id !== a.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível remover o anexo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section data-testid="anexos">
      <h4 className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Paperclip className="h-3 w-3" /> Anexos{anexos.length > 0 && ` (${anexos.length})`}
      </h4>

      {anexos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem anexos.</p>
      ) : (
        <ul className="space-y-1">
          {anexos.map(a => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={a.nome}>
                {a.nome}
                {a.tamanho != null && <span className="ml-1.5 text-xs text-muted-foreground">{fmtTamanho(a.tamanho)}</span>}
              </span>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => abrir(a)} disabled={busyId === a.id} aria-label={`Abrir ${a.nome}`}>
                {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </Button>
              {canEdit && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => remover(a)} disabled={busyId === a.id} aria-label={`Remover ${a.nome}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          <input ref={input} type="file" multiple accept={ANEXO_ACCEPT} className="hidden"
            data-testid="anexos-input" onChange={e => onFiles(e.target.files)} />
          <Button type="button" variant="outline" size="sm" className="mt-2"
            onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
            Anexar ficheiro
          </Button>
        </>
      )}
    </section>
  );
}

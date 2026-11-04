import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  CONVITE_ACCEPT, DOC_ACCEPT, MAX_MB, deleteAnexo, fmtTamanho, listAnexos, uploadAnexo, urlDownload,
  validarConvite, validarDocumento, type Anexo, type CategoriaAnexo,
} from '@/lib/marketing-data';
import { useUrlFicheiro } from './useUrlFicheiro';

/* Ficheiros do evento para carregar e descarregar (até 5 MB cada).
 *  · 'convite': o convite do evento (imagem ou PDF), em grelha com pré-visualização —
 *    quem tem acesso descarrega-o e envia-o aos convidados.
 *  · 'documento': brochuras, programa… em lista. */
const TEXTOS: Record<CategoriaAnexo, {
  vazio: string; vazioSoLeitura: string; botao: string; ajuda: string;
  accept: string; validar: typeof validarDocumento; testid: string;
}> = {
  convite: {
    vazio: 'Ainda sem convites. Carrega aqui o convite do evento (imagem ou PDF) para a equipa o descarregar e enviar aos convidados.',
    vazioSoLeitura: 'Ainda sem convites para este evento.',
    botao: 'Carregar convite',
    ajuda: `Imagem ou PDF, até ${MAX_MB} MB cada.`,
    accept: CONVITE_ACCEPT, validar: validarConvite, testid: 'convites',
  },
  documento: {
    vazio: 'Sem documentos. Anexa brochuras ou o programa.',
    vazioSoLeitura: 'Sem documentos.',
    botao: 'Anexar ficheiro',
    ajuda: `PDF, imagens ou Office, até ${MAX_MB} MB cada.`,
    accept: DOC_ACCEPT, validar: validarDocumento, testid: 'documentos',
  },
};

const eImagem = (a: Pick<Anexo, 'tipo' | 'nome'>) => (a.tipo ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.nome);

function Miniatura({ a }: { a: Anexo }) {
  const url = useUrlFicheiro(eImagem(a) ? a.path : null);
  return (
    <div className="flex h-36 items-center justify-center overflow-hidden bg-muted">
      {url
        ? <img src={url} alt={`Convite ${a.nome}`} loading="lazy" className="h-full w-full object-cover" />
        : <FileText className="h-10 w-10 text-muted-foreground" />}
    </div>
  );
}

export function AnexosPanel({ eventoId, categoria, readOnly = false }: { eventoId: string; categoria: CategoriaAnexo; readOnly?: boolean }) {
  const t = TEXTOS[categoria];
  const grelha = categoria === 'convite';
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    setAnexos([]);
    listAnexos(eventoId, categoria).then(a => { if (vivo) setAnexos(a); });
    return () => { vivo = false; };
  }, [eventoId, categoria]);

  const onFiles = async (files: FileList | null) => {
    const sel = Array.from(files ?? []);
    if (input.current) input.current.value = '';
    if (sel.length === 0) return;
    setUploading(true);
    for (const f of sel) {
      const invalido = t.validar(f);
      if (invalido) { toast.error(invalido); continue; }
      try { const novo = await uploadAnexo(eventoId, f, categoria); setAnexos(a => [...a, novo]); }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível carregar o ficheiro.'); }
    }
    setUploading(false);
  };

  const descarregar = async (a: Anexo) => {
    setBusyId(a.id);
    try { window.open(await urlDownload(a), '_blank', 'noopener'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível descarregar o ficheiro.'); }
    finally { setBusyId(null); }
  };

  const remover = async (a: Anexo) => {
    setBusyId(a.id);
    try { await deleteAnexo(a); setAnexos(l => l.filter(x => x.id !== a.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível remover o ficheiro.'); }
    finally { setBusyId(null); }
  };

  const acoes = (a: Anexo) => (
    <>
      <Button type="button" variant={grelha ? 'default' : 'ghost'} size={grelha ? 'sm' : 'icon'} className={grelha ? 'h-8 flex-1' : 'h-7 w-7'}
        onClick={() => descarregar(a)} disabled={busyId === a.id} aria-label={`Descarregar ${a.nome}`}>
        {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className={grelha ? 'mr-1.5 h-3.5 w-3.5' : 'h-3.5 w-3.5'} />}
        {grelha && 'Descarregar'}
      </Button>
      {!readOnly && (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
          onClick={() => remover(a)} disabled={busyId === a.id} aria-label={`Remover ${a.nome}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  );

  return (
    <section data-testid={t.testid} className="space-y-3">
      {anexos.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{readOnly ? t.vazioSoLeitura : t.vazio}</p>
      ) : grelha ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {anexos.map(a => (
            <li key={a.id} className="overflow-hidden rounded-lg border bg-card shadow-sm">
              <Miniatura a={a} />
              <div className="space-y-2 p-2.5">
                <p className="truncate text-sm font-medium" title={a.nome}>
                  {a.nome}
                  {a.tamanho != null && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{fmtTamanho(a.tamanho)}</span>}
                </p>
                <div className="flex gap-1.5">{acoes(a)}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-1.5">
          {anexos.map(a => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={a.nome}>
                {a.nome}
                {a.tamanho != null && <span className="ml-1.5 text-xs text-muted-foreground">{fmtTamanho(a.tamanho)}</span>}
              </span>
              {acoes(a)}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <>
          <input ref={input} type="file" multiple accept={t.accept} className="hidden" data-testid={`${t.testid}-input`} onChange={e => onFiles(e.target.files)} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant={grelha ? 'default' : 'outline'} size="sm" onClick={() => input.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : grelha ? <Upload className="mr-1.5 h-3.5 w-3.5" /> : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
              {t.botao}
            </Button>
            <span className="text-xs text-muted-foreground">{t.ajuda}</span>
          </div>
        </>
      )}
    </section>
  );
}

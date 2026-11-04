import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Settings2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOCAL_PADRAO, highlightsDeTexto, type Categoria, type EventoInput, type MarketingEvento, type Orcamento } from '@/lib/marketing';
import { IMAGEM_ACCEPT, MAX_MB, createEvento, removerFicheiro, saveOrcamento, updateEvento, uploadCapa, validarImagem } from '@/lib/marketing-data';
import { useUrlFicheiro } from './useUrlFicheiro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = novo evento. */
  evento: MarketingEvento | null;
  categorias: Categoria[];
  /** Orçamento atual do evento (null se não houver). */
  orcamento: Orcamento | null;
  onSaved: (ev: MarketingEvento, orcamento: Orcamento) => void;
  onGerirCategorias: () => void;
}

const SEM_CATEGORIA = '__nenhuma__';

const num = (s: string): number | null => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const txt = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

export function EventoDialog({ open, onOpenChange, evento, categorias, orcamento, onSaved, onGerirCategorias }: Props) {
  const [titulo, setTitulo] = useState('');
  const [categoriaId, setCategoriaId] = useState<string>(SEM_CATEGORIA);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [hora, setHora] = useState('');
  const [local, setLocal] = useState(LOCAL_PADRAO);
  const [descricao, setDescricao] = useState('');
  const [dress, setDress] = useState('');
  const [highlights, setHighlights] = useState('');
  const [previsto, setPrevisto] = useState('');
  const [real, setReal] = useState('');
  const [capaPath, setCapaPath] = useState<string | null>(null);
  const [capaNova, setCapaNova] = useState<File | null>(null);
  const [capaPreview, setCapaPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const capaUrl = useUrlFicheiro(capaNova ? null : capaPath);

  /* Repõe o formulário de cada vez que abre. */
  useEffect(() => {
    if (!open) return;
    setTitulo(evento?.titulo ?? '');
    setCategoriaId(evento?.categoria_id ?? SEM_CATEGORIA);
    setInicio(evento?.inicio ?? '');
    setFim(evento?.fim ?? '');
    setHora(evento?.hora ?? '');
    setLocal(evento?.local ?? LOCAL_PADRAO);
    setDescricao(evento?.descricao ?? '');
    setDress(evento?.dress_code ?? '');
    setHighlights((evento?.highlights ?? []).join('\n'));
    setPrevisto(txt(orcamento?.previsto ?? null));
    setReal(txt(orcamento?.real ?? null));
    setCapaPath(evento?.imagem_path ?? null);
    setCapaNova(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evento]);

  useEffect(() => {
    if (!capaNova) { setCapaPreview(null); return; }
    const u = URL.createObjectURL(capaNova);
    setCapaPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [capaNova]);

  const escolherCapa = (f: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!f) return;
    const invalido = validarImagem(f);
    if (invalido) { toast.error(invalido); return; }
    setCapaNova(f);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) { toast.error('Indica o título do evento.'); return; }
    if (!inicio) { toast.error('Indica a data do evento.'); return; }
    if (fim && fim < inicio) { toast.error('A data de fim é anterior à de início.'); return; }
    const p = num(previsto), r = num(real);
    if (Number.isNaN(p) || Number.isNaN(r)) { toast.error('Orçamento inválido: usa só números.'); return; }

    setSaving(true);
    let novaCapa: string | null = null;
    try {
      let imagem = capaPath;
      if (capaNova) { novaCapa = await uploadCapa(capaNova); imagem = novaCapa; }
      const dados: EventoInput = {
        titulo, categoria_id: categoriaId === SEM_CATEGORIA ? null : categoriaId,
        inicio, fim: fim || null, hora, local, descricao, dress_code: dress,
        highlights: highlightsDeTexto(highlights), imagem_path: imagem,
      };
      const gravado = evento ? await updateEvento(evento.id, dados) : await createEvento(dados);
      // A partir daqui o evento existe e a capa nova está em uso: não se apaga em caso de erro.
      novaCapa = null;
      // A capa antiga só se apaga depois de o evento estar gravado.
      if (evento?.imagem_path && evento.imagem_path !== imagem) await removerFicheiro(evento.imagem_path);
      const orc: Orcamento = { previsto: p, real: r };
      try {
        await saveOrcamento(gravado.id, orc);
        onSaved(gravado, orc);
      } catch (err) {
        onSaved(gravado, orcamento ?? { previsto: null, real: null });
        toast.error(`${err instanceof Error ? err.message : 'Não foi possível guardar o orçamento.'} O evento foi guardado.`);
      }
      onOpenChange(false);
    } catch (err) {
      if (novaCapa) await removerFicheiro(novaCapa); // não deixar a imagem órfã
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar o evento.');
    } finally {
      setSaving(false);
    }
  };

  const imagemMostrada = capaPreview ?? capaUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{evento ? 'Editar evento' : 'Novo evento'}</DialogTitle>
          <DialogDescription>Os campos com * são obrigatórios. O resto pode ser completado mais tarde.</DialogDescription>
        </DialogHeader>

        <form onSubmit={guardar} className="space-y-4">
          {/* Capa */}
          <div>
            <Label>Imagem do evento</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {imagemMostrada
                  ? <img src={imagemMostrada} alt="Pré-visualização da capa" className="h-full w-full object-cover" />
                  : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
              </div>
              <div className="flex flex-col gap-1.5">
                <input ref={input} type="file" accept={IMAGEM_ACCEPT} className="hidden" data-testid="capa-input"
                  onChange={e => escolherCapa(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
                  {imagemMostrada ? 'Trocar imagem' : 'Escolher imagem'}
                </Button>
                {imagemMostrada && (
                  <Button type="button" variant="ghost" size="sm" className="text-muted-foreground"
                    onClick={() => { setCapaNova(null); setCapaPath(null); }}>
                    <X className="mr-1 h-3.5 w-3.5" /> Remover
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">PNG, JPG ou WebP, até {MAX_MB} MB.</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="mk-titulo">Título *</Label>
              <Input id="mk-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} className="mt-1.5" />
            </div>

            <div>
              <div className="flex h-5 items-center justify-between">
                <Label>Categoria</Label>
                <button type="button" onClick={onGerirCategorias} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Settings2 className="h-3 w-3" /> Gerir
                </button>
              </div>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger className="mt-1.5" aria-label="Categoria"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex h-5 items-center"><Label htmlFor="mk-local">Local</Label></div>
              <Input id="mk-local" value={local} onChange={e => setLocal(e.target.value)} className="mt-1.5" />
            </div>

            <div>
              <Label htmlFor="mk-inicio">Data *</Label>
              <Input id="mk-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="mk-fim">Data de fim <span className="font-normal text-muted-foreground">(se durar mais de um dia)</span></Label>
              <Input id="mk-fim" type="date" value={fim} min={inicio || undefined} onChange={e => setFim(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="mk-hora">Hora</Label>
              <Input id="mk-hora" value={hora} onChange={e => setHora(e.target.value)} placeholder="18:30" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="mk-dress">Dress code</Label>
              <Input id="mk-dress" value={dress} onChange={e => setDress(e.target.value)} placeholder="Smart casual" className="mt-1.5" />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="mk-desc">O que vai acontecer</Label>
              <Textarea id="mk-desc" value={descricao} onChange={e => setDescricao(e.target.value)} rows={4} className="mt-1.5" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mk-high">Highlights <span className="font-normal text-muted-foreground">(um por linha)</span></Label>
              <Textarea id="mk-high" value={highlights} onChange={e => setHighlights(e.target.value)} rows={3} className="mt-1.5"
                placeholder={'Apresentação do novo modelo às 19h\nPresença de convidados da marca'} />
            </div>

            <div>
              <Label htmlFor="mk-prev">Orçamento previsto (€)</Label>
              <Input id="mk-prev" inputMode="decimal" value={previsto} onChange={e => setPrevisto(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="mk-real">Orçamento real (€)</Label>
              <Input id="mk-real" inputMode="decimal" value={real} onChange={e => setReal(e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {evento ? 'Guardar' : 'Criar evento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

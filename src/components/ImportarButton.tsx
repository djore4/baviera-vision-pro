import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardPaste, FileUp, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { RECORDS_CHANGED_EVENT } from '@/components/RecordEditor';
import SincronizarMatriculasButton from '@/components/SincronizarMatriculasButton';
import { aplicarFaturas, parseFaturasReport, planFaturas, type FaturasPlano } from '@/lib/faturas-report';
import {
  aplicarMapaRetail, dia, extrairDeImagem, linhasParaFaturas, planearMapaRetail, validarFicheiro,
  type PlanoMapa,
} from '@/lib/importar';

type Estado =
  | { fase: 'inicio' }
  | { fase: 'a-ler' }
  | { fase: 'mapa'; plano: PlanoMapa; notas?: string | null }
  | { fase: 'faturas'; plano: FaturasPlano; notas?: string | null }
  | { fase: 'feito'; resumo: string };

const Por = ({ itens }: { itens: { ref: string; motivo: string }[] }) => (
  itens.length === 0 ? null : (
    <section>
      <h4 className="mb-1 font-semibold">Por tratar ({itens.length})</h4>
      <ul className="space-y-1">
        {itens.slice(0, 30).map((i, n) => (
          <li key={n} className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1"><strong>{i.ref}</strong> — {i.motivo}</li>
        ))}
      </ul>
      {itens.length > 30 && <p className="mt-1 text-muted-foreground">+ {itens.length - 30} não mostrados.</p>}
    </section>
  )
);

/**
 * "Importar": ponto único para meter dados na plataforma sem os escrever.
 *  · Email de matrículas (o antigo Sincronizar).
 *  · Imagem, PDF ou Excel (colar com Ctrl+V, largar ou escolher): mapa de Retail ou faturas.
 * A imagem é lida, mostra-se o que muda e só se grava depois de confirmado, com os mesmos
 * campos que o utilizador preencheria à mão. Só administrador.
 */
export default function ImportarButton({ className }: { className?: string }) {
  const { isAdmin } = usePermissions();
  const { data, refresh } = useData();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' });
  const [busy, setBusy] = useState(false);
  const [arrastar, setArrastar] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const control = data?.control;

  const fechar = () => { if (!busy) { setAberto(false); setEstado({ fase: 'inicio' }); } };

  const lerFicheiro = useCallback(async (file: File) => {
    const { erro, fonte } = validarFicheiro(file);
    if (erro || !fonte) { toast.error('Ficheiro não aceite', { description: erro ?? undefined }); return; }
    if (!control) { toast.error('Os dados ainda estão a carregar.'); return; }
    setEstado({ fase: 'a-ler' });
    try {
      if (fonte === 'folha') {
        const rows = parseFaturasReport(await file.arrayBuffer());
        if (rows.length === 0) throw new Error('O relatório não tem viaturas.');
        setEstado({ fase: 'faturas', plano: planFaturas(control, rows) });
        return;
      }
      const r = await extrairDeImagem(file);
      if (r.tipo === 'mapa_retail') {
        if (r.linhas.length === 0) throw new Error('Não encontrei viaturas na imagem.');
        setEstado({ fase: 'mapa', plano: planearMapaRetail(control, r.linhas), notas: r.notas });
      } else if (r.tipo === 'faturas') {
        const rows = linhasParaFaturas(r.linhas);
        if (rows.length === 0) throw new Error('Não encontrei chassis de faturas na imagem.');
        setEstado({ fase: 'faturas', plano: planFaturas(control, rows), notas: r.notas });
      } else {
        throw new Error('Não reconheci o documento. Funciona com o mapa «Mapas de Retail - Veículos Novos» e com faturas.');
      }
    } catch (err) {
      setEstado({ fase: 'inicio' });
      toast.error('Não foi possível importar', { description: err instanceof Error ? err.message : undefined });
    }
  }, [control]);

  // Ctrl+V: uma captura de ecrã colada em qualquer ponto do diálogo.
  useEffect(() => {
    if (!aberto || estado.fase !== 'inicio') return;
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? [])[0];
      if (f) { e.preventDefault(); void lerFicheiro(f); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [aberto, estado.fase, lerFicheiro]);

  if (!isAdmin) return null;

  const gravar = async () => {
    setBusy(true);
    try {
      let resumo: string;
      if (estado.fase === 'mapa') {
        const g = await aplicarMapaRetail(estado.plano.alteracoes);
        if (g.falhadas.length > 0) throw new Error(`${g.aplicadas} gravadas, ${g.falhadas.length} falharam: ${g.falhadas[0]}`);
        resumo = `${g.aplicadas} viatura${g.aplicadas === 1 ? '' : 's'} atualizada${g.aplicadas === 1 ? '' : 's'} a partir do mapa de Retail.`;
      } else if (estado.fase === 'faturas') {
        const n = await aplicarFaturas(estado.plano.alteracoes);
        resumo = `${n} viatura${n === 1 ? '' : 's'} com datas de fatura/matrícula atualizadas.`;
      } else return;
      setEstado({ fase: 'feito', resumo });
      window.dispatchEvent(new CustomEvent(RECORDS_CHANGED_EVENT));
      await refresh();
    } catch (err) {
      toast.error('Não foi possível gravar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const nAlt = estado.fase === 'mapa' || estado.fase === 'faturas' ? estado.plano.alteracoes.length : 0;
  const titulo = estado.fase === 'mapa' ? 'Mapa de Retail' : estado.fase === 'faturas' ? 'Faturas' : estado.fase === 'feito' ? 'Dados importados' : 'Importar';

  return (
    <>
      <Button variant="outline" size="sm" className={`h-7 gap-1 text-[11px] ${className ?? ''}`} onClick={() => setAberto(true)}
        title="Importar dados: email de matrículas, mapa de Retail (imagem) e faturas">
        <Upload className="h-3 w-3" />Importar
      </Button>

      <Dialog open={aberto} onOpenChange={o => { if (!o) fechar(); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {estado.fase === 'inicio' && 'Cola uma imagem ou ficheiro; mostro o que muda e só grava depois de confirmares.'}
              {estado.fase === 'a-ler' && 'A ler o documento…'}
              {(estado.fase === 'mapa' || estado.fase === 'faturas') && 'Confirma antes de gravar: será registado como se o tivesses introduzido à mão.'}
              {estado.fase === 'feito' && estado.resumo}
            </DialogDescription>
          </DialogHeader>

          {estado.fase === 'inicio' && (
            <div className="space-y-4 text-xs">
              <div
                role="button" tabIndex={0} data-testid="zona-colar"
                onClick={() => inputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setArrastar(true); }}
                onDragLeave={() => setArrastar(false)}
                onDrop={e => { e.preventDefault(); setArrastar(false); const f = e.dataTransfer.files?.[0]; if (f) void lerFicheiro(f); }}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${arrastar ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
              >
                <ClipboardPaste className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Cola aqui (Ctrl+V) uma captura de ecrã</p>
                <p className="text-muted-foreground">ou larga / escolhe uma imagem, PDF ou Excel · mapa «Mapas de Retail - Veículos Novos» ou faturas</p>
                <span className="inline-flex items-center gap-1 text-primary"><FileUp className="h-3 w-3" />Escolher ficheiro</span>
                <input ref={inputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp,application/pdf,.xlsx,.xls,.csv"
                  data-testid="ficheiro"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void lerFicheiro(f); }} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="font-medium">Email de matrículas</p>
                  <p className="text-muted-foreground">Respostas ao pedido de matrícula e email diário (Aveiro).</p>
                </div>
                <SincronizarMatriculasButton rotulo="Sincronizar email" />
              </div>
            </div>
          )}

          {estado.fase === 'a-ler' && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A ler o documento…</div>
          )}

          {estado.fase === 'mapa' && (
            <div className="space-y-4 text-xs">
              {estado.notas && <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1">{estado.notas}</p>}
              <section>
                <h4 className="mb-1 font-semibold">Alterações ({estado.plano.alteracoes.length}){estado.plano.iguais > 0 && <span className="font-normal text-muted-foreground"> · {estado.plano.iguais} já em dia</span>}</h4>
                {estado.plano.alteracoes.length === 0 ? <p className="text-muted-foreground">Nenhuma alteração a gravar.</p> : (
                  <table className="w-full">
                    <thead><tr className="text-left text-[10px] uppercase text-muted-foreground"><th className="py-1 pr-2">Encomenda</th><th className="pr-2">Chassis</th><th>Alteração</th></tr></thead>
                    <tbody>
                      {estado.plano.alteracoes.map(a => (
                        <tr key={a.id} className="border-t border-border align-top">
                          <td className="py-1 pr-2 whitespace-nowrap">{a.enc || '—'}</td>
                          <td className="pr-2 whitespace-nowrap">{a.chas || '—'}</td>
                          <td>{a.campos.map(c => <div key={c.campo}><span className="text-muted-foreground">{c.campo}: </span>{c.de} → <strong>{c.para}</strong></div>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <Por itens={estado.plano.ignoradas} />
            </div>
          )}

          {estado.fase === 'faturas' && (
            <div className="space-y-4 text-xs">
              {estado.notas && <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1">{estado.notas}</p>}
              <section>
                <h4 className="mb-1 font-semibold">Alterações ({estado.plano.alteracoes.length}){estado.plano.iguais > 0 && <span className="font-normal text-muted-foreground"> · {estado.plano.iguais} já em dia</span>}</h4>
                {estado.plano.alteracoes.length === 0 ? <p className="text-muted-foreground">Nenhuma alteração a gravar.</p> : (
                  <table className="w-full">
                    <thead><tr className="text-left text-[10px] uppercase text-muted-foreground"><th className="py-1 pr-2">Chassis</th><th className="pr-2">Cliente</th><th>Alteração</th></tr></thead>
                    <tbody>
                      {estado.plano.alteracoes.map(a => (
                        <tr key={a.id} className="border-t border-border align-top">
                          <td className="py-1 pr-2 whitespace-nowrap">{a.chas || a.vin}</td>
                          <td className="pr-2">{a.cliente || '—'}</td>
                          <td>
                            {a.dfat && <div><span className="text-muted-foreground">DFAT: </span>{dia(a.dfat.de)} → <strong>{dia(a.dfat.para)}</strong></div>}
                            {a.dmat && <div><span className="text-muted-foreground">DMAT: </span>{dia(a.dmat.de)} → <strong>{dia(a.dmat.para)}</strong></div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <Por itens={[
                ...estado.plano.semCorrespondencia.map(v => ({ ref: v, motivo: 'sem registo na plataforma' })),
                ...estado.plano.ambiguos.map(a => ({ ref: a.vin, motivo: `${a.registos} registos possíveis; trata à mão` })),
                ...estado.plano.anuladas.map(v => ({ ref: v, motivo: 'fatura anulada (saldo zero)' })),
              ]} />
            </div>
          )}

          <DialogFooter>
            {(estado.fase === 'mapa' || estado.fase === 'faturas') && (
              <>
                <Button variant="outline" onClick={() => setEstado({ fase: 'inicio' })} disabled={busy}>Voltar</Button>
                <Button onClick={gravar} disabled={busy || nAlt === 0}>
                  {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Gravar {nAlt} alteraç{nAlt === 1 ? 'ão' : 'ões'}
                </Button>
              </>
            )}
            {estado.fase === 'feito' && <Button onClick={fechar}>OK</Button>}
            {estado.fase === 'inicio' && <Button variant="outline" onClick={fechar}>Fechar</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

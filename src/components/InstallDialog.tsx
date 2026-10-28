import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { instalar, modoInstalar, plataformaMovel, reporSugestao, subscrever, sugestaoSilenciada } from '@/lib/install-prompt';

/* Instalar a app, a pedido (menu do utilizador). O browser só deixa abrir o diálogo
 * nativo quando ele próprio dispara o evento de instalação; quando não o faz, aqui
 * ficam as instruções certas para o aparelho. */
export function InstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, forcar] = useState(0);
  useEffect(() => subscrever(() => forcar(n => n + 1)), []);

  const modo = modoInstalar();
  const movel = plataformaMovel(navigator.userAgent, navigator.maxTouchPoints);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>Instalar a app</DialogTitle>
          <DialogDescription>Abre com um toque, sem a barra do browser.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {modo === 'instalada' && <p className="text-muted-foreground">A app já está instalada neste dispositivo.</p>}

          {modo === 'nativo' && (
            <Button onClick={async () => { if (await instalar()) onOpenChange(false); }} className="w-full gap-1.5">
              <Download className="h-4 w-4" /> Instalar agora
            </Button>
          )}

          {modo === 'ios' && (
            <p className="text-muted-foreground">
              No iPhone ou iPad: toca em <b>Partilhar</b> e depois em <b>Adicionar ao ecrã principal</b>.
            </p>
          )}

          {modo === 'manual' && (
            <p className="text-muted-foreground">
              {movel === 'android'
                ? <>No Chrome: abre o menu <b>⋮</b> e escolhe <b>Instalar aplicação</b> (ou <b>Adicionar ao ecrã principal</b>).</>
                : <>No Chrome ou Edge: usa o ícone de instalar na barra de endereço, ou o menu e <b>Instalar</b>.</>}
              {' '}Se a opção não aparecer, o browser considera que a app já está instalada.
            </p>
          )}

          {modo !== 'instalada' && sugestaoSilenciada() && (
            <button type="button" onClick={reporSugestao} className="text-xs text-primary underline-offset-2 hover:underline">
              Voltar a mostrar a sugestão no topo
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

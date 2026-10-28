import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { instalar, modoInstalar, reporSugestao, subscrever, sugestaoSilenciada } from '@/lib/install-prompt';

/* Instalar a app, sempre disponível em Definições: a faixa do topo depende de o
 * browser disparar o evento de instalação (e só aparece em telemóvel, uma vez),
 * por isso aqui há sempre um caminho — botão nativo, ou as instruções. */
export function InstallCard() {
  const [, forcar] = useState(0);
  useEffect(() => subscrever(() => forcar(n => n + 1)), []);

  const modo = modoInstalar();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="h-4 w-4" /> Instalar a app
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {modo === 'instalada' && <p className="text-muted-foreground">A app já está instalada neste dispositivo.</p>}

        {modo === 'nativo' && (
          <>
            <p className="text-muted-foreground">Abre a app com um toque, sem barra do browser.</p>
            <Button onClick={() => { void instalar(); }} className="gap-1.5"><Download className="h-4 w-4" /> Instalar</Button>
          </>
        )}

        {modo === 'ios' && (
          <p className="text-muted-foreground">
            No iPhone ou iPad: toca em <b>Partilhar</b> e depois em <b>Adicionar ao ecrã principal</b>.
          </p>
        )}

        {modo === 'manual' && (
          <p className="text-muted-foreground">
            No Chrome (Android): abre o menu <b>⋮</b> e escolhe <b>Instalar aplicação</b> (ou <b>Adicionar ao ecrã principal</b>).
            No computador (Chrome ou Edge): usa o ícone de instalar na barra de endereço, ou o menu e <b>Instalar</b>.
            Se a opção não aparecer, o browser considera que a app já está instalada.
          </p>
        )}

        {modo !== 'instalada' && sugestaoSilenciada() && (
          <button type="button" onClick={reporSugestao} className="text-xs text-primary underline-offset-2 hover:underline">
            Voltar a mostrar a sugestão no topo
          </button>
        )}
      </CardContent>
    </Card>
  );
}

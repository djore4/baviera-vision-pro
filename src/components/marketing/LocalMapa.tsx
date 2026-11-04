import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { client } from '@/clients';
import { urlAbrirMapa, urlMapaEmbed, urlRota } from '@/lib/marketing';

const CHAVE = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined) || null;

/* Localização do evento no Google Maps: mapa embebido, "Ver no mapa" e "Como chegar"
 * a partir do stand. Com VITE_GOOGLE_MAPS_KEY o mapa mostra a rota, distância e tempo. */
export function LocalMapa({ local }: { local: string }) {
  const origem = client.documentHeader;
  const mesmoQueOrigem = local.trim().toLowerCase() === 'aveiro';
  // Com chave e o local no próprio stand, a rota seria origem=destino: mostra só o local.
  const url = urlMapaEmbed(local, origem, mesmoQueOrigem ? null : CHAVE);

  return (
    <div data-testid="local-mapa" className="overflow-hidden rounded-lg border">
      <iframe
        title={`Mapa: ${local}`}
        src={url}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="h-56 w-full border-0 bg-muted sm:h-64"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{local}</span>
        </span>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={urlAbrirMapa(local)} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir mapa</a>
          </Button>
          <Button asChild size="sm">
            <a href={urlRota(origem, local)} target="_blank" rel="noopener noreferrer" title={`Distância e rota desde ${origem}`}>
              <Navigation className="mr-1.5 h-3.5 w-3.5" /> Como chegar
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cliente desta instalação (pasta em src/clients/). Por omissão: baviera. */
  readonly VITE_CLIENT?: string;
  /** Chave da Maps Embed API (gratuita): sem ela o mapa do Marketing mostra só o local, sem rota/distância. */
  readonly VITE_GOOGLE_MAPS_KEY?: string;
}

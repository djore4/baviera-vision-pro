/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cliente desta instalação (pasta em src/clients/). Por omissão: baviera. */
  readonly VITE_CLIENT?: string;
}

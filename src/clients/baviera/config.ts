import type { ClientConfig } from '../types';
import logo from './logo.png';

const config: ClientConfig = {
  id: 'baviera',
  name: 'Caetano',
  nameAccent: 'BMW',
  tagline: 'BMW Dealer Dashboard',
  title: 'Caetano BMW',
  loginSubtitle: 'Acesso restrito à equipa de Aveiro',
  documentHeader: 'Caetano BMW Aveiro',
  logo: { src: logo, alt: 'BMW' },
  theme: {
    primary: '214 77% 47%', // #1C69D4
    dark: '222 47% 11%',    // #0F172A
  },
  font: {
    family: 'BMWTypeNext',
    faces: [
      { url: '/clients/baviera/fonts/BMWTypeNextLatin-Regular.woff2', weight: 400, format: 'woff2' },
      { url: '/clients/baviera/fonts/BMWTypeNextLatinTT-Regular.ttf', weight: 400, format: 'truetype' },
      { url: '/clients/baviera/fonts/BMWTypeNextLatin-Bold.woff2', weight: 700, format: 'woff2' },
      { url: '/clients/baviera/fonts/BMWTypeNextLatinTT-Bold.ttf', weight: 700, format: 'truetype' },
    ],
  },
  matricula: {
    to: ['sonia.carvalho@caetano.pt', 'lurdes.aguiar@caetano.pt'],
    cc: ['jose.mesquita@caetano.pt', 'joaocarlos.duarte@caetano.pt'],
  },
  disabledTabs: [],
  // Já está em app_access_exceptions (migração 20261003100000); isto só vale
  // enquanto a base de dados não a tiver. Remover depois de aplicada.
  legacyTabAccessExceptions: {
    'tiago.santos@caetano.pt': { stock: 'edit' },
  },
};

export default config;

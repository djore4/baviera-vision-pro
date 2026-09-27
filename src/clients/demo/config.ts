import type { ClientConfig } from '../types';
import logo from './logo.svg';

/* Concessionário fictício: demonstração comercial e ambiente de testes.
 * Logótipo provisório até existir a identidade do Pitwall. */
const config: ClientConfig = {
  id: 'demo',
  name: 'Pitwall',
  nameAccent: 'Demo',
  tagline: 'Dealer Dashboard',
  title: 'Pitwall Demo',
  loginSubtitle: 'Ambiente de demonstração',
  documentHeader: 'Auto Demo Lisboa',
  logo: { src: logo, alt: 'Pitwall' },
  theme: {
    primary: '20 82% 51%', // #E8601C
    dark: '220 18% 13%',   // #1B1F27
  },
  matricula: { to: ['matriculas@autodemo.pt'], cc: [] },
  disabledTabs: ['escala-repsol'],
  tabAccessExceptions: {},
};

export default config;

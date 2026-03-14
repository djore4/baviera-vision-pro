export interface ControlRecord {
  status: string;
  neg: Date | null;
  mes1: string;
  resp: string;
  cliente: string;
  local: string;
  type: string;
  origin: string;
  profile: string;
  biz: string;
  enc: string;
  chas: string;
  mat: string;
  model: string;
  version: string;
  gar: string;
  qor: number;
  xev: number;
  bev: number;
  mPerf: number;
  csc: number;
  cme: number | null;
  fin: string;
  week198: string;
  dmat: Date | null;
  date298: Date | null;
  app: Date | null;
  obs: string;
}

export interface ObjetivoTotal {
  mes: string;
  orcado: number;
  range2: number;
  real: number;
}

export interface ObjetivoResp {
  mes: string;
  resp: string;
  objetivo: number;
}

export interface AppData {
  control: ControlRecord[];
  objetivosTotal: ObjetivoTotal[];
  objetivosResp: ObjetivoResp[];
  lastUpdated: string;
}

export type PageType = 'retails' | 'producao' | 'carteira' | 'pendentes';

export interface PeriodFilter {
  years: number[];
  quarters: number[];
  months: number[];
}

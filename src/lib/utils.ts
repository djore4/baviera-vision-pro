import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Data do Excel -> 'AAAA-MM-DD' (dia civil local).
 *
 * O XLSX (cellDates) devolve a data à meia-noite LOCAL. `toISOString()` converte
 * para UTC, pelo que em Portugal (UTC+1 no verão) tudo recuava um dia: uma
 * entrega de segunda-feira ficava gravada a domingo e as de dia 1 caíam no mês
 * anterior. Somar 12h antes de ler os campos locais absorve também os pequenos
 * desvios de segundos/minutos que o XLSX introduz.
 */
export function toLocalIsoDay(d: Date): string {
  const x = new Date(d.getTime() + 12 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

import type { ControlRecord } from '@/types/data';

/**
 * Mês em que o negócio é posicionado (mês de entrega provável).
 *
 * MÊS1 é a autoridade: define o mês previsto de entrega/retail e manda no
 * posicionamento, mesmo que a viatura já tenha data de retail (298) noutro mês
 * — ex.: matrícula pedida em agosto para entrega prevista em setembro.
 * A data de retail real (298) só é usada como recurso quando MÊS1 não traz um
 * mês definido (formato AAAA/MM).
 */
export function getDeliveryMonth(record: ControlRecord): string {
  const mes1 = (record.mes1 || '').trim();
  const m1 = mes1.match(/^(\d{4})\/(\d{1,2})$/);
  if (m1) return `${m1[1]}/${m1[2].padStart(2, '0')}`;

  if (record.date298) {
    const d = record.date298;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}/${m}`;
  }
  return mes1;
}

/* Tipos de viatura que contam para o resultado de retails (VP fica de fora:
 * conta só para faturas). */
export const RETAIL_TYPES = ['VN', 'VD', 'RMK'];

export function isRetailType(t: string): boolean {
  return RETAIL_TYPES.includes(t);
}

export function isRetailDelivery(r: ControlRecord): boolean {
  return r.status === 'Retail' && isRetailType(r.type);
}

export function getCurrentWeek(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil((diff / oneWeek) + start.getDay() / 7);
}

export function formatDate(d: Date | null): string {
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(2);
  return `${day}/${month}/${year}`;
}

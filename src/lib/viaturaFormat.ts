/* Formatação de identificadores de viatura para apresentação. */

/** Chassis/VIN: mostra só os últimos 7 caracteres (suficientes para identificar). */
export function chassisCurto(chassis: string | null | undefined): string {
  const c = (chassis ?? '').replace(/\s+/g, '').toUpperCase();
  return c.length > 7 ? c.slice(-7) : c;
}

/** Matrícula PT: "AA00BB" / "aa 00 bb" → "AA-00-BB". Formatos não reconhecidos ficam como estão. */
export function formatMatricula(matricula: string | null | undefined): string {
  const raw = (matricula ?? '').trim().toUpperCase();
  const m = /^([A-Z0-9]{2})[\s-]?([A-Z0-9]{2})[\s-]?([A-Z0-9]{2})$/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw;
}

/* Converte texto em número aceitando formato PT ("76.874,50") e decimal com ponto ("2.5"). */
export function parseNum(txt: string, kind: 'pct' | 'eur'): string {
  const t = txt.trim().replace(/\s|€|%/g, '');
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  // Sem vírgula: em euros, "76.874" é separador de milhares; caso contrário, ponto decimal.
  if (kind === 'eur' && /^-?\d{1,3}(\.\d{3})+$/.test(t)) return t.replace(/\./g, '');
  return t;
}

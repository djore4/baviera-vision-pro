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

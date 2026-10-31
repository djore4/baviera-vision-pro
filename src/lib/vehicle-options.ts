/* Opções de modelo e versão para os formulários, tiradas dos registos existentes
 * (para não haver duas grafias do mesmo modelo). O valor atual entra sempre na
 * lista, para um registo antigo não ficar sem opção. */

const uniqueSorted = (values: string[], current: string): string[] => {
  const set = new Set<string>();
  for (const v of values) { const t = v.trim(); if (t) set.add(t); }
  const cur = current.trim();
  if (cur) set.add(cur);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
};

export function modelOptions(records: { model: string }[], current = ''): string[] {
  return uniqueSorted(records.map(r => r.model), current);
}

/** Versões existentes; com um modelo escolhido, só as desse modelo. */
export function versionOptions(records: { model: string; version: string }[], model = '', current = ''): string[] {
  const m = model.trim();
  return uniqueSorted(records.filter(r => !m || r.model.trim() === m).map(r => r.version), current);
}

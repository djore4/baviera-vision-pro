/* Elementos que já saíram da equipa VN. Os dados históricos (escala, empréstimos)
 * mantêm-se, mas deixam de poder ser escolhidos em novas atribuições. */
export const RETIRED_MEMBERS = ['TS'];

export const isRetiredMember = (initials: string) =>
  RETIRED_MEMBERS.includes(initials.trim().toUpperCase());

/** Iniciais dos vendedores para escolher num formulário: as que existem nos
 * registos, sem os elementos que já saíram (a não ser que seja o valor atual,
 * para um registo antigo não ficar sem opção). */
export function vendedorInitials(records: { resp: string }[], current = ''): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const v = r.resp.trim().toUpperCase();
    if (v && !isRetiredMember(v)) set.add(v);
  }
  const cur = current.trim().toUpperCase();
  if (cur) set.add(cur);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
}

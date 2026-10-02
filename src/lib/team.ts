/* Elementos que já saíram da equipa VN. Os dados históricos (escala, empréstimos)
 * mantêm-se, mas deixam de poder ser escolhidos em novas atribuições. */
export const RETIRED_MEMBERS = ['TS'];

export const isRetiredMember = (initials: string) =>
  RETIRED_MEMBERS.includes(initials.trim().toUpperCase());

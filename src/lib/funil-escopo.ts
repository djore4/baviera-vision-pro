import { supabase } from '@/integrations/supabase/client';

/* ── Funil VN: escrita do vendedor só nos seus negócios ─────────────────────────
 * Quem edita 'dados'/'database' escreve tudo. Quem só tem 'funil' em edição escreve os
 * negócios do funil (Frio/Morno/Quente) cujo RESP são as suas iniciais. Espelha a RLS
 * de control_records (migração funil_vendedor_escrita): a interface nunca oferece mais
 * do que a base de dados aceita. */

export const FUNIL_ESTADOS = ['Frio', 'Morno', 'Quente'] as const;

/** Iniciais da pessoa (função minhas_iniciais). Sem a função (migração por aplicar) ou com
 *  erro: nenhuma — nunca se oferece edição que a base de dados vai recusar. */
export async function getMinhasIniciais(): Promise<string[]> {
  const { data, error } = await supabase.rpc('minhas_iniciais');
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).filter((i): i is string => typeof i === 'string' && i.trim() !== '').map(i => i.trim().toUpperCase());
}

/** O RESP do negócio é meu? */
export const negocioMeu = (resp: string | null | undefined, minhas: readonly string[]): boolean =>
  minhas.includes((resp ?? '').trim().toUpperCase());

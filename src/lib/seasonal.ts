/* ── Toques sazonais ──────────────────────────────────────────────────────────
 * Lógica de datas pura (testável) para micro-detalhes divertidos:
 *  · xmas      — época natalícia: 1 de dezembro a 6 de janeiro (Reis)
 *  · fechoAno  — janela do contador de fecho de ano: 15 de novembro a 31 de dezembro
 *                (não é decoração: é informação de negócio, sempre ativa na janela)
 *  · fridayPM  — sexta-feira a partir das ~15h ("Bom fim de semana")
 *  · aprilFools— 1 de abril (toast subtil)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SeasonalFlags {
  xmas: boolean;
  fechoAno: boolean;
  fridayPM: boolean;
  aprilFools: boolean;
}

/** `forced` permite pré-visualizar uma época (ex.: `?season=xmas`) fora das datas. */
export function seasonalFlags(date: Date = new Date(), forced: string | null = null): SeasonalFlags {
  const month = date.getMonth();      // 0 = janeiro
  const day = date.getDate();
  const dow = date.getDay();          // 0 = domingo, 5 = sexta
  const hour = date.getHours();

  return {
    xmas: forced === 'xmas' || month === 11 || (month === 0 && day <= 6),
    fechoAno: month === 11 || (month === 10 && day >= 15),
    fridayPM: dow === 5 && hour >= 15,        // sexta à tarde
    aprilFools: month === 3 && day === 1,     // 1 de abril
  };
}

/** Época forçada pelo URL (`?season=xmas`), só para pré-visualização. */
export function forcedSeason(search: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  return new URLSearchParams(search).get('season');
}

/* ── Toques sazonais ──────────────────────────────────────────────────────────
 * Lógica de datas pura (testável) para micro-detalhes divertidos:
 *  · xmas      — mês de dezembro (gorro de Natal no logo)
 *  · fridayPM  — sexta-feira a partir das ~15h ("Bom fim de semana")
 *  · aprilFools— 1 de abril (toast subtil)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SeasonalFlags {
  xmas: boolean;
  fridayPM: boolean;
  aprilFools: boolean;
}

export function seasonalFlags(date: Date = new Date()): SeasonalFlags {
  const month = date.getMonth();      // 0 = janeiro
  const day = date.getDate();
  const dow = date.getDay();          // 0 = domingo, 5 = sexta
  const hour = date.getHours();

  return {
    xmas: month === 11,                       // dezembro
    fridayPM: dow === 5 && hour >= 15,        // sexta à tarde
    aprilFools: month === 3 && day === 1,     // 1 de abril
  };
}

-- Agendamento de lavagens.
-- Distingue lavagens agendadas (marcação) de lavagens efetivamente em curso, dando
-- ao lavador uma fila do que vem a seguir:
--   * scheduled_at = hora do agendamento (null quando é uma lavagem imediata / walk-in)
--   * started_at   = início real (null enquanto a lavagem está apenas agendada)
--   * ended_at     = fim
-- Estado derivado no frontend: ended_at != null -> terminada;
--   started_at != null -> em curso; caso contrário -> agendada.

ALTER TABLE public.car_wash_cycles
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- started_at deixa de ser obrigatório: uma lavagem agendada ainda não começou.
ALTER TABLE public.car_wash_cycles
  ALTER COLUMN started_at DROP NOT NULL,
  ALTER COLUMN started_at DROP DEFAULT;

-- Hora efetiva para a agenda/estatísticas: o início real ou, na sua ausência,
-- a hora agendada. Coluna gerada => filtragem e ordenação diretas em SQL.
ALTER TABLE public.car_wash_cycles
  ADD COLUMN IF NOT EXISTS effective_at timestamptz
  GENERATED ALWAYS AS (COALESCE(started_at, scheduled_at)) STORED;

CREATE INDEX IF NOT EXISTS car_wash_cycles_effective_idx ON public.car_wash_cycles (effective_at);
CREATE INDEX IF NOT EXISTS car_wash_cycles_scheduled_idx ON public.car_wash_cycles (scheduled_at);

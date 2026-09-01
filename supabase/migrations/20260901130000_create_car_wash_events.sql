-- Auditoria de lavagens — regista todas as marcações, alterações e eliminações
-- dos ciclos de lavagem (car_wash_cycles), para consulta e exportação (CSV) pelo
-- administrador. Os eventos são escritos pela camada de aplicação (lib/lavagem.ts)
-- e mantêm-se mesmo depois de o ciclo original ser eliminado.

CREATE TABLE IF NOT EXISTS public.car_wash_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid,                 -- ciclo afetado (sem FK: sobrevive à eliminação)
  action text NOT NULL           -- tipo de evento (ver lib/lavagem.ts)
    CHECK (action IN ('create','reschedule','queue','start','end','quality','delete')),
  actor text,                    -- email de quem executou a ação
  plate text,                    -- matrícula/chassis (denormalizado, leitura direta)
  wash_type text,                -- tipo de lavagem (denormalizado)
  detail text,                   -- descrição legível (nova hora, nota, etc.)
  snapshot jsonb,                -- estado relevante do ciclo no momento do evento
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS car_wash_events_created_idx ON public.car_wash_events (created_at);
CREATE INDEX IF NOT EXISTS car_wash_events_cycle_idx ON public.car_wash_events (cycle_id);

ALTER TABLE public.car_wash_events ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de car_wash_cycles: acesso a utilizadores autenticados; o filtro
-- de administrador é aplicado na aplicação (consulta/exportação só no perfil admin).
CREATE POLICY "auth_only" ON public.car_wash_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

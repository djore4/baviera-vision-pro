-- Lavagem — controlo do fluxo de lavagens automóvel.
-- Cada ciclo é aberto a partir da leitura de um QR code externo (landing page
-- "Lavagem"), regista matrícula/chassis + tipo de lavagem e é encerrado com o
-- botão "Terminar". Tabela independente; sem FK rígida à carteira.

CREATE TABLE IF NOT EXISTS public.car_wash_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL,                 -- matrícula ou chassis
  wash_type text NOT NULL              -- ver constante WASH_TYPES no frontend
    CHECK (wash_type IN ('simples','oferta','completa','parque','servico','novo','bps','retoma')),
  duration_min integer NOT NULL,       -- duração prevista (min), fixada no arranque
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,                -- null = ciclo em curso
  created_by text,                     -- email de quem abriu o ciclo
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS car_wash_cycles_started_idx ON public.car_wash_cycles (started_at);
CREATE INDEX IF NOT EXISTS car_wash_cycles_open_idx ON public.car_wash_cycles (ended_at);
CREATE INDEX IF NOT EXISTS car_wash_cycles_plate_idx ON public.car_wash_cycles (plate);

ALTER TABLE public.car_wash_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_only" ON public.car_wash_cycles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at automático (reutiliza a função criada em fidelização, se existir).
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS car_wash_cycles_updated_at ON public.car_wash_cycles;
CREATE TRIGGER car_wash_cycles_updated_at
  BEFORE UPDATE ON public.car_wash_cycles
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Campos adicionais no agendamento de lavagens.
--   * model = modelo da viatura a lavar (texto livre; sugerido a partir dos
--     modelos já existentes noutras tabelas, ex.: control_records.model)
--   * notes = observações (mensagem curta editável associada ao agendamento)
ALTER TABLE public.car_wash_cycles
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Lavagem — novos tipos de lavagem para motas.
-- Acrescenta 'mota_vn' (Mota VN, 15 min) e 'mota_vu' (Mota VU, 30 min) à lista
-- permitida em car_wash_cycles.wash_type (ver constante WASH_TYPES no frontend).

ALTER TABLE public.car_wash_cycles
  DROP CONSTRAINT IF EXISTS car_wash_cycles_wash_type_check;

ALTER TABLE public.car_wash_cycles
  ADD CONSTRAINT car_wash_cycles_wash_type_check
  CHECK (wash_type IN (
    'simples','oferta','completa','parque','servico','novo','bps','retoma',
    'mota_vn','mota_vu'
  ));

-- Fila de execução das lavagens — ordem operacional, separada do plano.
-- A marcação (scheduled_at) fixa a posição na agenda e representa o compromisso.
-- A operação, porém, pode obrigar a trocar a ordem ou a antecipar um serviço sem
-- alterar esse compromisso: essa ordem vive em queue_order.
--   * queue_order NULL  -> a lavagem segue o plano (ordenada por scheduled_at)
--   * queue_order != NULL -> ordem manual (ex.: antecipação), sobrepõe-se ao plano
-- A chave de ordenação efetiva é COALESCE(queue_order, epoch(scheduled_at)),
-- calculada no frontend (a fila é pequena e já está em memória).

ALTER TABLE public.car_wash_cycles
  ADD COLUMN IF NOT EXISTS queue_order double precision;

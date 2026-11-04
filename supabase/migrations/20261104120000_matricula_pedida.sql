-- Pedido de matrícula: só conta como feito depois de chegar por email a resposta
-- "matrícula pedida". A sincronização (edge function sync-matriculas, service role) é
-- quem escreve esta coluna; o carimbo é a data de receção dessa resposta.
alter table public.control_records
  add column if not exists mat_pedida_em timestamptz;

comment on column public.control_records.mat_pedida_em is
  'Receção do email "matrícula pedida" (null = pedido ainda não confirmado).';

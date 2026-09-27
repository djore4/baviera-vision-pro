-- Retomas: preço da viatura de retoma. Usado para consulta e para o filtro de
-- intervalo de preço no tab RETOMA.

ALTER TABLE public.retomas
  ADD COLUMN IF NOT EXISTS preco numeric(10,2) CHECK (preco IS NULL OR preco >= 0);

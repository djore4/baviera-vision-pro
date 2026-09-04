-- Retomas: data de entrada em stock. Base do indicador de antiguidade (dias em
-- stock) e dos clusters de aging (0–30 / 31–90 / 91–120 / 121+), calculados na
-- app (a antiguidade depende de now(), logo não pode ser coluna GENERATED).

ALTER TABLE public.retomas
  ADD COLUMN IF NOT EXISTS data_entrada_stock date NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS retomas_entrada_idx ON public.retomas (data_entrada_stock);

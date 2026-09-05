-- Retomas: observações / notas livres associadas à viatura, consultáveis na
-- janela de detalhe do tab RETOMA.

ALTER TABLE public.retomas
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Qualidade — notas por vendedor.
-- Passa de uma linha por mês para uma linha por (ano, mês, vendedor), para que
-- cada comercial tenha a sua própria teia de notas. Sem vendedor selecionado, a
-- app mostra a média da equipa. A escala das notas é fixa (0–10).
ALTER TABLE public.quality_scores
  ADD COLUMN IF NOT EXISTS vendedor text NOT NULL DEFAULT '';

-- Nova chave primária composta (ano, mês, vendedor).
ALTER TABLE public.quality_scores DROP CONSTRAINT IF EXISTS quality_scores_pkey;
ALTER TABLE public.quality_scores
  ADD CONSTRAINT quality_scores_pkey PRIMARY KEY (year, month, vendedor);

-- Prospeção — ajustes:
--  (2) Unificar tarefas: remover o tipo 'appointment' (fica coberto por 'todo',
--      agora mais versátil — texto + data/lembrete + conta opcional).
--  (3) Dimensão da frota: passar da escala 1–5 para patamares.
--      Codificação: 0 = sem frota · 1 = 3–14 viaturas · 2 = 15+ viaturas.
--      No score, cada patamar mapeia para a escala 1–5 (0→0, 1→3, 2→5), peso 0.3.

-- ── (2) Tarefas: remover 'appointment' ──────────────────────────────────────
ALTER TABLE public.prospec_tasks DROP CONSTRAINT IF EXISTS prospec_tasks_type_check;
UPDATE public.prospec_tasks SET type = 'todo' WHERE type = 'appointment';
ALTER TABLE public.prospec_tasks
  ADD CONSTRAINT prospec_tasks_type_check CHECK (type IN ('todo','next_action'));

-- ── (3) Dimensão da frota: patamares 0 / 3–14 / 15+ ─────────────────────────
-- O score é uma coluna GENERATED que depende de dimensao_frota: remover primeiro.
ALTER TABLE public.prospec_accounts DROP COLUMN IF EXISTS score;
ALTER TABLE public.prospec_accounts DROP CONSTRAINT IF EXISTS prospec_accounts_dimensao_frota_check;

-- Migrar valores existentes (escala antiga 1–5) para os novos patamares.
UPDATE public.prospec_accounts SET dimensao_frota = CASE
  WHEN dimensao_frota IS NULL THEN NULL
  WHEN dimensao_frota <= 1 THEN 0   -- muito baixo → sem frota
  WHEN dimensao_frota <= 3 THEN 1   -- baixo/médio → 3–14
  ELSE 2                            -- alto → 15+
END;

ALTER TABLE public.prospec_accounts
  ADD CONSTRAINT prospec_accounts_dimensao_frota_check CHECK (dimensao_frota IN (0,1,2));

-- Recriar o score com o novo mapeamento da frota.
ALTER TABLE public.prospec_accounts
  ADD COLUMN score numeric GENERATED ALWAYS AS (
    round(
      (COALESCE(potencial, 0) * 0.5
       + (CASE dimensao_frota WHEN 0 THEN 0 WHEN 1 THEN 3 WHEN 2 THEN 5 ELSE 0 END) * 0.3
       + COALESCE(relacao, 0) * 0.2)::numeric,
      2
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS prospec_accounts_score_idx ON public.prospec_accounts (score);

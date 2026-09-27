-- Prospeção — nova fonte de lead "Relação" (relacao) e renomeações de rótulo no
-- frontend (geografica → "Prospeção"; indicacao → "Recomendação"). Os valores
-- guardados mantêm-se; apenas se alarga o CHECK da coluna fonte para aceitar
-- 'relacao'.

ALTER TABLE public.prospec_accounts
  DROP CONSTRAINT IF EXISTS prospec_accounts_fonte_check;

ALTER TABLE public.prospec_accounts
  ADD CONSTRAINT prospec_accounts_fonte_check
  CHECK (fonte IN ('geografica','lookalike','indicacao','relacao','lusha','outro'));

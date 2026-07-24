-- Controlo de qualidade por ciclo de lavagem.
ALTER TABLE public.car_wash_cycles
  ADD COLUMN IF NOT EXISTS quality_score integer CHECK (quality_score >= 0 AND quality_score <= 10),
  ADD COLUMN IF NOT EXISTS quality_comment text,
  ADD COLUMN IF NOT EXISTS quality_by text,
  ADD COLUMN IF NOT EXISTS quality_at timestamptz;

-- Empréstimos passa a ser exclusivo do perfil de administrador:
-- remover a permissão das funções não-admin.
UPDATE public.app_roles
  SET permissions = permissions - 'emprestimos'
  WHERE is_admin = false;

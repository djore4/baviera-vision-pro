-- Empréstimos a cliente têm sempre um responsável interno (iniciais da escala de serviço).
ALTER TABLE public.demo_emprestimos ADD COLUMN IF NOT EXISTS responsavel_interno text;

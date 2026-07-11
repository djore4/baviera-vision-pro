-- Internos passam a vir da escala de serviço (identificados por texto), não da tabela utilizadores.
ALTER TABLE public.demo_emprestimos DROP CONSTRAINT IF EXISTS demo_emprestimos_utilizador_id_fkey;
ALTER TABLE public.demo_emprestimos DROP COLUMN IF EXISTS utilizador_id;

-- Dados adicionais do cliente
ALTER TABLE public.demo_emprestimos ADD COLUMN IF NOT EXISTS cliente_telefone text;
ALTER TABLE public.demo_emprestimos ADD COLUMN IF NOT EXISTS cliente_nif text;

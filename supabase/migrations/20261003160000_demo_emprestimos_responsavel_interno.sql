-- demo_emprestimos.responsavel_interno: coluna que a página Empréstimos já usa.
--
-- A migração legada 20260711140000 acrescentava-a, mas nunca chegou a ser
-- aplicada em produção (ver o histórico remoto) e o baseline reproduz a produção
-- sem ela. Resultado: guardar um empréstimo falhava com "Falha ao guardar o
-- agendamento", porque o insert/update envia esta coluna. Os empréstimos a
-- cliente têm sempre um responsável interno (iniciais da escala de serviço).
--
-- Aditiva e idempotente: não altera linhas existentes (ficam a null).

alter table public.demo_emprestimos
  add column if not exists responsavel_interno text;

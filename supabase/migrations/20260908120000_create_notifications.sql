-- Sistema de notificações da plataforma (global, em todos os perfis).
--   * notifications: mensagens/avisos. audience = 'all' (todos) ou uma tab key
--     (só quem tem acesso a essa área a vê — o gating é feito na app, tal como
--     no resto da plataforma: RLS permissivo + isolamento por permissões).
--   * notification_reads: estado de "lido" por utilizador (para o contador).
-- Segue o padrão das restantes tabelas: RLS ativo mas permissivo (auth_only).

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  audience text NOT NULL DEFAULT 'all',   -- 'all' ou uma tab key (ex.: 'prospecao')
  created_by text,                        -- email de quem enviou (admin)
  created_by_nome text,                   -- nome apresentado
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.notifications;
CREATE POLICY "auth_only" ON public.notifications
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.notification_reads (
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_email text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_email)
);

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.notification_reads;
CREATE POLICY "auth_only" ON public.notification_reads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fidelização (CRM) — Segmento 1: persistência de lembretes e notas.
-- Tabelas independentes; ligação suave à carteira via control_id (sem FK rígida,
-- porque control_records é gerida fora das migrações).

-- ── Lembretes / agenda ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resp text,                       -- vendedor a quem o lembrete pertence
  cliente text,                    -- nome do cliente (livre)
  control_id uuid,                 -- ligação suave a control_records (opcional)
  kind text NOT NULL DEFAULT 'geral'
    CHECK (kind IN ('geral', 'chamada', 'followup', 'renovacao', 'servico')),
  title text NOT NULL,
  body text,
  due_at timestamptz,              -- quando lembrar
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by text,                 -- email de quem criou
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_reminders_resp_idx ON public.crm_reminders (resp);
CREATE INDEX IF NOT EXISTS crm_reminders_due_idx ON public.crm_reminders (due_at);
CREATE INDEX IF NOT EXISTS crm_reminders_open_idx ON public.crm_reminders (done, due_at);
CREATE INDEX IF NOT EXISTS crm_reminders_control_idx ON public.crm_reminders (control_id);

ALTER TABLE public.crm_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_only" ON public.crm_reminders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Notas ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resp text,                       -- vendedor a quem a nota pertence
  cliente text,                    -- nome do cliente (livre)
  control_id uuid,                 -- ligação suave a control_records (opcional)
  body text NOT NULL,
  created_by text,                 -- email de quem criou
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_notes_resp_idx ON public.crm_notes (resp);
CREATE INDEX IF NOT EXISTS crm_notes_cliente_idx ON public.crm_notes (cliente);
CREATE INDEX IF NOT EXISTS crm_notes_control_idx ON public.crm_notes (control_id);

ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_only" ON public.crm_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── updated_at automático ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_reminders_updated_at
  BEFORE UPDATE ON public.crm_reminders
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

CREATE TRIGGER crm_notes_updated_at
  BEFORE UPDATE ON public.crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

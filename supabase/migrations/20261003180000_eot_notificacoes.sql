-- End-of-Term: notificações automáticas, com hotlink para o contrato.
--
--  * Quando um contrato é atribuído a um vendedor, o vendedor é notificado.
--  * Quando alguém que não é administrador regista uma atividade num contrato
--    (uma tarefa agendada ou uma interação feita), os administradores são notificados.
--  * Cada notificação leva um `link` interno: clicar nela abre o contrato.
--
-- As notificações criam-se na base de dados, por trigger, e não no browser: assim
-- não dependem de o vendedor ter a página aberta nem podem ser contornadas (a
-- política de insert de `notifications` continua a ser só do administrador).

-- ── 1. Destinatário e hotlink ──────────────────────────────────────────────────
-- recipient_email: se preenchido, só essa pessoa vê a notificação (as de `audience`
--   continuam a valer para as mensagens gerais ou dirigidas a uma área).
-- link: caminho interno da aplicação (ex.: /end-of-term?contrato=ABC); a interface só
--   segue caminhos internos.
alter table public.notifications add column if not exists recipient_email text;
alter table public.notifications add column if not exists link text;
create index if not exists notifications_recipient_idx on public.notifications (lower(recipient_email));

-- ── 2. Quem vê o quê ───────────────────────────────────────────────────────────
--   * dirigidas a uma pessoa (recipient_email): só essa pessoa;
--   * audience 'all': quem tem acesso a algum tab;
--   * audience '@admin': só os administradores;
--   * audience = um tab: quem tem acesso a esse tab.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    (recipient_email is not null and lower(recipient_email) = lower((select auth.jwt() ->> 'email')))
    or (
      recipient_email is null and (
        (audience = 'all' and (select public.has_any_tab()))
        or (audience = '@admin' and (select public.is_app_admin()))
        or (audience not in ('all', '@admin') and (select public.has_access(audience)))
      )
    )
  );

-- ── 3. Ligação interna para um contrato ────────────────────────────────────────
-- Codifica o número do contrato para o URL (percent-encoding de tudo o que não é
-- letra, algarismo, '-', '.', '_' ou '~').
create or replace function public.url_encode(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(
           case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b in (45, 46, 95, 126)
                then chr(b)
                else '%' || upper(lpad(to_hex(b), 2, '0')) end,
           '' order by i), '')
  from (
    select get_byte(convert_to(p_text, 'UTF8'), i) as b, i
    from generate_series(0, length(convert_to(coalesce(p_text, ''), 'UTF8')) - 1) as i
  ) s;
$$;

create or replace function public.eot_contract_link(p_contrato text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '/end-of-term?contrato=' || public.url_encode(p_contrato);
$$;

-- ── 4. Atribuição de um contrato: avisa o vendedor ─────────────────────────────
create or replace function public.eot_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
  actor_nome text;
begin
  -- Sem dono (largou-se o contrato) ou atribuição a si próprio: nada a avisar.
  if new.owner_email is null or lower(new.owner_email) = actor then
    return new;
  end if;

  select u.nome into actor_nome
  from public.app_users u where lower(u.email) = actor limit 1;

  insert into public.notifications (title, body, audience, recipient_email, link, created_by, created_by_nome)
  values (
    'Contrato End-of-Term atribuído',
    format('Foi-lhe atribuído o contrato %s — %s%s.',
           new.contrato,
           coalesce(nullif(new.cliente, ''), 'sem cliente'),
           case when actor_nome is not null then ' (por ' || actor_nome || ')' else '' end),
    'end-of-term',
    lower(new.owner_email),
    public.eot_contract_link(new.contrato),
    actor,
    actor_nome
  );
  return new;
end;
$$;

drop trigger if exists eot_contracts_notify_assignment on public.eot_contracts;
create trigger eot_contracts_notify_assignment
  after update of owner_email on public.eot_contracts
  for each row
  when (new.owner_email is distinct from old.owner_email)
  execute function public.eot_notify_assignment();

-- ── 5. Atividade de um vendedor: avisa os administradores ──────────────────────
-- Uma atividade agendada e por concluir é uma tarefa; uma já feita (ou sem prazo)
-- é uma interação. As feitas por administradores, e as sem utilizador (service
-- role, importações), não geram aviso.
create or replace function public.eot_notify_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
  actor_nome text;
  cliente text;
  is_task boolean := new.due_at is not null and not new.done;
  tipo_label text;
begin
  if actor is null or (select public.is_app_admin()) then
    return new;
  end if;

  select u.nome into actor_nome
  from public.app_users u where lower(u.email) = actor limit 1;
  select c.cliente into cliente from public.eot_contracts c where c.contrato = new.contrato;

  tipo_label := case new.tipo
    when 'chamada' then 'Chamada' when 'email' then 'Email' when 'reuniao' then 'Reunião'
    when 'visita' then 'Visita' when 'proposta_feita' then 'Proposta feita'
    when 'proposta_enviada' then 'Proposta enviada' else 'Outro' end;

  insert into public.notifications (title, body, audience, recipient_email, link, created_by, created_by_nome)
  values (
    format('End-of-Term · %s de %s', case when is_task then 'nova tarefa' else 'nova interação' end,
           coalesce(actor_nome, actor)),
    format('%s%s — contrato %s (%s)%s',
           tipo_label,
           case when nullif(new.descricao, '') is not null then ': ' || new.descricao else '' end,
           new.contrato,
           coalesce(nullif(cliente, ''), 'sem cliente'),
           case when is_task then ' · para ' || to_char(new.due_at at time zone 'Europe/Lisbon', 'DD/MM HH24:MI') else '' end),
    '@admin',
    null,
    public.eot_contract_link(new.contrato),
    actor,
    actor_nome
  );
  return new;
end;
$$;

drop trigger if exists eot_activities_notify on public.eot_activities;
create trigger eot_activities_notify
  after insert on public.eot_activities
  for each row
  execute function public.eot_notify_activity();

-- As funções de trigger não se chamam diretamente.
revoke all on function public.eot_notify_assignment() from public, anon, authenticated;
revoke all on function public.eot_notify_activity() from public, anon, authenticated;

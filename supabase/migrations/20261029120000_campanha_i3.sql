-- Campanha i3 (área Vendas VN): oportunidades de contacto geradas por uma campanha.
--
-- O administrador carrega as oportunidades (várias vezes ao longo do dia, sempre no
-- mesmo formato: nome, email, contacto, data de contacto, polo) e delega cada uma
-- num vendedor. O vendedor acompanha as suas: estado, ponto de situação, observações
-- e próximo contacto.
--
-- Acesso (tab 'campanha-i3' da matriz de funções):
--  * administrador: vê, importa, edita, delega e apaga todas as oportunidades;
--  * vendedor ('view' ou 'edit' no tab): só vê as que lhe estão delegadas (owner_email,
--    sem distinguir maiúsculas); com 'edit' altera apenas o acompanhamento (estado,
--    ponto de situação, observações, próximo contacto). Os dados do contacto e o
--    responsável não os altera — o trigger repõe-nos, mesmo através da consola.
--  * ninguém sem acesso ao tab vê nada.
--
-- O histórico (importação, delegação, mudanças de estado e pontos de situação) e o aviso
-- ao vendedor quando lhe delegam oportunidades são escritos por trigger, não pelo
-- browser: não se contornam.
-- Idempotente.

-- ── 1. Oportunidades ───────────────────────────────────────────────────────────
create table if not exists public.campanha_i3_leads (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null check (btrim(nome) <> ''),
  email              text,
  contacto           text,
  data_contacto      date,
  polo               text,
  -- Identifica a mesma pessoa em importações repetidas: o email, ou (sem email) o
  -- telefone só com algarismos, ou (sem nenhum) o nome. Preenchido pelo trigger.
  chave              text not null default '',
  owner_email        text,                                  -- vendedor a quem foi delegada
  owner_nome         text,
  atribuido_em       timestamptz,
  atribuido_por      text,
  estado             text not null default 'novo'
                     check (estado in ('novo', 'em_contacto', 'sem_resposta', 'agendado', 'proposta', 'ganho', 'perdido')),
  ponto_situacao     text,                                  -- ponto de situação do acompanhamento
  observacoes        text,
  proximo_contacto   date,
  ultima_atualizacao timestamptz,                           -- último acompanhamento (estado/ponto/obs/próximo contacto)
  importado_por      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint campanha_i3_leads_owner_lower check (owner_email is null or owner_email = lower(owner_email))
);

create unique index if not exists campanha_i3_leads_chave_idx on public.campanha_i3_leads (chave);
create index if not exists campanha_i3_leads_owner_idx  on public.campanha_i3_leads (owner_email);
create index if not exists campanha_i3_leads_estado_idx on public.campanha_i3_leads (estado);

-- ── 2. Histórico ───────────────────────────────────────────────────────────────
create table if not exists public.campanha_i3_historico (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.campanha_i3_leads (id) on delete cascade,
  tipo       text not null check (tipo in ('importada', 'atribuida', 'estado', 'ponto')),
  de         text,
  para       text,
  autor      text,
  created_at timestamptz not null default now()
);

create index if not exists campanha_i3_historico_lead_idx on public.campanha_i3_historico (lead_id, created_at);

-- ── 3. Triggers ────────────────────────────────────────────────────────────────
-- Antes de gravar: normaliza, calcula a chave, carimba, e impede quem não é
-- administrador de alterar o que não é acompanhamento. Sem utilizador no token
-- (service role, SQL Editor) não há restrições.
create or replace function public.campanha_i3_leads_before()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  privileged boolean := actor = '' or coalesce((select public.is_app_admin()), false);
begin
  if tg_op = 'UPDATE' and not privileged then
    -- Vendedor: só o acompanhamento. O resto é o que o administrador carregou/delegou.
    new.nome := old.nome; new.email := old.email; new.contacto := old.contacto;
    new.data_contacto := old.data_contacto; new.polo := old.polo; new.chave := old.chave;
    new.owner_email := old.owner_email; new.owner_nome := old.owner_nome;
    new.atribuido_em := old.atribuido_em; new.atribuido_por := old.atribuido_por;
    new.importado_por := old.importado_por; new.created_at := old.created_at;
  else
    new.nome     := btrim(new.nome);
    new.email    := lower(nullif(btrim(coalesce(new.email, '')), ''));
    new.contacto := nullif(btrim(coalesce(new.contacto, '')), '');
    new.polo     := nullif(btrim(coalesce(new.polo, '')), '');
    new.chave    := coalesce(new.email, nullif(regexp_replace(coalesce(new.contacto, ''), '\D', '', 'g'), ''), lower(new.nome));
    new.owner_email := lower(nullif(btrim(coalesce(new.owner_email, '')), ''));
    if new.owner_email is null then
      new.owner_nome := null; new.atribuido_em := null; new.atribuido_por := null;
    elsif tg_op = 'INSERT' or new.owner_email is distinct from old.owner_email then
      new.atribuido_em := now();
      new.atribuido_por := nullif(actor, '');
    else
      new.atribuido_em := old.atribuido_em; new.atribuido_por := old.atribuido_por;
    end if;
    if tg_op = 'INSERT' then
      new.importado_por := nullif(actor, '');
    else
      new.importado_por := old.importado_por; new.created_at := old.created_at;
    end if;
  end if;

  new.ponto_situacao := nullif(btrim(coalesce(new.ponto_situacao, '')), '');
  new.observacoes    := nullif(btrim(coalesce(new.observacoes, '')), '');
  if tg_op = 'UPDATE' and (
       new.estado is distinct from old.estado
    or new.ponto_situacao is distinct from old.ponto_situacao
    or new.observacoes is distinct from old.observacoes
    or new.proximo_contacto is distinct from old.proximo_contacto) then
    new.ultima_atualizacao := now();
  elsif tg_op = 'UPDATE' then
    new.ultima_atualizacao := old.ultima_atualizacao;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists campanha_i3_leads_before on public.campanha_i3_leads;
create trigger campanha_i3_leads_before
  before insert or update on public.campanha_i3_leads
  for each row execute function public.campanha_i3_leads_before();

-- Depois de gravar: acrescenta ao histórico (security definer: ninguém escreve
-- diretamente nessa tabela).
create or replace function public.campanha_i3_leads_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
begin
  if tg_op = 'INSERT' then
    insert into public.campanha_i3_historico (lead_id, tipo, autor) values (new.id, 'importada', actor);
    if new.owner_email is not null then
      insert into public.campanha_i3_historico (lead_id, tipo, para, autor)
      values (new.id, 'atribuida', coalesce(new.owner_nome, new.owner_email), actor);
    end if;
    return new;
  end if;
  if new.owner_email is distinct from old.owner_email then
    insert into public.campanha_i3_historico (lead_id, tipo, de, para, autor)
    values (new.id, 'atribuida', coalesce(old.owner_nome, old.owner_email), coalesce(new.owner_nome, new.owner_email), actor);
  end if;
  if new.estado is distinct from old.estado then
    insert into public.campanha_i3_historico (lead_id, tipo, de, para, autor)
    values (new.id, 'estado', old.estado, new.estado, actor);
  end if;
  if new.ponto_situacao is distinct from old.ponto_situacao and new.ponto_situacao is not null then
    insert into public.campanha_i3_historico (lead_id, tipo, para, autor)
    values (new.id, 'ponto', new.ponto_situacao, actor);
  end if;
  return new;
end $$;

drop trigger if exists campanha_i3_leads_log on public.campanha_i3_leads;
create trigger campanha_i3_leads_log
  after insert or update on public.campanha_i3_leads
  for each row execute function public.campanha_i3_leads_log();

-- Delegar oportunidades avisa o vendedor — um aviso por vendedor e por operação
-- (delegar 20 de uma vez não gera 20 avisos). Trigger por instrução, com as tabelas de
-- transição. Atribuir a si próprio, largar o responsável e as operações sem utilizador
-- (service role) não geram aviso.
create or replace function public.campanha_i3_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  actor_nome text;
  por text := '';
begin
  if actor = '' then
    return null;
  end if;
  select u.nome into actor_nome from public.app_users u where lower(u.email) = actor limit 1;
  if actor_nome is not null then
    por := ' (por ' || actor_nome || ')';
  end if;

  insert into public.notifications (title, body, audience, recipient_email, link, created_by, created_by_nome)
  select
    'Campanha i3 · oportunidades delegadas',
    case when count(*) = 1
         then format('Foi-lhe delegada a oportunidade %s da Campanha i3%s.', min(n.nome), por)
         else format('Foram-lhe delegadas %s oportunidades da Campanha i3%s.', count(*), por) end,
    'campanha-i3',
    lower(n.owner_email),
    '/campanha-i3',
    actor,
    actor_nome
  from nt n
  join ot o on o.id = n.id
  where n.owner_email is not null
    and n.owner_email is distinct from o.owner_email
    and lower(n.owner_email) <> actor
  group by lower(n.owner_email);
  return null;
end $$;

drop trigger if exists campanha_i3_leads_notify on public.campanha_i3_leads;
create trigger campanha_i3_leads_notify
  after update on public.campanha_i3_leads
  referencing old table as ot new table as nt
  for each statement
  execute function public.campanha_i3_notify_assignment();

-- As funções de trigger não se chamam diretamente.
revoke all on function public.campanha_i3_leads_before() from public, anon, authenticated;
revoke all on function public.campanha_i3_leads_log() from public, anon, authenticated;
revoke all on function public.campanha_i3_notify_assignment() from public, anon, authenticated;

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────
alter table public.campanha_i3_leads     enable row level security;
alter table public.campanha_i3_historico enable row level security;

drop policy if exists campanha_i3_leads_select     on public.campanha_i3_leads;
drop policy if exists campanha_i3_leads_insert     on public.campanha_i3_leads;
drop policy if exists campanha_i3_leads_update     on public.campanha_i3_leads;
drop policy if exists campanha_i3_leads_delete     on public.campanha_i3_leads;
drop policy if exists campanha_i3_historico_select on public.campanha_i3_historico;

create policy campanha_i3_leads_select on public.campanha_i3_leads
  for select to authenticated
  using ((select public.has_access('campanha-i3'))
         and ((select public.is_app_admin()) or lower(owner_email) = lower((select auth.jwt() ->> 'email'))));
-- Importar e apagar: só o administrador.
create policy campanha_i3_leads_insert on public.campanha_i3_leads
  for insert to authenticated with check ((select public.is_app_admin()));
create policy campanha_i3_leads_update on public.campanha_i3_leads
  for update to authenticated
  using ((select public.has_access('campanha-i3', 'edit'))
         and ((select public.is_app_admin()) or lower(owner_email) = lower((select auth.jwt() ->> 'email'))))
  with check ((select public.has_access('campanha-i3', 'edit'))
         and ((select public.is_app_admin()) or lower(owner_email) = lower((select auth.jwt() ->> 'email'))));
create policy campanha_i3_leads_delete on public.campanha_i3_leads
  for delete to authenticated using ((select public.is_app_admin()));

-- Histórico: só leitura, e só das oportunidades que a pessoa vê (a subconsulta passa
-- pela política de select das oportunidades).
create policy campanha_i3_historico_select on public.campanha_i3_historico
  for select to authenticated
  using (exists (select 1 from public.campanha_i3_leads l where l.id = lead_id));

revoke all on public.campanha_i3_leads     from anon;
revoke all on public.campanha_i3_historico from anon, authenticated;
grant select, insert, update, delete on public.campanha_i3_leads to authenticated;
grant select on public.campanha_i3_historico to authenticated;

-- ── 5. Vendedores VN passam a ter o tab ─────────────────────────────────────────
-- Sem isto o vendedor não veria as oportunidades que lhe delegam. Só toca na função
-- 'Vendedor VN' (se existir) e só se ainda não tiver a chave; as outras funções
-- atribuem-se na matriz (Utilizadores → Funções).
update public.app_roles
   set permissions = permissions || '{"campanha-i3": "edit"}'::jsonb
 where name = 'Vendedor VN' and not (permissions ? 'campanha-i3');

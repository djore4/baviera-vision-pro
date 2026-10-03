-- Lavagem: permissões explícitas por função, em vez de decididas pelo NOME da
-- função no código.
--
-- Antes: LavagemPage.tsx tinha `roleName === 'Lavador'`, `'Preparador'`, `'APV'`
-- espalhados; renomear uma função, ou criar uma equivalente, mudava o
-- comportamento sem ninguém reparar — e a BD não conhecia estas regras.
--
-- Agora há quatro permissões finas, guardadas em app_roles.permissions com a
-- chave 'lavagem:<ação>' e valor 'edit' (e geridas na matriz, tab Utilizadores):
--   lavagem:reagendar  editar/arrastar lavagens existentes e removê-las
--   lavagem:iniciar    criar lavagens, iniciar as agendadas, "agendar já"
--   lavagem:qualidade  nota e observações de qualidade
--   lavagem:registos   histórico e auditoria
-- Quem tem 'edit' no tab 'lavagem' continua a poder reagendar e apagar.

-- ── 1. Migração dos dados: reproduz o comportamento que o código dava por nome ──
-- (só toca nas funções com estes nomes, se existirem). Nota: o código também
-- previa `roleName === 'Vendedor'` para o controlo de qualidade, mas nenhuma
-- função tem esse nome exato (existem 'Vendedor VN' e 'Vendedor VU'), por isso
-- essa regra nunca se aplicou a ninguém e não é migrada.
update public.app_roles
   set permissions = permissions || '{"lavagem:reagendar": "edit", "lavagem:qualidade": "edit"}'::jsonb
 where name = 'Preparador';

update public.app_roles
   set permissions = permissions || '{"lavagem:iniciar": "edit"}'::jsonb
 where name = 'Lavador';

update public.app_roles
   set permissions = permissions || '{"lavagem:registos": "edit"}'::jsonb
 where name = 'APV';

-- ── 2. RLS: a BD passa a impor as mesmas regras que a interface ────────────────
-- Criar/agendar e iniciar: edição do tab, ou reagendar, ou iniciar.
-- Atualizar (reagendar, iniciar, atribuir qualidade): o mesmo + qualidade.
-- Apagar: edição do tab ou reagendar.
-- (A BD não distingue "iniciar" de "qualidade" dentro de um update; a interface sim.)
do $$
declare
  can_write constant text :=
    '(select public.has_access(''lavagem'', ''edit'') or public.has_access(''lavagem:reagendar'') or public.has_access(''lavagem:iniciar''))';
  can_update constant text :=
    '(select public.has_access(''lavagem'', ''edit'') or public.has_access(''lavagem:reagendar'') or public.has_access(''lavagem:iniciar'') or public.has_access(''lavagem:qualidade''))';
  can_delete constant text :=
    '(select public.has_access(''lavagem'', ''edit'') or public.has_access(''lavagem:reagendar''))';
  adm constant text := '(select public.is_app_admin())';
  t text;
  op text;
begin
  foreach t in array array['car_wash_cycles', 'car_wash_events'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || op, t);
    end loop;
  end loop;

  create policy car_wash_cycles_select on public.car_wash_cycles
    for select to authenticated using ((select public.has_access('lavagem')));
  execute format('create policy car_wash_cycles_insert on public.car_wash_cycles for insert to authenticated with check (%s)', can_write);
  execute format('create policy car_wash_cycles_update on public.car_wash_cycles for update to authenticated using (%s) with check (%s)', can_update, can_update);
  execute format('create policy car_wash_cycles_delete on public.car_wash_cycles for delete to authenticated using (%s)', can_delete);

  -- Auditoria: só quem tem a permissão de registos lê; qualquer ação legítima
  -- acrescenta; só o admin altera ou apaga.
  create policy car_wash_events_select on public.car_wash_events
    for select to authenticated using ((select public.has_access('lavagem:registos')));
  execute format('create policy car_wash_events_insert on public.car_wash_events for insert to authenticated with check (%s)', can_update);
  execute format('create policy car_wash_events_update on public.car_wash_events for update to authenticated using (%s) with check (%s)', adm, adm);
  execute format('create policy car_wash_events_delete on public.car_wash_events for delete to authenticated using (%s)', adm);
end $$;

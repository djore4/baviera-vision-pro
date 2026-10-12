-- Demos: descontos/apoios, custo e margem só para o administrador.
--
-- `viaturas` é partilhada com a Caetano Sales Force, que ESCREVE `inputs` (MGB, ESF,
-- PAC, DEM, SUP, depreciações) e `stats` (margem, preço mínimo, desconto) a partir do
-- seu formulário de administração. Por isso os dados não saem da tabela (a Caetano
-- deixava de os ler e gravava zeros); em vez disso, a plataforma deixa de ler a
-- tabela diretamente e passa a ler por demos_viaturas(), que só devolve o
-- custo/margem ao administrador.
--
-- Antes: a política viaturas_select (rls_por_perfil) deixava qualquer utilizador com
-- acesso a um tab ler a linha toda, `inputs` e `stats` incluídos — esconder as colunas
-- na interface não escondia nada de quem abrisse a consola do browser.
--
-- Agora:
--  * viaturas_select só admite o administrador. A política da Caetano
--    (salesforce_users) é de outra aplicação, soma-se (OR) e não se toca.
--  * demos_viaturas() devolve as linhas a quem tem acesso ao tab Demos. Para quem não
--    é administrador, `inputs` e `stats` levam só as chaves de preço (lista branca, para
--    uma chave nova nunca sair por omissão).
--
-- Ordem de aplicação: pôr em produção o código que lê demos_viaturas() ANTES desta
-- migração (a interface antiga lê a tabela e, depois da migração, os utilizadores que
-- não são administradores deixam de ver viaturas). O código novo, se a função ainda não
-- existir, volta a ler a tabela.

create or replace function public.demos_viaturas()
returns setof public.viaturas
language sql
stable
security definer
set search_path = ''
as $$
  select (jsonb_populate_record(
    null::public.viaturas,
    case
      when (select public.is_app_admin()) then to_jsonb(v)
      else to_jsonb(v) || jsonb_build_object(
        'inputs', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(coalesce(v.inputs, '{}'::jsonb)) e
          where e.key = any (array['pvb', 'opc', 'bsi', 'eco', 'leg', 'isv', 'pvp_desc'])
        ), '{}'::jsonb),
        'stats', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(coalesce(v.stats, '{}'::jsonb)) e
          where e.key = any (array['pvp_bruto', 'pvp_final', 'idade', 'idade_dias', 'penetracao', 'iva', 's_iva'])
        ), '{}'::jsonb)
      )
    end
  )).*
  from public.viaturas v
  where (select public.is_app_admin()) or (select public.has_access('demos'));
$$;

revoke all on function public.demos_viaturas() from public, anon;
grant execute on function public.demos_viaturas() to authenticated;

-- Leitura direta da tabela: só o administrador (a escrita já era só dele).
drop policy if exists viaturas_select on public.viaturas;
create policy viaturas_select on public.viaturas
  for select to authenticated
  using ((select public.is_app_admin()));

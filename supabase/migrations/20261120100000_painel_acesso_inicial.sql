-- Diário (chave 'painel'): acesso inicial.
-- O tab é novo, por isso nenhuma função o tinha em nenhuma das matrizes (base e por local) e o
-- vendedor não o via. Dá-se 'view' ao Diário em cada matriz em que a função já consulta o WIP
-- ('retails') ou a Carteira ('carteira'), e só onde a chave ainda não existe. Funções de
-- administrador ficam de fora (já veem tudo). Não retira nem altera nada: depois, o acesso
-- continua a gerir-se em Utilizadores → Funções.
-- Corre uma vez; reexecutar é inofensivo (não repõe o que já exista).

do $$
declare
  r record;
  base jsonb;
  locais jsonb;
  l text;
  vende boolean;
begin
  for r in select name, permissions, permissions_local from public.app_roles where not is_admin loop
    base := coalesce(r.permissions, '{}'::jsonb);
    vende := coalesce(base ->> 'retails', 'none') in ('view', 'edit') or coalesce(base ->> 'carteira', 'none') in ('view', 'edit');
    if vende and not (base ? 'painel') then
      base := base || '{"painel": "view"}'::jsonb;
    end if;

    locais := coalesce(r.permissions_local, '{}'::jsonb);
    for l in select jsonb_object_keys(locais) loop
      if jsonb_typeof(locais -> l) = 'object' and not ((locais -> l) ? 'painel')
         and (coalesce(locais -> l ->> 'retails', 'none') in ('view', 'edit')
              or coalesce(locais -> l ->> 'carteira', 'none') in ('view', 'edit')) then
        locais := jsonb_set(locais, array[l, 'painel'], '"view"'::jsonb);
      end if;
    end loop;

    update public.app_roles set permissions = base, permissions_local = locais where name = r.name;
  end loop;
end
$$;

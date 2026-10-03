-- Importação atómica: substitui todas as linhas de uma tabela por um snapshot.
--
-- Antes, a app fazia DELETE de tudo e depois INSERT em lotes de 500, como
-- chamadas separadas. Se um lote falhasse (rede, constraint, sessão expirada)
-- a tabela ficava vazia ou a meio, sem forma de recuperar. Agora é uma única
-- chamada, logo uma única transação: ou entra tudo, ou fica tudo como estava.
--
-- security invoker: corre com os direitos de quem chama, por isso as políticas
-- RLS da tabela (migração rls_por_perfil) continuam a decidir quem pode
-- importar — não há escalada de privilégios.

create or replace function public.replace_rows(
  p_table text,
  p_rows jsonb,
  p_allow_empty boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Só tabelas de snapshot. Nome e colunas são validados contra esta lista e o
  -- catálogo antes de entrarem em SQL dinâmico (e vão sempre com %I).
  allowed constant text[] := array['control_records', 'control_records_vu', 'angariacoes_vu'];
  bad_key text;
  cols text;
  n integer;
begin
  if p_table is null or not (p_table = any (allowed)) then
    raise exception 'replace_rows: tabela não permitida: %', p_table using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'replace_rows: p_rows tem de ser um array JSON' using errcode = '22023';
  end if;

  n := jsonb_array_length(p_rows);
  if n = 0 and not p_allow_empty then
    raise exception 'Importação sem registos — cancelada para não apagar os dados existentes.'
      using errcode = '22023';
  end if;

  if n > 0 then
    if exists (select 1 from jsonb_array_elements(p_rows) e where jsonb_typeof(e) <> 'object') then
      raise exception 'replace_rows: cada linha tem de ser um objeto JSON' using errcode = '22023';
    end if;

    -- Colunas = chaves de todas as linhas; têm de existir na tabela e não
    -- podem ser a chave primária (o id é gerado pela base de dados).
    select k into bad_key
    from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(p_rows) e) keys
    where not exists (
      select 1 from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(p_table))::regclass
        and a.attname = k and a.attnum > 0 and not a.attisdropped
    ) or k = 'id'
    limit 1;
    if bad_key is not null then
      raise exception 'replace_rows: coluna inválida em %: %', p_table, bad_key using errcode = '22023';
    end if;

    select string_agg(quote_ident(k), ', ' order by k) into cols
    from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(p_rows) e) keys;
  end if;

  execute format('delete from public.%I where id is not null', p_table);

  if n > 0 then
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)',
      p_table, cols
    ) using p_rows;
  end if;

  return n;
end;
$$;

revoke all on function public.replace_rows(text, jsonb, boolean) from public, anon;
grant execute on function public.replace_rows(text, jsonb, boolean) to authenticated;

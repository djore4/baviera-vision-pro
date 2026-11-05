-- Marketing: os ficheiros de um evento passam a ter uma categoria, para separar os
-- convites (a descarregar e enviar aos convidados) dos restantes documentos
-- (brochuras, programa…). Mesma tabela, bucket e RLS dos anexos: só muda o rótulo.
alter table public.marketing_anexos
  add column if not exists categoria text not null default 'documento'
  check (categoria in ('documento', 'convite'));

create index if not exists marketing_anexos_evento_categoria_idx
  on public.marketing_anexos (evento_id, categoria, created_at);

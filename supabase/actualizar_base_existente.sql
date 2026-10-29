-- PARA UNA BASE EXISTENTE: conserva registros, usuarios, bucket y políticas.
-- Ejecutar en el SQL Editor como propietario del proyecto.
-- Todo queda dentro de una transacción: ante un error, no se aplica parcialmente.
begin;

do $$
declare missing_columns text;
begin
  if to_regclass('public.agrovision_records') is null then
    raise exception 'No existe public.agrovision_records. Para una instalación nueva usa personal-account.sql.';
  end if;

  select string_agg(required.name, ', ')
  into missing_columns
  from unnest(array['id','owner_id','project_id','payload','created_by','updated_by']) as required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'agrovision_records'
      and c.column_name = required.name
  );
  if missing_columns is not null then
    raise exception 'El esquema actual necesita revisión. Faltan columnas: %', missing_columns;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'agrovision_records'
      and column_name = 'updated_at' and data_type <> 'timestamp with time zone'
  ) then
    raise exception 'updated_at debe ser timestamptz. No se modificó el tipo ni se borraron datos.';
  end if;
end;
$$;

alter table public.agrovision_records
  add column if not exists updated_at timestamptz not null default clock_timestamp();

update public.agrovision_records
set updated_at = clock_timestamp()
where updated_at is null;

alter table public.agrovision_records
  alter column updated_at set default clock_timestamp();
alter table public.agrovision_records
  alter column updated_at set not null;

create or replace function public.agrovision_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgname = 'agrovision_updated_at'
      and tgrelid = 'public.agrovision_records'::regclass
      and not tgisinternal
  ) then
    execute 'create or replace trigger agrovision_updated_at before update on public.agrovision_records for each row execute function public.agrovision_touch_updated_at()';
  else
    execute 'create trigger agrovision_updated_at before update on public.agrovision_records for each row execute function public.agrovision_touch_updated_at()';
  end if;
end;
$$;

commit;

-- Comprobación final (debe mostrar updated_at como timestamp with time zone):
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'agrovision_records' and column_name = 'updated_at';

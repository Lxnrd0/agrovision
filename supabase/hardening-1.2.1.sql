-- TerraNova / AgroVisión 1.2.1 — migración compatible con instalaciones existentes.
-- IMPORTANTE:
-- 1) Ejecutar primero en un proyecto Supabase de pruebas.
-- 2) Esta migración no borra observaciones, fotografías, usuarios ni membresías.
-- 3) Convierte la PK de agrovision_members de user_id a (project_id, user_id)
--    para permitir que una cuenta pertenezca a más de un proyecto.
-- 4) Sustituye únicamente las cuatro políticas legacy conocidas de agrovision_records.
--    Si encuentra otra política no reconocida, aborta y revierte la transacción.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- ---------------------------------------------------------------------------
-- 1. Membresías: completar columnas y validar datos antes de cambiar índices.
-- ---------------------------------------------------------------------------
create table if not exists public.agrovision_members (
  project_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null default 'Integrante',
  joined_at timestamptz not null default now()
);

DO $migration$
declare
  v_missing text;
  v_pk_name text;
  v_pk_columns text[];
  v_fk_count integer;
begin
  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from unnest(array['project_id','user_id']) as required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'agrovision_members'
      and c.column_name = required.name
  );

  if v_missing is not null then
    raise exception 'agrovision_members no contiene las columnas requeridas: %. No se modificó la tabla.', v_missing;
  end if;

  if exists (
    select 1 from public.agrovision_members
    where project_id is null or user_id is null
  ) then
    raise exception 'Hay membresías sin project_id o user_id. Corrige esos registros antes de migrar.';
  end if;

  if exists (
    select 1 from public.agrovision_members
    group by project_id, user_id
    having count(*) > 1
  ) then
    raise exception 'Hay membresías duplicadas por proyecto y usuario. No se eliminó ninguna fila.';
  end if;

  select c.conname,
         array_agg(a.attname::text order by key_column.ordinality)
    into v_pk_name, v_pk_columns
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
  join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = key_column.attnum
  where c.conrelid = 'public.agrovision_members'::regclass
    and c.contype = 'p'
  group by c.conname;

  if v_pk_name is not null and v_pk_columns = array['user_id'] then
    select count(*) into v_fk_count
    from pg_constraint
    where confrelid = 'public.agrovision_members'::regclass
      and contype = 'f';

    if v_fk_count > 0 then
      raise exception 'Hay claves foráneas que dependen de la PK actual de agrovision_members. Revisa esas dependencias antes de cambiarla.';
    end if;
  elsif v_pk_name is not null and v_pk_columns <> array['project_id','user_id'] then
    raise exception 'La PK actual de agrovision_members (%) no coincide con user_id ni con (project_id, user_id). Migración detenida.', v_pk_columns;
  end if;
end;
$migration$;

alter table public.agrovision_members add column if not exists member_name text;
update public.agrovision_members
set member_name = 'Integrante'
where member_name is null;
alter table public.agrovision_members alter column member_name set default 'Integrante';
alter table public.agrovision_members alter column member_name set not null;

alter table public.agrovision_members add column if not exists joined_at timestamptz;
update public.agrovision_members
set joined_at = now()
where joined_at is null;
alter table public.agrovision_members alter column joined_at set default now();
alter table public.agrovision_members alter column joined_at set not null;

alter table public.agrovision_members alter column project_id set not null;
alter table public.agrovision_members alter column user_id set not null;

DO $membership_pk$
declare
  v_pk_name text;
  v_pk_columns text[];
begin
  select c.conname,
         array_agg(a.attname::text order by key_column.ordinality)
    into v_pk_name, v_pk_columns
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
  join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = key_column.attnum
  where c.conrelid = 'public.agrovision_members'::regclass
    and c.contype = 'p'
  group by c.conname;

  if v_pk_name is not null and v_pk_columns = array['project_id','user_id'] then
    null; -- Ya está migrada.
  else
    if v_pk_name is not null then
      execute format('alter table public.agrovision_members drop constraint %I', v_pk_name);
    end if;

    -- El índice compuesto creado por las versiones anteriores queda redundante
    -- cuando se crea la PK compuesta. Solo se elimina ese índice conocido.
    drop index if exists public.agrovision_members_project_user_uidx;
    alter table public.agrovision_members
      add constraint agrovision_members_pkey primary key (project_id, user_id);
  end if;
end;
$membership_pk$;

alter table public.agrovision_members enable row level security;
revoke all on table public.agrovision_members from anon, authenticated;

create or replace function public.agrovision_is_project_member(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.agrovision_members m
    where m.project_id = p_project_id
      and m.user_id = auth.uid()
  );
$$;
revoke all on function public.agrovision_is_project_member(text) from public, anon;
grant execute on function public.agrovision_is_project_member(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Verificar y completar el esquema de observaciones.
-- ---------------------------------------------------------------------------
DO $records_preflight$
declare
  v_missing text;
begin
  if to_regclass('public.agrovision_records') is null then
    raise exception 'No existe public.agrovision_records. Ejecuta primero la instalación base y vuelve a revisar.';
  end if;

  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from unnest(array['id','owner_id','project_id','payload','created_by','updated_by']) as required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'agrovision_records'
      and c.column_name = required.name
  );

  if v_missing is not null then
    raise exception 'agrovision_records no contiene las columnas requeridas: %. No se modificó la tabla.', v_missing;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'agrovision_records'
      and column_name in ('created_at','updated_at')
      and data_type <> 'timestamp with time zone'
  ) then
    raise exception 'created_at o updated_at tienen un tipo distinto de timestamptz. No se cambiará el tipo automáticamente.';
  end if;

  if not exists (
    select 1
    from pg_index i
    cross join lateral unnest(i.indkey) with ordinality as key_column(attnum, ordinality)
    join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = key_column.attnum
    where i.indrelid = 'public.agrovision_records'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indnkeyatts = 1
      and key_column.ordinality = 1
      and a.attname = 'id'
  ) then
    raise exception 'agrovision_records necesita una clave única simple sobre id para usar la RPC por lotes.';
  end if;
end;
$records_preflight$;

alter table public.agrovision_records add column if not exists updated_at timestamptz;
update public.agrovision_records
set updated_at = clock_timestamp()
where updated_at is null;
alter table public.agrovision_records alter column updated_at set default clock_timestamp();
alter table public.agrovision_records alter column updated_at set not null;

alter table public.agrovision_records add column if not exists created_at timestamptz;
update public.agrovision_records
set created_at = coalesce(created_at, updated_at, clock_timestamp())
where created_at is null;
alter table public.agrovision_records alter column created_at set default now();
alter table public.agrovision_records alter column created_at set not null;

-- Un solo trigger de actualización, compatible con los dos nombres históricos.
create or replace function public.agrovision_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger if exists agrovision_records_touch_updated_at on public.agrovision_records;
drop trigger if exists agrovision_updated_at on public.agrovision_records;
create trigger agrovision_updated_at
before update on public.agrovision_records
for each row execute function public.agrovision_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS: reemplazar políticas legacy conocidas y detenerse ante otras.
-- ---------------------------------------------------------------------------
alter table public.agrovision_records enable row level security;

drop policy if exists "Users can delete own records" on public.agrovision_records;
drop policy if exists "Users can insert own records" on public.agrovision_records;
drop policy if exists "Users can read own records" on public.agrovision_records;
drop policy if exists "Users can update own records" on public.agrovision_records;
drop policy if exists agrovision_personal_records on public.agrovision_records;
drop policy if exists agrovision_records_select on public.agrovision_records;
drop policy if exists agrovision_records_insert on public.agrovision_records;
drop policy if exists agrovision_records_update on public.agrovision_records;
drop policy if exists agrovision_records_delete on public.agrovision_records;

DO $policy_preflight$
declare
  v_unexpected text;
begin
  select string_agg(policyname, ', ' order by policyname)
    into v_unexpected
  from pg_policies
  where schemaname = 'public'
    and tablename = 'agrovision_records';

  if v_unexpected is not null then
    raise exception 'Hay políticas RLS no reconocidas en agrovision_records (%). La migración se detuvo para no cambiar permisos inesperadamente.', v_unexpected;
  end if;
end;
$policy_preflight$;

create policy agrovision_records_select on public.agrovision_records
for select to authenticated
using (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
);

create policy agrovision_records_insert on public.agrovision_records
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);

create policy agrovision_records_update on public.agrovision_records
for update to authenticated
using (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
)
with check (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
  and updated_by = (select auth.uid())
);

create policy agrovision_records_delete on public.agrovision_records
for delete to authenticated
using (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
);

grant select, insert, update, delete on public.agrovision_records to authenticated;
revoke all on public.agrovision_records from anon;

-- ---------------------------------------------------------------------------
-- 4. Validación de integridad del payload en PostgreSQL.
-- ---------------------------------------------------------------------------
create or replace function public.agrovision_validate_record_payload()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_sowing date;
  v_observation date;
  v_identity text;
begin
  if new.payload is null or jsonb_typeof(new.payload) <> 'object' then
    raise exception 'La observación debe contener un objeto JSON válido.' using errcode = '22023';
  end if;

  if new.payload ->> 'id' is distinct from new.id then
    raise exception 'El identificador del registro no coincide con el contenido.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and (
    new.owner_id is distinct from old.owner_id
    or new.project_id is distinct from old.project_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'No se puede transferir una observación a otra cuenta o proyecto.' using errcode = '42501';
  end if;

  if coalesce(new.payload ->> 'source', 'manual') <> 'demo' then
    if new.payload ? 'heightCm' and jsonb_typeof(new.payload -> 'heightCm') not in ('number','null') then
      raise exception 'La altura debe ser numérica o nula.' using errcode = '22023';
    end if;
    if jsonb_typeof(new.payload -> 'heightCm') = 'number'
       and (new.payload ->> 'heightCm')::numeric < 0 then
      raise exception 'La altura no puede ser negativa.' using errcode = '22023';
    end if;

    if new.payload ? 'diameterCm' and jsonb_typeof(new.payload -> 'diameterCm') not in ('number','null') then
      raise exception 'El diámetro debe ser numérico o nulo.' using errcode = '22023';
    end if;
    if jsonb_typeof(new.payload -> 'diameterCm') = 'number'
       and (new.payload ->> 'diameterCm')::numeric <= 0 then
      raise exception 'El diámetro debe ser positivo.' using errcode = '22023';
    end if;

    if new.payload ? 'leafCount' and jsonb_typeof(new.payload -> 'leafCount') not in ('number','null') then
      raise exception 'El número de hojas debe ser numérico o nulo.' using errcode = '22023';
    end if;
    if jsonb_typeof(new.payload -> 'leafCount') = 'number'
       and ((new.payload ->> 'leafCount')::numeric < 0
         or trunc((new.payload ->> 'leafCount')::numeric) <> (new.payload ->> 'leafCount')::numeric) then
      raise exception 'El número de hojas debe ser un entero no negativo.' using errcode = '22023';
    end if;

    -- Los registros históricos incompletos se conservan; se validan los nuevos
    -- seguimientos que declaran identidad, fechas y dosis completas.
    if nullif(btrim(new.payload ->> 'plantId'), '') is not null
       and nullif(btrim(new.payload ->> 'sowingDate'), '') is not null
       and nullif(btrim(new.payload ->> 'date'), '') is not null
       and nullif(btrim(new.payload ->> 'dose'), '') is not null then
      begin
        v_sowing := (new.payload ->> 'sowingDate')::date;
        v_observation := (new.payload ->> 'date')::date;
      exception when others then
        raise exception 'Las fechas de siembra y observación deben ser fechas válidas.' using errcode = '22023';
      end;

      if v_observation < v_sowing then
        raise exception 'La fecha de observación no puede ser anterior a la siembra.' using errcode = '22023';
      end if;

      v_identity := concat_ws('|', new.owner_id::text, new.project_id,
        lower(btrim(coalesce(new.payload ->> 'crop',''))),
        lower(btrim(coalesce(new.payload ->> 'zone',''))),
        lower(btrim(new.payload ->> 'plantId')), v_sowing::text);
      perform pg_advisory_xact_lock(hashtextextended(v_identity, 0));

      if exists (
        select 1
        from public.agrovision_records r
        where r.owner_id = new.owner_id
          and r.project_id = new.project_id
          and r.id <> new.id
          and lower(btrim(coalesce(r.payload ->> 'crop',''))) = lower(btrim(coalesce(new.payload ->> 'crop','')))
          and lower(btrim(coalesce(r.payload ->> 'zone',''))) = lower(btrim(coalesce(new.payload ->> 'zone','')))
          and lower(btrim(coalesce(r.payload ->> 'plantId',''))) = lower(btrim(new.payload ->> 'plantId'))
          and r.payload ->> 'sowingDate' = new.payload ->> 'sowingDate'
          and r.payload ->> 'date' = new.payload ->> 'date'
          and coalesce(r.payload ->> 'source','manual') <> 'demo'
      ) then
        raise exception 'Esta planta ya tiene una observación en esa fecha.' using errcode = '23505';
      end if;

      if exists (
        select 1
        from public.agrovision_records r
        where r.owner_id = new.owner_id
          and r.project_id = new.project_id
          and r.id <> new.id
          and lower(btrim(coalesce(r.payload ->> 'crop',''))) = lower(btrim(coalesce(new.payload ->> 'crop','')))
          and lower(btrim(coalesce(r.payload ->> 'zone',''))) = lower(btrim(coalesce(new.payload ->> 'zone','')))
          and lower(btrim(coalesce(r.payload ->> 'plantId',''))) = lower(btrim(new.payload ->> 'plantId'))
          and r.payload ->> 'sowingDate' = new.payload ->> 'sowingDate'
          and coalesce(r.payload ->> 'source','manual') <> 'demo'
          and (
            lower(btrim(coalesce(r.payload ->> 'fertilizer',''))) <> lower(btrim(coalesce(new.payload ->> 'fertilizer','')))
            or lower(btrim(coalesce(r.payload ->> 'dose',''))) <> lower(btrim(coalesce(new.payload ->> 'dose','')))
          )
      ) then
        raise exception 'El tratamiento y la dosis de una planta no pueden cambiar durante el seguimiento.' using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.agrovision_validate_record_payload() from public, anon, authenticated;
drop trigger if exists agrovision_validate_record_payload on public.agrovision_records;
create trigger agrovision_validate_record_payload
before insert or update on public.agrovision_records
for each row execute function public.agrovision_validate_record_payload();

-- Desactiva el alta automática de membresías. La función antigua se conserva
-- por compatibilidad histórica, pero ya no queda asociada a un trigger.
drop trigger if exists agrovision_comparison_register_member on public.agrovision_records;

-- ---------------------------------------------------------------------------
-- 5. Escrituras por lote, atómicas y con control de concurrencia.
-- ---------------------------------------------------------------------------
create or replace function public.agrovision_records_apply_batch(
  p_project_id text,
  p_upserts jsonb default '[]'::jsonb,
  p_deletes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_item record;
  v_affected integer;
  v_upserted integer := 0;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para modificar la bitácora.' using errcode = '42501';
  end if;
  if nullif(btrim(p_project_id), '') is null then
    raise exception 'El proyecto no es válido.' using errcode = '22023';
  end if;
  if not public.agrovision_is_project_member(p_project_id) then
    raise exception 'Tu cuenta no está autorizada para este proyecto.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_upserts, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_deletes, '[]'::jsonb)) <> 'array' then
    raise exception 'Las operaciones masivas deben ser listas JSON.' using errcode = '22023';
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(coalesce(p_upserts, '[]'::jsonb))
      as x(id text, payload jsonb, expected_updated_at timestamptz)
    order by id
  loop
    if nullif(v_item.id, '') is null or v_item.payload is null then
      raise exception 'Cada alta o edición requiere identificador y contenido.' using errcode = '22023';
    end if;

    if v_item.expected_updated_at is null then
      insert into public.agrovision_records
        (id, owner_id, project_id, payload, created_by, updated_by)
      values
        (v_item.id, auth.uid(), p_project_id, v_item.payload, auth.uid(), auth.uid())
      on conflict (id) do nothing;
    else
      update public.agrovision_records r
      set payload = v_item.payload,
          updated_by = auth.uid()
      where r.id = v_item.id
        and r.owner_id = auth.uid()
        and r.project_id = p_project_id
        and r.updated_at = v_item.expected_updated_at;
    end if;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception 'Conflicto de concurrencia: una observación cambió o ya existe. Recarga la bitácora e inténtalo nuevamente.' using errcode = '40001';
    end if;
    v_upserted := v_upserted + 1;
  end loop;

  for v_item in
    select *
    from jsonb_to_recordset(coalesce(p_deletes, '[]'::jsonb))
      as x(id text, expected_updated_at timestamptz)
    order by id
  loop
    if nullif(v_item.id, '') is null or v_item.expected_updated_at is null then
      raise exception 'Cada eliminación requiere identificador y versión esperada.' using errcode = '22023';
    end if;

    delete from public.agrovision_records r
    where r.id = v_item.id
      and r.owner_id = auth.uid()
      and r.project_id = p_project_id
      and r.updated_at = v_item.expected_updated_at;

    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception 'Conflicto de concurrencia: una observación cambió o ya fue eliminada. Recarga la bitácora.' using errcode = '40001';
    end if;
    v_deleted := v_deleted + 1;
  end loop;

  return jsonb_build_object('upserted', v_upserted, 'deleted', v_deleted);
end;
$$;
revoke all on function public.agrovision_records_apply_batch(text, jsonb, jsonb) from public, anon;
grant execute on function public.agrovision_records_apply_batch(text, jsonb, jsonb) to authenticated;

commit;
notify pgrst, 'reload schema';

-- Verificación posterior, solo lectura.
select 'agrovision_members' as table_name, count(*) as rows from public.agrovision_members
union all
select 'agrovision_records', count(*) from public.agrovision_records;

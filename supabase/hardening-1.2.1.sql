-- TerraNova / AgroVisión 1.2.1 — migración compatible con instalaciones existentes.
-- IMPORTANTE: probar primero en un proyecto Supabase separado.
-- Esta migración no elimina observaciones, usuarios, membresías ni fotografías.
-- Conserva la clave primaria existente y las políticas RLS seguras ya instaladas.

begin;

-- 1) Membresías: completar columnas sin reconstruir la tabla ni cambiar su PK.
create table if not exists public.agrovision_members (
  project_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null default 'Integrante',
  joined_at timestamptz not null default now()
);

alter table public.agrovision_members enable row level security;
-- El cliente no consulta la tabla directamente; las funciones SECURITY DEFINER
-- autorizadas realizan las comprobaciones de pertenencia.
revoke all on table public.agrovision_members from anon, authenticated;

alter table public.agrovision_members add column if not exists member_name text;
update public.agrovision_members set member_name = 'Integrante' where member_name is null;
alter table public.agrovision_members alter column member_name set default 'Integrante';
alter table public.agrovision_members alter column member_name set not null;
alter table public.agrovision_members add column if not exists joined_at timestamptz;
update public.agrovision_members set joined_at = now() where joined_at is null;
alter table public.agrovision_members alter column joined_at set default now();
alter table public.agrovision_members alter column joined_at set not null;

-- No borrar duplicados ni cambiar la PK. Solo garantizar unicidad por proyecto/usuario.
do $$
begin
  if exists (
    select 1 from public.agrovision_members
    group by project_id, user_id having count(*) > 1
  ) then
    raise exception 'Hay membresías duplicadas por proyecto y usuario. No se modificó ninguna fila.';
  end if;
  if exists (
    select 1 from public.agrovision_members
    where project_id is null or user_id is null
  ) then
    raise exception 'Hay membresías sin project_id o user_id. No se modificó ninguna fila.';
  end if;
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class ix on ix.oid = i.indexrelid
    where n.nspname = 'public'
      and t.relname = 'agrovision_members'
      and i.indisunique
      and position('(project_id, user_id)' in pg_get_indexdef(ix.oid)) > 0
  ) then
    create unique index agrovision_members_project_user_uidx
      on public.agrovision_members (project_id, user_id);
  end if;
end;
$$;

create or replace function public.agrovision_is_project_member(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.agrovision_members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
  );
$$;
revoke all on function public.agrovision_is_project_member(text) from public, anon;
grant execute on function public.agrovision_is_project_member(text) to authenticated;

-- 2) Verificar la tabla de observaciones y completar timestamps.
do $$
declare missing_columns text;
begin
  if to_regclass('public.agrovision_records') is null then
    raise exception 'No existe public.agrovision_records. Instala primero el esquema base.';
  end if;
  select string_agg(required.name, ', ')
    into missing_columns
  from unnest(array['id','owner_id','project_id','payload','created_by','updated_by']) as required(name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='agrovision_records'
      and c.column_name=required.name
  );
  if missing_columns is not null then
    raise exception 'Faltan columnas requeridas en agrovision_records: %', missing_columns;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='agrovision_records'
      and column_name in ('created_at','updated_at')
      and data_type <> 'timestamp with time zone'
  ) then
    raise exception 'created_at y updated_at deben ser timestamptz. No se convierten automáticamente.';
  end if;
end;
$$;

alter table public.agrovision_records add column if not exists updated_at timestamptz;
update public.agrovision_records set updated_at = clock_timestamp() where updated_at is null;
alter table public.agrovision_records alter column updated_at set default clock_timestamp();
alter table public.agrovision_records alter column updated_at set not null;
alter table public.agrovision_records add column if not exists created_at timestamptz;
update public.agrovision_records
set created_at = coalesce(created_at, updated_at, clock_timestamp())
where created_at is null;
alter table public.agrovision_records alter column created_at set default now();
alter table public.agrovision_records alter column created_at set not null;

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
drop trigger if exists agrovision_updated_at on public.agrovision_records;
create trigger agrovision_updated_at
before update on public.agrovision_records
for each row execute function public.agrovision_touch_updated_at();

alter table public.agrovision_records enable row level security;
grant select, insert, update, delete on public.agrovision_records to authenticated;
revoke all on public.agrovision_records from anon;

-- 3) RLS: aceptar el esquema seguro que ya tiene la instalación del usuario.
--    No crear una política ALL adicional encima de cuatro políticas CRUD,
--    porque las políticas permisivas se combinan con OR.
do $$
declare
  v_count integer;
  v_expected integer;
  v_unsafe text;
begin
  select count(*) into v_count
  from pg_policies
  where schemaname='public' and tablename='agrovision_records';

  select count(*) into v_expected
  from pg_policies
  where schemaname='public' and tablename='agrovision_records'
    and policyname in (
      'agrovision_records_select',
      'agrovision_records_insert',
      'agrovision_records_update',
      'agrovision_records_delete'
    );

  if v_count = 0 then
    execute $policy$
      create policy agrovision_records_select on public.agrovision_records
      for select to authenticated
      using (owner_id = (select auth.uid()) and public.agrovision_is_project_member(project_id))
    $policy$;
    execute $policy$
      create policy agrovision_records_insert on public.agrovision_records
      for insert to authenticated
      with check (
        owner_id = (select auth.uid())
        and public.agrovision_is_project_member(project_id)
        and created_by = (select auth.uid())
        and updated_by = (select auth.uid())
      )
    $policy$;
    execute $policy$
      create policy agrovision_records_update on public.agrovision_records
      for update to authenticated
      using (owner_id = (select auth.uid()) and public.agrovision_is_project_member(project_id))
      with check (
        owner_id = (select auth.uid())
        and public.agrovision_is_project_member(project_id)
        and updated_by = (select auth.uid())
      )
    $policy$;
    execute $policy$
      create policy agrovision_records_delete on public.agrovision_records
      for delete to authenticated
      using (owner_id = (select auth.uid()) and public.agrovision_is_project_member(project_id))
    $policy$;
  elsif v_count = 4 and v_expected = 4 then
    -- La configuración ya existente coincide con el modelo CRUD esperado.
    select string_agg(p.policyname, ', ' order by p.policyname)
      into v_unsafe
    from pg_policies p
    where p.schemaname='public' and p.tablename='agrovision_records'
      and (
        not ('authenticated' = any(p.roles))
        or case p.cmd
          when 'SELECT' then coalesce(p.qual,'') not ilike '%owner_id%'
            or coalesce(p.qual,'') not ilike '%agrovision_is_project_member%'
          when 'DELETE' then coalesce(p.qual,'') not ilike '%owner_id%'
            or coalesce(p.qual,'') not ilike '%agrovision_is_project_member%'
          when 'INSERT' then coalesce(p.with_check,'') not ilike '%owner_id%'
            or coalesce(p.with_check,'') not ilike '%agrovision_is_project_member%'
            or coalesce(p.with_check,'') not ilike '%created_by%'
            or coalesce(p.with_check,'') not ilike '%updated_by%'
          when 'UPDATE' then coalesce(p.qual,'') not ilike '%owner_id%'
            or coalesce(p.qual,'') not ilike '%agrovision_is_project_member%'
            or coalesce(p.with_check,'') not ilike '%updated_by%'
          else true
        end
      );
    if v_unsafe is not null then
      raise exception 'Las políticas RLS existentes no coinciden con las condiciones seguras esperadas: %', v_unsafe;
    end if;
  elsif v_count = 1 and v_expected = 0 then
    -- Compatibilidad con instalaciones que ya usan una única política ALL.
    if not exists (
      select 1 from pg_policies p
      where p.schemaname='public' and p.tablename='agrovision_records'
        and p.policyname='agrovision_personal_records'
        and 'authenticated' = any(p.roles)
        and coalesce(p.qual,'') ilike '%owner_id%'
        and coalesce(p.qual,'') ilike '%agrovision_is_project_member%'
        and coalesce(p.with_check,'') ilike '%owner_id%'
        and coalesce(p.with_check,'') ilike '%agrovision_is_project_member%'
    ) then
      raise exception 'La política agrovision_personal_records existe pero no coincide con las condiciones seguras esperadas.';
    end if;
  else
    raise exception 'Conjunto de políticas RLS no reconocido (% políticas, % CRUD esperadas). No se modificó ninguna política.', v_count, v_expected;
  end if;
end;
$$;

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

  if coalesce(new.payload ->> 'source', 'manual') <> 'demo' then
    if new.payload ? 'heightCm' and jsonb_typeof(new.payload -> 'heightCm') not in ('number','null') then
      raise exception 'La altura debe ser numérica o nula.' using errcode = '22023';
    end if;
    if jsonb_typeof(new.payload -> 'heightCm') = 'number' and (new.payload ->> 'heightCm')::numeric < 0 then
      raise exception 'La altura no puede ser negativa.' using errcode = '22023';
    end if;
    if new.payload ? 'diameterCm' and jsonb_typeof(new.payload -> 'diameterCm') not in ('number','null') then
      raise exception 'El diámetro debe ser numérico o nulo.' using errcode = '22023';
    end if;
    if jsonb_typeof(new.payload -> 'diameterCm') = 'number' and (new.payload ->> 'diameterCm')::numeric <= 0 then
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

    -- Los registros históricos incompletos se conservan. Las reglas estrictas
    -- se aplican cuando el registro declara una identidad completa de planta.
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
        select 1 from public.agrovision_records r
        where r.owner_id = new.owner_id and r.project_id = new.project_id
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
        select 1 from public.agrovision_records r
        where r.owner_id = new.owner_id and r.project_id = new.project_id
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

-- Desactiva el mecanismo anterior que inscribía automáticamente a cualquier
-- propietario de una observación. La membresía ahora es explícita.
drop trigger if exists agrovision_comparison_register_member on public.agrovision_records;
drop function if exists public.agrovision_comparison_register_member();

-- Aplica altas, ediciones y eliminaciones en una única transacción PostgreSQL.
-- Mantiene control optimista de concurrencia mediante updated_at.
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
  if jsonb_typeof(coalesce(p_upserts, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_deletes, '[]'::jsonb)) <> 'array' then
    raise exception 'Las operaciones masivas deben ser listas JSON.' using errcode = '22023';
  end if;

  for v_item in
    select * from jsonb_to_recordset(coalesce(p_upserts, '[]'::jsonb))
      as x(id text, payload jsonb, expected_updated_at timestamptz)
  loop
    if nullif(v_item.id, '') is null or v_item.payload is null then
      raise exception 'Cada alta o edición requiere identificador y contenido.' using errcode = '22023';
    end if;
    if v_item.expected_updated_at is null then
      insert into public.agrovision_records (id, owner_id, project_id, payload, created_by, updated_by)
      values (v_item.id, auth.uid(), p_project_id, v_item.payload, auth.uid(), auth.uid())
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
    select * from jsonb_to_recordset(coalesce(p_deletes, '[]'::jsonb))
      as x(id text, expected_updated_at timestamptz)
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

-- Verificación posterior de conteos (solo lectura).
select 'agrovision_members' as table_name, count(*) as rows from public.agrovision_members
union all
select 'agrovision_records', count(*) from public.agrovision_records;

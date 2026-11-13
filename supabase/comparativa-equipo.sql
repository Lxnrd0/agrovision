-- TerraNova: comparativa segura entre integrantes del mismo proyecto.
-- Ejecutar una sola vez desde Supabase > SQL Editor.
-- No concede acceso a los registros ni a las fotografías privadas.

begin;

-- Membresías aisladas por proyecto. Se crea aquí también para que este
-- script sea ejecutable después de personal-account.sql o en instalaciones existentes.
create table if not exists public.agrovision_members (
  project_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null default 'Integrante',
  joined_at timestamptz not null default now()
);
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
    select 1 from public.agrovision_members m
    where m.project_id = p_project_id and m.user_id = auth.uid()
  );
$$;
revoke all on function public.agrovision_is_project_member(text) from public, anon;
grant execute on function public.agrovision_is_project_member(text) to authenticated;

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
create policy agrovision_records_select on public.agrovision_records
for select to authenticated
using (owner_id = (select auth.uid()) and public.agrovision_is_project_member(project_id));
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
using (owner_id = (select auth.uid()) and public.agrovision_is_project_member(project_id))
with check (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
  and updated_by = (select auth.uid())
);
create policy agrovision_records_delete on public.agrovision_records
for delete to authenticated
using (owner_id = (select auth.uid()) and public.agrovision_is_project_member(project_id));
grant select, insert, update, delete on public.agrovision_records to authenticated;
revoke all on public.agrovision_records from anon;

do $$
declare extra_policies text;
begin
  select string_agg(policyname, ', ' order by policyname)
    into extra_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'agrovision_records'
    and policyname not in (
      'agrovision_records_select', 'agrovision_records_insert',
      'agrovision_records_update', 'agrovision_records_delete'
    );
  if extra_policies is not null then
    raise exception 'Hay políticas RLS adicionales en agrovision_records (%). Revísalas: PostgreSQL combina políticas permisivas con OR.', extra_policies;
  end if;
end;
$$;

create table if not exists public.agrovision_comparison_admins (
  project_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.agrovision_comparison_admins enable row level security;
revoke all on table public.agrovision_comparison_admins from anon, authenticated;

create table if not exists public.agrovision_comparison_publications (
  project_id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id)
);

alter table public.agrovision_comparison_publications enable row level security;
revoke all on table public.agrovision_comparison_publications from anon, authenticated;

create index if not exists agrovision_records_project_comparison_idx
  on public.agrovision_records (project_id, updated_at desc);

-- Detecta duplicados antiguos sin eliminarlos silenciosamente.
do $$
begin
  if exists (
    select 1 from public.agrovision_members
    group by project_id, user_id having count(*) > 1
  ) then
    raise exception 'Hay membresías duplicadas por proyecto y usuario. Revísalas antes de crear la restricción única.';
  end if;
  if exists (select 1 from public.agrovision_members where project_id is null or user_id is null) then
    raise exception 'Hay membresías sin project_id o user_id. Revísalas antes de crear la restricción única.';
  end if;
end;
$$;
alter table public.agrovision_members alter column project_id set not null;
alter table public.agrovision_members alter column user_id set not null;

-- Esta instalación debe ejecutarse después de hardening-1.2.1.sql.
-- Exigimos PK compuesta real, no solo un índice secundario, para que una
-- cuenta pueda tener membresías independientes en distintos proyectos.
do $$
declare
  v_pk_columns text[];
begin
  select array_agg(a.attname::text order by key_column.ordinality)
    into v_pk_columns
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
  join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = key_column.attnum
  where c.conrelid = 'public.agrovision_members'::regclass
    and c.contype = 'p'
  group by c.conname;

  if v_pk_columns is distinct from array['project_id','user_id'] then
    raise exception 'Ejecuta primero hardening-1.2.1.sql: agrovision_members requiere PK (project_id, user_id).';
  end if;
end;
$$;

-- La pertenencia al proyecto es explícita. No se incorpora a nadie por conocer project_id.
drop trigger if exists agrovision_comparison_register_member on public.agrovision_records;
-- Se conserva la función trigger histórica por compatibilidad; sin trigger ya no se ejecuta.

-- Convierte fechas de JSON sin interrumpir el informe si un registro antiguo
-- contiene una fecha inválida.
create or replace function public.agrovision_comparison_try_date(p_value text)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end;
$$;

revoke all on function public.agrovision_comparison_try_date(text) from public, anon, authenticated;

create or replace function public.agrovision_comparison_is_admin(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.agrovision_comparison_admins a
    where a.project_id = p_project_id
      and a.user_id = auth.uid()
  );
$$;

revoke all on function public.agrovision_comparison_is_admin(text) from public, anon;
grant execute on function public.agrovision_comparison_is_admin(text) to authenticated;

create or replace function public.agrovision_comparison_preview(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para consultar la comparativa.' using errcode = '42501';
  end if;

  if nullif(btrim(p_project_id), '') is null then
    raise exception 'El proyecto de la comparativa no es válido.' using errcode = '22023';
  end if;

  if not public.agrovision_comparison_is_admin(p_project_id) then
    raise exception 'Solo el administrador puede generar la vista previa.' using errcode = '42501';
  end if;

  -- Solo se consideran observaciones de cuentas inscritas explícitamente.
  with base as (
    select
      r.owner_id,
      r.id as record_id,
      r.created_at,
      btrim(src.p ->> 'crop') as crop,
      btrim(src.p ->> 'zone') as zone,
      btrim(src.p ->> 'plantId') as plant_id,
      btrim(src.p ->> 'fertilizer') as fertilizer,
      btrim(src.p ->> 'dose') as dose,
      dt.sowing_date,
      dt.observation_date,
      (dt.observation_date - dt.sowing_date)::integer as age_days,
      case
        when src.p -> 'measurementSources' ->> 'heightCm' = 'manual'
         and jsonb_typeof(src.p -> 'heightCm') = 'number'
        then (src.p ->> 'heightCm')::numeric
        else null
      end as height_cm,
      case
        when src.p -> 'measurementSources' ->> 'leafCount' = 'manual'
         and jsonb_typeof(src.p -> 'leafCount') = 'number'
        then (src.p ->> 'leafCount')::numeric
        else null
      end as leaf_count,
      case
        when src.p -> 'measurementSources' ->> 'diameterCm' = 'manual'
         and jsonb_typeof(src.p -> 'diameterCm') = 'number'
        then (src.p ->> 'diameterCm')::numeric
        else null
      end as diameter_cm,
      src.p ->> 'health' as health,
      jsonb_build_array(
        r.owner_id::text,
        lower(btrim(src.p ->> 'crop')),
        lower(btrim(src.p ->> 'zone')),
        lower(btrim(src.p ->> 'plantId')),
        dt.sowing_date::text
      )::text as plant_key,
      jsonb_build_array(
        lower(btrim(src.p ->> 'crop')),
        lower(btrim(src.p ->> 'fertilizer')),
        lower(btrim(src.p ->> 'dose'))
      )::text as treatment_key
    from public.agrovision_records r
    cross join lateral (select r.payload as p) src
    cross join lateral (
      select
        public.agrovision_comparison_try_date(src.p ->> 'sowingDate') as sowing_date,
        public.agrovision_comparison_try_date(src.p ->> 'date') as observation_date
    ) dt
    where r.project_id = p_project_id
      and exists (
        select 1 from public.agrovision_members m
        where m.project_id = r.project_id and m.user_id = r.owner_id
      )
      and jsonb_typeof(r.payload) = 'object'
      and coalesce(src.p ->> 'source', 'manual') <> 'demo'
      and nullif(btrim(src.p ->> 'crop'), '') is not null
      and nullif(btrim(src.p ->> 'plantId'), '') is not null
      and nullif(btrim(src.p ->> 'fertilizer'), '') is not null
      and nullif(btrim(src.p ->> 'dose'), '') is not null
      and dt.sowing_date is not null
      and dt.observation_date is not null
      and dt.observation_date >= dt.sowing_date
  ),
  plant_latest as (
    select distinct on (b.plant_key) b.*
    from base b
    order by b.plant_key, b.observation_date desc, b.created_at desc, b.record_id desc
  ),
  height_latest as (
    select distinct on (b.plant_key)
      b.plant_key, b.treatment_key, b.height_cm, b.observation_date
    from base b
    where b.height_cm is not null
    order by b.plant_key, b.observation_date desc, b.created_at desc, b.record_id desc
  ),
  height_first as (
    select distinct on (b.plant_key)
      b.plant_key, b.treatment_key, b.height_cm, b.observation_date
    from base b
    where b.height_cm is not null
    order by b.plant_key, b.observation_date asc, b.created_at asc, b.record_id asc
  ),
  height_growth as (
    select
      last_measure.plant_key,
      last_measure.treatment_key,
      (last_measure.height_cm - first_measure.height_cm)
        / nullif((last_measure.observation_date - first_measure.observation_date)::numeric, 0) as cm_per_day,
      (last_measure.observation_date - first_measure.observation_date)::integer as days_between_measurements
    from height_latest last_measure
    join height_first first_measure
      on first_measure.plant_key = last_measure.plant_key
     and first_measure.treatment_key = last_measure.treatment_key
    where last_measure.observation_date > first_measure.observation_date
  ),
  leaf_latest as (
    select distinct on (b.plant_key)
      b.plant_key, b.treatment_key, b.leaf_count
    from base b
    where b.leaf_count is not null
    order by b.plant_key, b.observation_date desc, b.created_at desc, b.record_id desc
  ),
  diameter_latest as (
    select distinct on (b.plant_key)
      b.plant_key, b.treatment_key, b.diameter_cm
    from base b
    where b.diameter_cm is not null
    order by b.plant_key, b.observation_date desc, b.created_at desc, b.record_id desc
  ),
  treatment_stats as (
    select
      min(p.crop) as crop,
      min(p.fertilizer) as fertilizer,
      min(p.dose) as dose,
      p.treatment_key,
      count(*)::integer as plant_count,
      count(distinct p.owner_id)::integer as member_count,
      min(p.age_days)::integer as age_min_days,
      max(p.age_days)::integer as age_max_days,
      count(h.height_cm)::integer as height_n,
      round(avg(h.height_cm), 2) as mean_height_cm,
      count(g.cm_per_day)::integer as growth_n,
      round(avg(g.cm_per_day), 4) as mean_growth_cm_per_day,
      round(avg(g.days_between_measurements), 1) as mean_growth_period_days,
      count(l.leaf_count)::integer as leaves_n,
      round(avg(l.leaf_count), 2) as mean_leaf_count,
      count(d.diameter_cm)::integer as diameter_n,
      round(avg(d.diameter_cm), 2) as mean_diameter_cm,
      count(*) filter (where p.health in ('Sano', 'Enfermo'))::integer as health_assessed,
      count(*) filter (where p.health = 'Sano')::integer as healthy_count,
      round(
        100.0 * count(*) filter (where p.health = 'Sano')
        / nullif(count(*) filter (where p.health in ('Sano', 'Enfermo')), 0),
        1
      ) as healthy_percent
    from plant_latest p
    left join height_latest h on h.plant_key = p.plant_key and h.treatment_key = p.treatment_key
    left join height_growth g on g.plant_key = p.plant_key and g.treatment_key = p.treatment_key
    left join leaf_latest l on l.plant_key = p.plant_key and l.treatment_key = p.treatment_key
    left join diameter_latest d on d.plant_key = p.plant_key and d.treatment_key = p.treatment_key
    group by p.treatment_key
  ),
  totals as (
    select
      count(*)::integer as observations,
      count(distinct plant_key)::integer as plants,
      (select count(*)::integer from public.agrovision_members m where m.project_id = p_project_id) as members,
      count(distinct treatment_key)::integer as treatments
    from base
  ),
  treatment_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'crop', s.crop,
          'fertilizer', s.fertilizer,
          'dose', s.dose,
          'plantCount', s.plant_count,
          'memberCount', s.member_count,
          'ageMinDays', s.age_min_days,
          'ageMaxDays', s.age_max_days,
          'height', jsonb_build_object('n', s.height_n, 'meanCm', s.mean_height_cm),
          'growth', jsonb_build_object(
            'n', s.growth_n,
            'meanCmPerDay', s.mean_growth_cm_per_day,
            'meanPeriodDays', s.mean_growth_period_days
          ),
          'leaves', jsonb_build_object('n', s.leaves_n, 'meanCount', s.mean_leaf_count),
          'diameter', jsonb_build_object('n', s.diameter_n, 'meanCm', s.mean_diameter_cm),
          'health', jsonb_build_object(
            'assessed', s.health_assessed,
            'healthy', s.healthy_count,
            'healthyPercent', s.healthy_percent
          )
        )
        order by s.mean_growth_cm_per_day desc nulls last, s.fertilizer asc
      ),
      '[]'::jsonb
    ) as items
    from treatment_stats s
  ),
  warning_rows as (
    select 'Todavía no hay observaciones reales completas para comparar.'::text as message
    where not exists (select 1 from base)
    union all
    select 'Las plantas tienen edades distintas; interpreta con cautela los promedios de tamaño.'
    where (select min(age_days) <> max(age_days) from plant_latest)
    union all
    select 'Algún tratamiento tiene una sola planta; los resultados son descriptivos y no prueban causalidad.'
    where exists (select 1 from treatment_stats where plant_count < 2)
    union all
    select 'No hay al menos dos mediciones manuales de altura para calcular la velocidad de crecimiento.'
    where not exists (select 1 from height_growth)
    union all
    select 'No hay mediciones manuales de diámetro registradas.'
    where not exists (select 1 from diameter_latest)
    union all
    select 'El formulario actual no registra peso de cosecha; ese indicador no se puede comparar.'
  ),
  warning_json as (
    select coalesce(jsonb_agg(message), '[]'::jsonb) as items
    from warning_rows
  )
  select jsonb_build_object(
    'projectId', p_project_id,
    'generatedAt', now(),
    'summary', jsonb_build_object(
      'observations', t.observations,
      'plants', t.plants,
      'members', t.members,
      'treatments', t.treatments
    ),
    'treatments', tj.items,
    'warnings', wj.items,
    'methodology', jsonb_build_object(
      'measurements', 'Solo mediciones manuales; se excluyen ejemplos y estimaciones de IA.',
      'growth', 'Velocidad por planta = (última altura manual − primera altura manual) / días transcurridos.',
      'averages', 'Se utiliza la última medición manual disponible de cada planta para altura, hojas y diámetro.',
      'privacy', 'Se comparten únicamente resultados agrupados; no se incluyen nombres, fotografías, observaciones ni identificadores personales.'
    )
  )
  into v_result
  from totals t
  cross join treatment_json tj
  cross join warning_json wj;

  return v_result;
end;
$$;

revoke all on function public.agrovision_comparison_preview(text) from public, anon;
grant execute on function public.agrovision_comparison_preview(text) to authenticated;

create or replace function public.agrovision_comparison_publish(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
  v_published_at timestamptz;
begin
  if not public.agrovision_comparison_is_admin(p_project_id) then
    raise exception 'Solo el administrador puede publicar la comparativa.' using errcode = '42501';
  end if;

  v_payload := public.agrovision_comparison_preview(p_project_id);

  insert into public.agrovision_comparison_publications (
    project_id, payload, published_at, published_by
  ) values (
    p_project_id, v_payload, now(), auth.uid()
  )
  on conflict (project_id) do update
  set payload = excluded.payload,
      published_at = excluded.published_at,
      published_by = excluded.published_by
  returning published_at into v_published_at;

  return jsonb_build_object(
    'payload', v_payload,
    'publishedAt', v_published_at
  );
end;
$$;

revoke all on function public.agrovision_comparison_publish(text) from public, anon;
grant execute on function public.agrovision_comparison_publish(text) to authenticated;

create or replace function public.agrovision_comparison_published(p_project_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para consultar la comparativa.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.agrovision_members m
    where m.user_id = auth.uid()
      and m.project_id = p_project_id
  ) then
    raise exception 'Tu cuenta todavía no pertenece a este proyecto.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'payload', p.payload,
    'publishedAt', p.published_at
  )
  into v_result
  from public.agrovision_comparison_publications p
  where p.project_id = p_project_id;

  return v_result;
end;
$$;

revoke all on function public.agrovision_comparison_published(text) from public, anon;
grant execute on function public.agrovision_comparison_published(text) to authenticated;

comment on table public.agrovision_comparison_admins is
  'Administradores autorizados a generar y publicar comparativas agregadas por proyecto.';
comment on table public.agrovision_comparison_publications is
  'Instantánea publicada de métricas agregadas; no contiene observaciones ni fotografías individuales.';

commit;
notify pgrst, 'reload schema';

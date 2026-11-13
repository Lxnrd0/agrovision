-- Ejecutar con el editor SQL de un proyecto Supabase propio.
-- No incluye ni necesita service_role en el cliente.

begin;
create table if not exists public.agrovision_records (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  constraint payload_id_matches check (payload->>'id' = id)
);
-- Membresías por proyecto: una misma cuenta puede participar en varios proyectos.
create table if not exists public.agrovision_members (
  project_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null default 'Integrante',
  joined_at timestamptz not null default now()
);
create unique index if not exists agrovision_members_project_user_uidx
  on public.agrovision_members (project_id, user_id);
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
create index if not exists agrovision_owner_project on public.agrovision_records(owner_id, project_id);
create or replace function public.agrovision_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger if exists agrovision_updated_at on public.agrovision_records;
create trigger agrovision_updated_at before update on public.agrovision_records
for each row execute function public.agrovision_touch_updated_at();
drop policy if exists agrovision_personal_records on public.agrovision_records;
create policy agrovision_personal_records on public.agrovision_records
for all to authenticated
using (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
)
with check (
  owner_id = (select auth.uid())
  and public.agrovision_is_project_member(project_id)
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
grant select, insert, update, delete on public.agrovision_records to authenticated;
revoke all on public.agrovision_records from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agrovision-photos', 'agrovision-photos', false, 12582912,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists agrovision_personal_photos on storage.objects;
create policy agrovision_personal_photos on storage.objects
for all to authenticated
using (bucket_id = 'agrovision-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'agrovision-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Si existían otras políticas permisivas en estas tablas/bucket, revisarlas:
-- las políticas de PostgreSQL pueden combinarse con OR.

commit;
notify pgrst, 'reload schema';

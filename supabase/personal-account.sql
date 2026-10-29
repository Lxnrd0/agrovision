-- Ejecutar con el editor SQL de un proyecto Supabase propio.
-- No incluye ni necesita service_role en el cliente.
create table if not exists public.agrovision_records (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null,
  payload jsonb not null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  constraint payload_id_matches check (payload->>'id' = id)
);
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
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()) and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
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

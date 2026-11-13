-- Actualiza solo la fuente del indicador; no modifica publicaciones, membresías ni RLS.
create or replace function public.agrovision_comparison_record_owner_count(p_project_id text)
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para consultar la comparativa.' using errcode = '42501';
  end if;

  if nullif(btrim(p_project_id), '') is null then
    raise exception 'El proyecto de la comparativa no es válido.' using errcode = '22023';
  end if;

  if not public.agrovision_comparison_is_admin(p_project_id)
     and not exists (
       select 1
       from public.agrovision_members m
       where m.project_id = p_project_id
         and m.user_id = auth.uid()
     ) then
    raise exception 'Tu cuenta todavía no pertenece a este proyecto.' using errcode = '42501';
  end if;

  return (
    select count(distinct r.owner_id)::integer
    from public.agrovision_records r
    where r.project_id = p_project_id
  );
end;
$$;

revoke all on function public.agrovision_comparison_record_owner_count(text) from public, anon;
grant execute on function public.agrovision_comparison_record_owner_count(text) to authenticated;

notify pgrst, 'reload schema';

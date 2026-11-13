-- Ejecutar en Supabase SQL Editor como propietario del proyecto.
-- Sustituye el correo y el nombre por los datos de la cuenta que autorizas.
-- No compartas este archivo con datos personales completados.

do $$
declare
  v_project_id text := 'rabanitos-2026';
  v_member_email text := lower(trim('CORREO_DEL_INTEGRANTE'));
  v_member_name text := 'Integrante';
  v_member_id uuid;
begin
  if v_member_email = '' or v_member_email = 'correo_del_integrante' then
    raise exception 'Reemplaza CORREO_DEL_INTEGRANTE por el correo de la cuenta que vas a autorizar.';
  end if;

  select u.id into v_member_id
  from auth.users u
  where lower(u.email) = v_member_email
  limit 1;

  if v_member_id is null then
    raise exception 'No se encontró una cuenta con ese correo en Supabase Auth.';
  end if;

  insert into public.agrovision_members (project_id, user_id, member_name)
  values (v_project_id, v_member_id, v_member_name)
  on conflict (project_id, user_id) do update
    set member_name = excluded.member_name;
end;
$$;

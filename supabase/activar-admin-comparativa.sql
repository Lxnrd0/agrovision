-- Ejecuta este bloque después de comparativa-equipo.sql.
-- Sustituye el texto por el correo de TU cuenta administradora de Supabase.
-- No compartas tu correo ni tu UUID en el chat.

do $$
declare
  v_admin_email text := lower(trim('PON_AQUI_TU_CORREO'));
  v_admin_id uuid;
begin
  if v_admin_email = 'pon_aqui_tu_correo' or v_admin_email = '' then
    raise exception 'Primero reemplaza PON_AQUI_TU_CORREO por el correo de tu cuenta administradora.';
  end if;

  select u.id
  into v_admin_id
  from auth.users u
  where lower(u.email) = v_admin_email
  limit 1;

  if v_admin_id is null then
    raise exception 'No se encontró una cuenta de Supabase con ese correo.';
  end if;

  insert into public.agrovision_comparison_admins (project_id, user_id)
  values ('rabanitos-2026', v_admin_id)
  on conflict (project_id, user_id) do nothing;
end;
$$;

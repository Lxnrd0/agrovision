-- Ejecutar en Supabase SQL Editor como propietario del proyecto.
-- Usar únicamente para dar de alta una CUENTA NUEVA que aún no sea miembro.
-- No ejecutar para los dos integrantes que ya están registrados.
-- Sustituye el correo y el nombre localmente; no subas datos personales al repositorio.
-- Ejecutar DESPUÉS de hardening-1.2.1.sql.

do $$
declare
  v_project_id text := 'rabanitos-2026';
  v_member_email text := lower(trim('CORREO_DEL_INTEGRANTE'));
  v_member_name text := 'Integrante';
  v_member_id uuid;
  v_inserted integer;
begin
  if v_project_id = '' then
    raise exception 'Configura el identificador del proyecto.';
  end if;

  if v_member_email = '' or v_member_email = 'correo_del_integrante' then
    raise exception 'Reemplaza CORREO_DEL_INTEGRANTE por el correo de la cuenta que vas a autorizar.';
  end if;

  select u.id into v_member_id
  from auth.users u
  where lower(u.email) = v_member_email;

  if v_member_id is null then
    raise exception 'No se encontró una cuenta con ese correo en Supabase Auth.';
  end if;

  insert into public.agrovision_members (project_id, user_id, member_name)
  values (v_project_id, v_member_id, v_member_name)
  on conflict (project_id, user_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    raise notice 'Integrante autorizado para el proyecto %.', v_project_id;
  else
    raise notice 'La cuenta ya era integrante del proyecto %. No se modificó su nombre ni su fecha de ingreso.', v_project_id;
  end if;
end;
$$;

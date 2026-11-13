-- SOLO LECTURA. Ejecutar antes de hardening-1.2.1.sql.
-- No inserta, actualiza, elimina ni modifica permisos.

select jsonb_build_object(
  'members', jsonb_build_object(
    'columns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', column_name, 'type', data_type, 'nullable', is_nullable
      ) order by ordinal_position), '[]'::jsonb)
      from information_schema.columns
      where table_schema='public' and table_name='agrovision_members'
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'project_id', project_id, 'members', member_count
      )), '[]'::jsonb)
      from (
        select project_id, count(*)::integer as member_count
        from public.agrovision_members group by project_id
      ) x
    ),
    'primary_key', (
      select pg_get_constraintdef(oid)
      from pg_constraint
      where conrelid='public.agrovision_members'::regclass and contype='p'
      limit 1
    ),
    'foreign_keys_referencing_members', (
      select count(*)::integer from pg_constraint
      where confrelid='public.agrovision_members'::regclass and contype='f'
    ),
    'duplicate_project_users', (
      select count(*)::integer from (
        select project_id, user_id
        from public.agrovision_members
        group by project_id, user_id having count(*) > 1
      ) d
    )
  ),
  'records', jsonb_build_object(
    'count', (select count(*)::bigint from public.agrovision_records),
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', policyname, 'command', cmd, 'roles', roles,
        'using', qual, 'with_check', with_check
      ) order by policyname), '[]'::jsonb)
      from pg_policies
      where schemaname='public' and tablename='agrovision_records'
    ),
    'triggers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', trigger_name, 'action', action_statement
      ) order by trigger_name), '[]'::jsonb)
      from information_schema.triggers
      where event_object_schema='public' and event_object_table='agrovision_records'
    )
  )
) as preflight_report;

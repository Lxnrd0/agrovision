-- AgroVisión 1.2.1 — preflight de solo lectura.
-- Ejecutar antes de la migración. No crea ni modifica objetos ni datos.
select jsonb_build_object(
  'project_id', current_database(),
  'members', (select count(*) from public.agrovision_members),
  'records', (select count(*) from public.agrovision_records),
  'members_primary_key', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.agrovision_members'::regclass and contype='p'
  ),
  'members_unique_project_user', exists (
    select 1 from pg_index i
    join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_class ix on ix.oid=i.indexrelid
    where n.nspname='public' and t.relname='agrovision_members'
      and i.indisunique
      and position('(project_id, user_id)' in pg_get_indexdef(ix.oid)) > 0
  ),
  'record_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name',policyname,'command',cmd,'roles',roles,
      'using',qual,'with_check',with_check
    ) order by policyname),'[]'::jsonb)
    from pg_policies where schemaname='public' and tablename='agrovision_records'
  ),
  'members_select_grant', has_table_privilege('authenticated','public.agrovision_members','SELECT'),
  'batch_rpc_exists', to_regprocedure('public.agrovision_records_apply_batch(text,jsonb,jsonb)') is not null,
  'member_rpc_exists', to_regprocedure('public.agrovision_is_project_member(text)') is not null,
  'validate_trigger_exists', exists (
    select 1 from pg_trigger where tgname='agrovision_validate_record_payload' and not tgisinternal
  ),
  'updated_at_trigger_exists', exists (
    select 1 from pg_trigger where tgname='agrovision_updated_at' and not tgisinternal
  )
) as preflight;

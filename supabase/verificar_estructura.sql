-- SOLO LECTURA. Puedes ejecutar todo este archivo en SQL Editor.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'agrovision_records'
order by ordinal_position;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'agrovision_records';

select trigger_name, action_timing, event_manipulation
from information_schema.triggers
where event_object_schema = 'public' and event_object_table = 'agrovision_records';


-- Membresías por proyecto y usuario.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'agrovision_members'
order by ordinal_position;

-- La comparativa requiere created_at y updated_at para ordenar mediciones.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'agrovision_records'
  and column_name in ('created_at', 'updated_at')
order by column_name;

-- Revisa todas las políticas RLS de registros. Las políticas permisivas se combinan con OR.
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'agrovision_records'
order by policyname;

-- Verifica funciones de autorización y escritura por lote.
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'agrovision_is_project_member',
    'agrovision_records_apply_batch',
    'agrovision_comparison_preview',
    'agrovision_comparison_publish',
    'agrovision_comparison_published'
  )
order by p.proname;


-- Solo lectura: clave primaria e índices de membresías.
select
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.agrovision_members'::regclass
order by c.contype, c.conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'agrovision_members'
order by indexname;

-- Solo lectura: triggers activos en observaciones.
select trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'agrovision_records'
order by trigger_name, event_manipulation;

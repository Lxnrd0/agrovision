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

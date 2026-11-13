# Guía de migración Supabase — 1.2.1

## Antes de comenzar

- Exporta un respaldo de la base de datos.
- Conserva una copia de los objetos del bucket `agrovision-photos`.
- Confirma el proyecto Supabase y el esquema activo.
- Ejecuta primero en un proyecto de pruebas.
- No pegues claves `service_role`, contraseñas, correos reales ni UUID personales en el repositorio.

## Orden de ejecución

### Instalación nueva

1. Ejecutar `supabase/personal-account.sql`.
2. Ejecutar `supabase/hardening-1.2.1.sql`.
3. Ejecutar `supabase/comparativa-equipo.sql`.
4. Ejecutar `supabase/activar-admin-comparativa.sql` tras reemplazar localmente el correo de ejemplo.
5. Ejecutar `supabase/registrar-integrante.sql` por cada cuenta que deba acceder al proyecto.

### Base existente

1. Ejecutar `supabase/verificar_estructura.sql` y revisar el resultado.
2. Si falta `updated_at`, evaluar `supabase/actualizar_base_existente.sql` y ejecutarlo únicamente si el esquema coincide.
3. Ejecutar `supabase/hardening-1.2.1.sql`.
4. Ejecutar `supabase/comparativa-equipo.sql`.
5. Activar el administrador con `supabase/activar-admin-comparativa.sql`.
6. Registrar explícitamente a cada integrante autorizado con `supabase/registrar-integrante.sql`.

## Qué hace `hardening-1.2.1.sql`

- Crea `agrovision_members` si no existe, con clave compuesta `project_id + user_id`.
- Detecta membresías duplicadas y aborta sin eliminarlas.
- Verifica columnas mínimas de `agrovision_records`.
- Instala un trigger de validación para medidas, fechas, duplicados por planta/fecha y cambios de tratamiento.
- Instala `agrovision_records_apply_batch`, una RPC `SECURITY INVOKER` que realiza altas, ediciones y eliminaciones en una sola transacción y respeta RLS.
- No elimina registros, usuarios, publicaciones ni fotografías.

## Verificación posterior

```sql
select project_id, user_id, member_name, joined_at
from public.agrovision_members
order by project_id, joined_at;

select count(*) as records_count
from public.agrovision_records;

select proname
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public'
  and proname = 'agrovision_records_apply_batch';
```

Prueba con dos cuentas distintas:

1. Cuenta A crea una observación y solo puede leer/editar sus propios registros.
2. Cuenta B no puede leer ni modificar la observación de A.
3. El administrador registra al integrante mediante `registrar-integrante.sql` antes de que esa cuenta escriba.
4. Una cuenta autorizada publica el resumen agregado.
5. Un integrante solo puede consultar la publicación autorizada.
6. Una operación por lote con un `updated_at` obsoleto debe fallar y revertir el lote completo.

## Importante

La función batch del código 1.2.1 requiere que `hardening-1.2.1.sql` esté aplicado. No despliegues el nuevo código en producción antes de aplicar y probar la migración. Si el script se detiene por membresías duplicadas o políticas RLS adicionales, no borres filas ni políticas automáticamente: inspecciona cuáles corresponden a pruebas antiguas y decide manualmente qué conservar.

# Guía de migración Supabase — AgroVisión 1.2.1 (revisión de compatibilidad)

## Estado y advertencia

Esta guía corresponde al paquete corregido para la rama `hardening/agrovision-1.2.1`.

**No ejecutes los SQL directamente en producción como primer paso.** El Preview de Vercel usa el Supabase de producción, por lo que las acciones de escritura desde la interfaz también afectarían los datos reales. Las migraciones deben probarse primero en un proyecto Supabase separado.

## Protección previa

1. Exporta un respaldo de la base de datos y conserva una copia de los objetos del bucket `agrovision-photos`.
2. Ejecuta `supabase/preflight-hardening-1.2.1.sql` en el proyecto que se va a migrar. Es una consulta de solo lectura.
3. Confirma que `project_id` sea `rabanitos-2026` para las dos membresías existentes.
4. Confirma que ambas cuentas ya figuren en `agrovision_members`. No vuelvas a registrarlas.
5. No compartas claves `service_role`, contraseñas, correos reales ni UUID personales.

## Orden recomendado para una base existente

1. Crear un proyecto Supabase de pruebas y reproducir allí el esquema y los datos anonimizados necesarios.
2. Ejecutar `supabase/preflight-hardening-1.2.1.sql`.
3. Revisar el resultado de la preflight y confirmar que no haya políticas RLS desconocidas ni claves foráneas que dependan de la PK antigua de membresías.
4. Ejecutar `supabase/hardening-1.2.1.sql` en la base de pruebas.
5. Ejecutar nuevamente la preflight y `supabase/verificar_estructura.sql`.
6. Probar lectura, inserción, edición y eliminación con dos cuentas de prueba distintas.
7. Probar publicación y consulta de la comparativa con una cuenta administradora y una integrante.
8. Solo después de aprobar las pruebas y obtener un respaldo reciente, planificar una ventana de migración de producción.

## Qué corrige `hardening-1.2.1.sql`

- Conserva las filas de `agrovision_members` y convierte la clave primaria antigua `user_id` en la clave compuesta `(project_id, user_id)`, siempre que no existan claves foráneas dependientes. Si las encuentra, aborta sin cambios.
- Completa `member_name` y `joined_at` sin reemplazar los nombres ya existentes.
- Mantiene el acceso directo a `agrovision_members` revocado para `anon` y `authenticated`; la comprobación de pertenencia se realiza mediante una función `SECURITY DEFINER` con `auth.uid()`.
- Sustituye únicamente las cuatro políticas legacy conocidas de `agrovision_records`. Si encuentra políticas adicionales no reconocidas, aborta y revierte la transacción.
- Evita duplicar el trigger de `updated_at`, reconociendo los dos nombres históricos usados por el proyecto.
- Añade validaciones de payload, medidas, fechas, duplicados por planta/fecha y consistencia de tratamiento.
- Instala `agrovision_records_apply_batch`, una RPC `SECURITY INVOKER` transaccional con control optimista mediante `updated_at` y autorización de membresía por proyecto.
- Desactiva el trigger de alta automática de membresías, pero conserva la función histórica sin asociarla a un trigger.
- No elimina observaciones, fotografías, usuarios, publicaciones ni membresías.

## Alta de un integrante nuevo

`supabase/registrar-integrante.sql` es únicamente para una cuenta nueva que aún no pertenezca al proyecto. Debe ejecutarse después de la migración, sustituyendo localmente el correo de ejemplo. Usa `ON CONFLICT DO NOTHING` para no sobrescribir el nombre ni la fecha de ingreso de un miembro existente.

**Para el proyecto actual, las dos cuentas ya registradas no necesitan este script. No lo ejecutes para ellas.**

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
  and proname in (
    'agrovision_is_project_member',
    'agrovision_records_apply_batch'
  );
```

Pruebas funcionales, en una base de pruebas:

1. Cuenta A solo puede leer y modificar sus observaciones.
2. Cuenta B no puede leer ni modificar observaciones de A.
3. Un usuario no miembro no puede leer ni escribir registros del proyecto.
4. La cuenta administradora puede generar y publicar el resumen agregado.
5. La cuenta integrante puede consultar la publicación, pero no publicarla.
6. Un `updated_at` obsoleto provoca conflicto y revierte todo el lote.
7. Las fotografías privadas continúan accesibles únicamente al propietario.

## Reversión

La migración está dentro de una transacción y aborta ante las condiciones de preflight descritas. Sin embargo, no debe asumirse que revertir el código revierte automáticamente una migración ya confirmada. Conserva el respaldo previo y prepara una migración de reversión específica si se aprueba el despliegue.

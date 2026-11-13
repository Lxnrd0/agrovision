# Guía de migración Supabase — AgroVisión 1.2.1

## Estado y precauciones

- La rama `hardening/agrovision-1.2.1` se valida independientemente de `main`.
- No ejecutar migraciones contra producción hasta probarlas en un proyecto Supabase separado.
- Hacer respaldo de la base y del bucket `agrovision-photos` antes de cualquier migración real.
- Nunca incluir claves `service_role`, contraseñas, correos reales ni UUID personales en Git.
- El archivo `preflight-hardening-1.2.1.sql` es exclusivamente de lectura.

## Orden seguro

1. Ejecutar `supabase/preflight-hardening-1.2.1.sql` y guardar su resultado.
2. Confirmar que el esquema y las políticas coinciden con la instalación esperada.
3. Probar `supabase/hardening-1.2.1.sql` en una base de pruebas con una copia anonimizada del esquema.
4. Probar altas, ediciones, eliminaciones, concurrencia, permisos de ambas cuentas y publicación.
5. Solo después de aprobación explícita, planificar la migración de producción con respaldo verificado.

## Compatibilidad incluida

- Conserva la clave primaria existente de `agrovision_members`.
- Comprueba si ya existe un índice único por `(project_id, user_id)` antes de crear otro.
- Acepta las cuatro políticas CRUD seguras existentes (`agrovision_records_select/insert/update/delete`) y las valida sin borrarlas.
- Para instalaciones sin políticas, crea las cuatro políticas CRUD restrictivas.
- Rechaza configuraciones parciales o no reconocidas en vez de borrar políticas automáticamente.
- Mantiene revocado el acceso directo de `authenticated` a `agrovision_members`; la aplicación usa funciones autorizadas para consultar membresías.
- No elimina observaciones, integrantes, usuarios, publicaciones ni fotografías.

## Verificación

Ejecutar el preflight antes y después de la migración en el entorno de pruebas y comparar:
- Conteo de membresías y observaciones.
- Clave primaria e índices únicos.
- Políticas RLS y expresiones.
- Triggers y funciones RPC.
- Permisos de lectura directa de membresías.

No considerar una migración aprobada solo porque el SQL termina en `Success`: deben pasar las pruebas funcionales y de aislamiento con dos cuentas.

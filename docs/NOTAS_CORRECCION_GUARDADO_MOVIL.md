# Corrección del guardado móvil y la bitácora

## Alcance

Corrección aplicada sobre el repositorio recibido, manteniendo la integración existente con Supabase. No se ejecutaron migraciones ni se modificó ninguna base de datos.

## Fallos corregidos

1. **Conversión de fotografía en Safari/iOS.** El flujo anterior hacía `fetch(data:image/...)` para convertir la fotografía comprimida en `Blob`. Algunos navegadores móviles pueden rechazar esa petición con el error genérico `Load failed`. Ahora la cadena Base64 se decodifica localmente y se envía el `Blob` directamente a Supabase Storage.
2. **Falso error después de guardar.** Después de que la RPC confirmaba el guardado, la aplicación volvía a consultar todas las observaciones y generar enlaces firmados. Si esa lectura posterior fallaba, el formulario mostraba error aunque la escritura ya estuviera confirmada. Ahora la respuesta exitosa de la RPC es el límite de confirmación y la interfaz recibe el estado que acaba de guardar; la actualización normal de la bitácora vuelve a sincronizar los enlaces y los cambios concurrentes.
3. **Reintentos sin duplicados.** El formulario conserva el mismo ID durante los reintentos mientras siga abierto. La fotografía usa una ruta estable por usuario y observación con `x-upsert`, evitando crear un archivo distinto en cada reintento.
4. **Fallo temporal al firmar una fotografía.** Un error de Storage al generar un enlace temporal ya no bloquea la carga de toda la bitácora. Se conserva la referencia privada y se vuelve a intentar en la siguiente actualización; la interfaz muestra un aviso en lugar de intentar abrir el identificador interno como URL.
5. **Tarjeta móvil.** La fotografía de cada tarjeta tiene un marco de altura fija, recorte controlado y capas separadas para la etiqueta y el botón. Se incrementó la versión de caché del service worker para que los dispositivos móviles descarguen los recursos nuevos.
6. **CI.** GitHub Actions se ejecuta también en ramas `hardening/**` y `fix/**`, sin necesidad de fusionar a `main`.
7. **Pruebas estáticas SQL.** Se corrigió un test antiguo que esperaba un esquema RLS diferente al de la migración que realmente contiene el repositorio.

## Supabase y Vercel

- Se mantienen `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_AGROVISION_PROJECT_ID`.
- La aplicación continúa usando la clave pública `anon`; no se introduce `service_role` en el navegador.
- No se cambió `supabase/hardening-1.2.1.sql`, no se ejecutó SQL y no se alteraron usuarios, membresías, registros, políticas ni Storage.
- Para el despliegue, Vercel debe conservar las variables anteriores en el entorno Preview/Production correspondiente. El ZIP no contiene `.env.local` ni credenciales.

## Verificación realizada en este entorno

- 9 pruebas estáticas del archivo `tests/sql-migration.test.mjs`: aprobadas.
- Transpilación/sintaxis TypeScript de los archivos modificados: sin errores de sintaxis.
- Integridad del ZIP: se verificará al empaquetar.

## Verificación pendiente en CI/Preview

No se pudo completar `npm ci` en este entorno porque la descarga de dependencias agotó el tiempo disponible. Por tanto, no se declara aprobado el typecheck, la suite completa de pruebas ni el build Next.js. El workflow CI queda habilitado para la rama de corrección con Node 24.

Antes de producción, verificar en Preview:

1. Iniciar sesión con las dos cuentas.
2. Guardar una observación sin fotografía.
3. Guardar una observación con fotografía desde Safari/iPhone.
4. Recargar y comprobar que el registro y la fotografía siguen presentes.
5. Repetir un guardado después de simular una pérdida de conexión; confirmar que no aparece un duplicado.
6. Confirmar que la tarjeta muestra la fotografía en un marco fijo y que los textos están debajo.
7. Confirmar edición, eliminación, comparación y publicación con una observación de prueba no sensible.

No volver a ejecutar la migración SQL en producción como parte de esta corrección.

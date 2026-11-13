# Estado QA — AgroVisión 1.2.1

## Cambios preparados
- CI ejecutable en pushes a `hardening/**`, además de `main` y pull requests hacia `main`.
- Migración SQL adaptada para preservar políticas CRUD seguras existentes y la clave primaria actual.
- Preflight SQL de solo lectura.
- Pruebas estáticas de compatibilidad de migración.

## Pendiente de ejecución
- `npm ci --include=dev` y `npm run verify` en Node.js 24 (GitHub Actions).
- Prueba de migración en Supabase independiente.
- Pruebas de escritura, concurrencia y aislamiento con dos cuentas de prueba.
- Verificación de Preview tras el nuevo commit.

No declarar la versión lista para producción hasta completar todos los puntos pendientes.


## Hotfix de guardado móvil y bitácora

- Decodificación local de fotografías `data:` antes de subir a Supabase Storage.
- Sin lectura remota adicional después de que la RPC confirma el guardado.
- ID de observación y ruta de fotografía estables durante reintentos.
- Fallo al firmar una fotografía aislado para no bloquear toda la bitácora.
- Marco de fotografía móvil con altura controlada y caché del service worker renovada.
- Pruebas estáticas: 9 aprobadas.
- Pendiente: `npm ci`, typecheck, suite completa y build con Node 24 en GitHub Actions.
- No se ejecutaron ni modificaron migraciones de Supabase.

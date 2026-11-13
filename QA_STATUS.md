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

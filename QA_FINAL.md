# QA — AgroVisión / TerraNova 1.2.1 (estado de preparación)

## Cambios de esta corrección

- CI ahora se ejecuta en `push` a `hardening/**`, en `main`, y en pull requests hacia `main`; incluye ejecución manual.
- Migración de Supabase adaptada para conservar la clave primaria existente y reconocer las cuatro políticas CRUD seguras observadas en la base del proyecto.
- La migración no crea una política `ALL` adicional sobre las cuatro políticas CRUD, evitando que políticas permisivas se combinen mediante `OR`.
- El índice único por `(project_id, user_id)` solo se crea cuando no existe ya una clave o índice único equivalente.
- Se conserva el acceso directo revocado a `agrovision_members`; la aplicación utiliza las funciones RPC autorizadas.
- Se agregó `supabase/preflight-hardening-1.2.1.sql`, estrictamente de solo lectura.
- Se agregaron pruebas estáticas de compatibilidad de migración.

## Verificaciones ejecutadas en este entorno

| Verificación | Resultado |
|---|---|
| Pruebas estáticas de migración | 5/5 aprobadas con Node 22 |
| Revisión del ZIP | Estructura extraída correctamente |
| Revisión de CI | Incluye `hardening/**` y Node 24 |

## Verificaciones pendientes

El proyecto requiere Node 24.x. Este entorno dispone de Node 22.16.0; `npm ci --include=dev` agotó el tiempo disponible. Por tanto, no se declara ejecutada la suite completa, TypeScript ni el build.

Pendiente en GitHub Actions (Node 24):

```bash
npm ci --include=dev
npm run typecheck
npm test
npm run build
```

Pendiente en Supabase de pruebas:

- Ejecutar preflight y conservar el resultado.
- Aplicar la migración en una instancia independiente con una copia de esquema/datos anonimizados.
- Probar altas, ediciones, eliminaciones, concurrencia y aislamiento entre dos cuentas.
- Probar Storage, comparación y publicación.

No integrar a `main` ni ejecutar esta migración en producción hasta completar los puntos pendientes.

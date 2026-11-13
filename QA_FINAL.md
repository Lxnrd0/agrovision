# QA final — AgroVisión / TerraNova 1.2.1

## Cambios incluidos

- JWT de Supabase validado en servidor para el endpoint IA.
- Modo local explícito compatible con Supabase configurado mediante `X-Analysis-Mode: local` y `ANALYSIS_ACCESS_TOKEN`.
- Token local obligatorio de al menos 32 caracteres cuando Supabase no está configurado.
- Rate limit por identidad, con integración opcional Upstash Redis y fallback por instancia.
- Cabeceras HTTP de seguridad y Content Security Policy.
- Membresías explícitas por proyecto/usuario y RLS que bloquea cuentas no inscritas.
- Validaciones SQL de medidas, fechas, duplicados por planta/fecha y consistencia de tratamiento.
- RPC transaccional para altas, ediciones y eliminaciones con control de concurrencia.
- Cálculo de crecimiento restringido al mismo tratamiento.
- Caché de URLs firmadas por usuario y límite de concurrencia.
- Bitácora móvil compacta y uniforme con escritorio; detalle completo en vista expandida.

## Correcciones de compatibilidad posteriores a la revisión de Supabase

- La migración sustituye las cuatro políticas RLS legacy conocidas y aborta si quedan políticas no reconocidas.
- La clave primaria de membresías se migra a `(project_id, user_id)` únicamente si no hay claves foráneas dependientes.
- Se elimina el riesgo de trigger duplicado para `updated_at`.
- Se conserva la función trigger de auto-registro histórica, pero se desactiva el trigger; las membresías pasan a ser explícitas.
- El alta manual de integrante no sobrescribe datos si la membresía ya existe.
- Se añadió una consulta preflight de solo lectura, una prueba para el modo local con Supabase configurado y pruebas estáticas del SQL.

## Verificaciones realizadas

| Verificación | Resultado |
|---|---|
| Parser TypeScript/TSX | 35 archivos procesados; 0 errores sintácticos |
| `node --check` | Correcto en `next.config.mjs`, `scripts/build-site.mjs` y `public/sw.js` |
| JSON | `package.json`, `package-lock.json`, `tsconfig.json` y `vercel.json` parseables |
| Revisión de referencias | Revisados archivos modificados y rutas principales |
| Pruebas estáticas de migración SQL | 6/6 correctas ejecutadas con Node test runner sobre el archivo de prueba convertido temporalmente a `.mjs` |
| Revisión de compatibilidad SQL | Corregida estáticamente; falta ejecutar en Supabase de pruebas |

## Verificaciones no completadas

El entorno de preparación dispone de Node.js 22.16.0, mientras que el repositorio requiere Node 24.x. `npm ci --include=dev` agotó el tiempo disponible y no instaló las dependencias.

Se intentó `npm test`, pero no pudo iniciar porque falta el paquete `tsx` (`ERR_MODULE_NOT_FOUND`). El `tsc --noEmit` global tampoco pudo completarse por falta de tipos instalados (`@types/node`, `@types/react`, etc.). No se ejecutó `npm run build`.

Tampoco se ejecutó SQL en la instancia Supabase real del propietario, no se probaron credenciales reales de Supabase/IA y no se realizó prueba visual/E2E en navegador.

## Comando obligatorio antes de integrar

```bash
node --version
npm ci
npm run verify
```

El comando debe ejecutarse con Node 24.x. Después, aplicar las migraciones en Supabase de pruebas y validar dos cuentas, Storage, comparación, publicación y bitácora móvil. No integrar a `main` ni desplegar si alguna verificación falla.

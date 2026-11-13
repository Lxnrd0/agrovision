# Verificación de Vercel — AgroVisión / TerraNova 1.2.1

## Estado

**No se realizó ningún despliegue desde esta preparación.** El proyecto Vercel del propietario no fue modificado y no se utilizaron credenciales de producción.

## Variables que deben configurarse en Vercel

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` o `OPENAI_API_KEY` | Proveedor de análisis IA |
| `GEMINI_MODEL` / `OPENAI_MODEL` | Modelo seleccionado |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública anon/publishable |
| `NEXT_PUBLIC_AGROVISION_PROJECT_ID` | Identificador del proyecto |
| `ANALYSIS_ACCESS_TOKEN` | Solo para modo local sin Supabase; secreto aleatorio de 32+ caracteres |
| `UPSTASH_REDIS_REST_URL` | Recomendado para rate limit distribuido |
| `UPSTASH_REDIS_REST_TOKEN` | Secreto de Upstash, nunca público |

No configures `service_role` ni claves privadas con prefijo `NEXT_PUBLIC_`.

## Procedimiento de Preview

1. Ejecutar las migraciones SQL en Supabase de pruebas siguiendo `docs/GUIA_MIGRACION_SUPABASE_1.2.1.md`.
2. Registrar explícitamente al administrador y a cada integrante autorizado.
3. Crear una rama `hardening/agrovision-1.2.1` y subir el repositorio.
4. Configurar variables de Preview en Vercel.
5. Confirmar Node.js 24.x.
6. Ejecutar `npm ci` y `npm run verify`.
7. Revisar logs del endpoint de IA sin exponer tokens.
8. Probar login, logout, recuperación, análisis IA, bitácora, edición, eliminación, fotos, respaldo, comparación y publicación.
9. Probar con cuenta no inscrita: no debe poder leer ni escribir en el proyecto.
10. Probar con dos cuentas autorizadas: el administrador ve vista previa y publica; el integrante solo ve la última publicación agregada.
11. Revisar bitácora en 360, 390, 430, 768 y 1366 px.
12. Solo después de aprobar, integrar a `main` y promover a producción.

## Criterio de rollback

Si falla el Preview, no integrar a `main`. Si falla producción después de una liberación, revertir el commit y conservar el respaldo SQL/Storage anterior. No ejecutar `DROP` ni borrar datos como mecanismo de rollback automático.

## Verificación en esta preparación

Se validó sintaxis de 33 archivos TypeScript/TSX, `node --check` de los archivos JS/MJS y parseo de JSON. No se completó `npm ci` por timeout, por lo que `npm test`, typecheck y build quedan pendientes de Node 24 con dependencias instaladas.

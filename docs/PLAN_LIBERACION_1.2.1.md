# Plan de liberación — AgroVisión 1.2.1

## Objetivo

Liberar la versión corregida sin afectar la instancia actual ni los registros existentes.

## Secuencia

1. Crear rama `hardening/agrovision-1.2.1`.
2. Instalar con Node 24: `npm ci`.
3. Ejecutar `npm run verify`.
4. Aplicar las migraciones SQL en Supabase de pruebas.
5. Configurar las variables de entorno en un entorno Preview.
6. Probar dos cuentas: administrador e integrante.
7. Probar login, cierre de sesión, recuperación de contraseña y análisis IA.
8. Probar altas, ediciones, eliminaciones, importación de respaldo y fotografías.
9. Probar comparación, empate, muestra insuficiente y publicación agregada.
10. Probar bitácora en 360, 390, 430, 768 y 1366 píxeles.
11. Aprobar Pull Request y desplegar a producción solo con QA aprobado.

## Variables necesarias

- `GEMINI_API_KEY` o `OPENAI_API_KEY`.
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` para modo nube.
- `ANALYSIS_ACCESS_TOKEN` de al menos 32 caracteres para modo local.
- `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` recomendados para limitación distribuida.

## Reversión

- Revertir commits si falla el despliegue.
- Mantener respaldos SQL y Storage previos.
- No ejecutar scripts de borrado como parte de esta liberación.
- No deshacer migraciones con `DROP` automático; preparar una reversión específica si se requiere.

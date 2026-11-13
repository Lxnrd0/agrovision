# Estado de QA — AgroVisión / TerraNova 1.2.1

Fecha de preparación: 12/11/2026.

| Comprobación | Estado | Observación |
|---|---|---|
| Revisión estática del código fuente | Realizada | Autenticación, sincronización, SQL, métricas y bitácora revisados. |
| Parser TypeScript/TSX | Correcto | 35 archivos procesados; 0 errores sintácticos. |
| `node --check` | Correcto | `next.config.mjs`, `scripts/build-site.mjs` y `public/sw.js`. |
| Parseo JSON | Correcto | package, lockfile, tsconfig y Vercel. |
| Pruebas de autenticación y caché | Añadidas | Incluidas en los tests; ejecución pendiente. |
| Compatibilidad de migración Supabase | Corregida estáticamente | Reemplaza políticas legacy conocidas y migra PK con comprobación de dependencias. |
| Preflight SQL | Añadido | Solo lectura; revisa membresías, PK, políticas y triggers. |
| `npm ci --include=dev` | No completado | Agotó el tiempo disponible en este entorno. |
| `npm test` | No completado | Falta `tsx` porque no se completó la instalación. |
| Typecheck completo | No completado | Faltan dependencias y tipos instalados. |
| Build Next.js | Pendiente | Requiere Node 24 y dependencias instaladas. |
| Migración Supabase | No ejecutada | Debe probarse primero en instancia de pruebas. |
| RLS, Storage y JWT reales | Pendiente | Requiere credenciales del propietario. |
| Preview de Vercel | Pendiente | No se desplegó desde esta sesión. |
| Prueba visual en móvil | Pendiente | Revisar 360, 390 y 430 px. |

## Bloqueo de verificación

El entorno de preparación tiene Node 22.16.0 y el repositorio requiere Node 24.x. `npm ci --include=dev` agotó el tiempo y no instaló dependencias; `npm test` falló al no encontrar `tsx`. No se afirma que la suite completa, el typecheck o el build hayan pasado.

## Criterio de liberación

Solo integrar a `main` cuando `npm run verify` termine correctamente, las migraciones se hayan probado con datos no productivos y se complete el recorrido funcional con una cuenta administradora y otra integrante autorizada explícitamente.

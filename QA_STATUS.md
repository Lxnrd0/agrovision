# AgroVisión 1.1.2 — Estado de QA

Fecha: 10/11/2026

## Resultado de esta preparación

| Comprobación | Estado | Evidencia |
|---|---|---|
| Inspección del ZIP de GitHub | Hecha | Se revisó el árbol completo del proyecto fuente. |
| Parseo sintáctico TypeScript/TSX | Correcto | 31 archivos procesados; 0 errores sintácticos. |
| Atributos JSX duplicados | Correcto | 0 duplicados detectados en los 31 archivos. |
| Sintaxis de `next.config.mjs` y `scripts/build-site.mjs` | Correcta | `node --check`. |
| JSON de package, lockfile, tsconfig y Vercel | Correcto | Los cuatro documentos se pudieron parsear. |
| Suite automatizada | Pendiente | Hay 54 pruebas definidas; no se pudieron ejecutar en este entorno. |
| TypeScript semántico (`npm run typecheck`) | Pendiente | Requiere dependencias instaladas y Node 24. |
| Build Next.js (`npm run build`) | Pendiente | Requiere dependencias instaladas y Node 24. |
| npm audit | Pendiente | Requiere acceso al registro de npm. |
| Supabase real, Gemini y OpenAI | Pendiente | Requiere credenciales y servicios del propietario. |
| Pruebas visuales/E2E | Pendiente | Requiere navegador y entorno de ejecución. |

## Por qué no se certificó la suite en esta sesión

El proyecto fija Node.js `24.x`, pero el entorno de preparación dispone de Node `22.16.0`. Además, el entorno no pudo resolver `registry.npmjs.org`; `npm ci` agotó el tiempo y no instaló las dependencias. No se afirma que `npm test`, `npm run typecheck` o `npm run build` hayan pasado.

## Verificación obligatoria antes de integrar

En una máquina con Node 24.x y acceso al registro npm, desde la raíz del proyecto:

```bash
npm ci
npm run verify
```

`npm run verify` ejecuta TypeScript, las 54 pruebas y el build de producción. No integrar el cambio si cualquiera falla. Después, comprobar el login y el endpoint de análisis con un proyecto Supabase de prueba, además de una clave de proveedor IA válida. No usar claves reales en los tests automatizados ni subir `.env.local`.

## Cambios principales de 1.1.2

- `/api/analyze-crop` exige sesión Supabase validada en servidor o token compartido aleatorio de 32+ caracteres.
- El límite de análisis se aplica antes de leer el cuerpo y usa el usuario verificado o una IP de proxy; `X-Client-ID` ya no se usa como identidad.
- Se valida Base64 y firma binaria JPEG/PNG/WEBP.
- El Dashboard envía el access token Supabase automáticamente cuando está en modo nube.
- La renovación de sesión comparte una petición por pestaña, no borra la sesión ante errores temporales y no puede resucitar una sesión cerrada.
- Se añadieron pruebas para autenticación, rate limit por usuario y renovación de sesión.
- Se agregaron cabeceras de seguridad HTTP básicas.

## Limitaciones que siguen explícitas

- El rate limit permanece en memoria por instancia; para producción con tráfico significativo se necesita un límite distribuido.
- La sesión Supabase continúa en `localStorage`; una XSS en el mismo origen podría leerla. Una migración a cookies HttpOnly requiere arquitectura SSR y pruebas adicionales.
- Las escrituras/restauraciones múltiples en Supabase no son una única transacción; un fallo intermedio puede dejar progreso parcial.
- No se verificaron RLS, Storage, correo de recuperación ni llamadas facturables con servicios reales.
- La precisión agronómica de las salidas de IA no está validada científicamente.

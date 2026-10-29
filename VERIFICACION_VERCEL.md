# AgroVision 1.1.1 — comprobaciones del paquete para Vercel

Fecha: 28/10/2026. Este documento actualiza el informe de auditoría anterior.

## Resultado comprobado

- Copia nueva del proyecto sin node_modules, .next ni .env.local antes de instalar.
- `npm ci --include=dev --no-audit --no-fund`: correcto. npm usa el lockfile incluido.
- `npm run typecheck` (`next typegen && tsc --noEmit`): correcto.
- 145 importaciones internas con nombre comprobadas con la API del compilador TypeScript: ninguna exportación ausente.
- `npm test`: 43 pruebas aprobadas, cero fallidas y cero omitidas.
- `npm run build`: correcto en modo local y con configuración pública de nube de prueba.
- Build adicional con VERCEL=1 y VERCEL_ENV=production establecidos localmente: correcto (no equivale a desplegar en la cuenta Vercel).
- El build de prueba de nube usó https://example.invalid y un marcador público únicamente para activar la rama de configuración. No son credenciales utilizables, no se incluyen como valores recomendados y no se hicieron llamadas a Supabase.
- HTTP de producción local: página 200; ocho recursos iniciales JS/CSS 200; recursos públicos y service worker 200; GET de API sin motor 200; POST sin motor 503 explícito y sin datos simulados.
- HTTP de producción con build de nube: página 200 y pantalla inicial de cuenta renderizada; sin peticiones reales de autenticación.
- `npm audit`: cero vulnerabilidades conocidas reportadas.
- Los tres SQL se analizaron con el parser PostgreSQL pglast; SQL y cuerpos PL/pgSQL válidos sintácticamente. No se ejecutaron sobre una base de datos real.
- Entorno comprobado: Linux, Node 24.22.1 y npm 11.9.0. Node fijado a 24.x; versiones directas exactas y lockfile coherente.

## Ajustes específicos de esta entrega

1. vercel.json fija framework Next.js, instalación `npm ci --include=dev` y build `npm run build`. La generación normal de Next usa su directorio de salida automático. No usar build:site ni output export para el despliegue Vercel.
2. El archivo lib/storage.ts incluye una sola definición de initialiseRecords, además de mergeRecords y restoreRecords. Se debe reemplazar entero: no conservar la función añadida manualmente al final.
3. Todos los imports de dashboard, auth-gate, backup-controls y los demás componentes coinciden con los exports y tipos de los módulos entregados.
4. lib/limits.ts unifica el máximo de imagen (4.000.000 caracteres de data URL) y JSON (4.200.000 bytes), inferiores al límite de 4,5 MB de funciones Vercel. El cliente comprueba el JSON y reduce calidad JPEG antes del envío; el servidor valida los mismos límites.
5. El comando typecheck genera primero los tipos de Next, para no depender de restos de un build anterior.
6. La paginación de Supabase ya admite una página de servidor menor que 500 filas. Se continúa con la cantidad realmente recibida y se detectan IDs repetidos para evitar un bucle si la lectura cambia.
7. Los tiempos de espera de fetch de nube utilizan AbortController sin depender del soporte de AbortSignal.timeout del navegador.
8. Se incluye una migración aditiva para la base existente: no cambia RLS ni buckets, no borra registros o usuarios y comprueba la estructura antes de cambiar updated_at.
9. GitHub Actions se alinea con Node 24, la versión configurada para Vercel.

## Alcance de la revisión

Se revisaron los módulos completos que participan en la compilación y las rutas funcionales previamente auditadas. Parser, tipos e importaciones comprueban estáticamente todos los archivos incluidos por tsconfig. Las pruebas cubren las regresiones documentadas, no cada interacción posible ni cada valor que un usuario pueda introducir.

Este paquete compila sin errores en el entorno indicado. No se ha desplegado desde esta sesión en la cuenta Vercel del usuario, y no se ha leído el estado actual de su repositorio. No puede garantizarse el despliegue si se mezclan archivos antiguos, cambia el directorio raíz o se usa una configuración externa diferente.

No hay prueba visual de escritorio/móvil: Chromium no estuvo disponible en esta sesión. No hay llamadas reales a Gemini/OpenAI ni Supabase. La verificación de modelos, cuota, acceso de usuarios, RLS, correo y bucket exige los servicios configurados por el usuario.

Persisten los límites de la auditoría original: restauraciones múltiples en nube no son una transacción única; altas simultáneas con distintos IDs para la misma planta/fecha necesitan una restricción de servidor; la API de IA tiene un token opcional separado del login; el modo nube no tiene cola offline; la precisión agronómica no está validada. No se sustituyó ninguna integración real con simulaciones.

## Fuentes oficiales consultadas para la configuración

- Vercel: Node 24.x: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Vercel: build y directorio raíz: https://vercel.com/docs/builds/configure-a-build
- Vercel: máximo de cuerpo de función: https://vercel.com/docs/errors/function_payload_too_large
- Next: variables públicas fijadas durante el build: https://nextjs.org/docs/pages/guides/environment-variables
- GitHub: editor de varios archivos: https://docs.github.com/en/codespaces/the-githubdev-web-based-editor

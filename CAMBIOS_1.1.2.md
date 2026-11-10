# Cambios AgroVisión 1.1.2

Paquete preparado desde el ZIP que el usuario identificó como la versión actual de GitHub.

## Archivos modificados

- `lib/analysis-server.ts`: autenticación obligatoria con Supabase Auth o token aleatorio de 32+ caracteres; comparación de token en tiempo constante; limitación antes de procesar imágenes; identidad de límite por usuario Supabase o IP de proxy; límite de memoria del contador; validación estricta de Base64 y firma binaria JPEG/PNG/WEBP; manejo explícito de configuración y errores de Auth.
- `app/api/analyze-crop/route.ts`: pasa al motor la URL y clave pública de Supabase para verificar el access token en servidor.
- `components/dashboard.tsx`: obtiene automáticamente el access token Supabase en modo nube; deja de usar `X-Client-ID` como cabecera de seguridad; admite modo local explícito.
- `components/auth-gate.tsx`: marca explícitamente el Dashboard de uso local.
- `lib/cloud.ts`: renovación de sesión single-flight; no borra sesión ante errores temporales; no pisa una sesión más nueva ni revive una sesión cerrada durante la renovación.
- `tests/analysis.test.ts`: pruebas de configuración cerrada, token corto, autenticación Supabase, modo token local con Supabase, rate limit por usuario, sesión inválida y caída de Auth.
- `tests/cloud.test.ts`: pruebas de renovación simultánea, error temporal, refresh token inválido y cierre de sesión durante una renovación.
- `next.config.mjs`: cabeceras HTTP de seguridad básicas.
- `.env.example`, `README.md`, `LEEME_PRIMERO.txt`: instrucciones de configuración actualizadas.
- `package.json`, `package-lock.json`: versión del paquete `1.1.2`.
- `INFORME_AUDITORIA.md`, `VERIFICACION_VERCEL.md`, `QA_STATUS.md`: registro de cambios, límites y estado real de QA.

## Configuración de autenticación de IA

- Modo nube: configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; el navegador envía el access token de la sesión y el servidor lo valida contra `/auth/v1/user`.
- Modo local sin Supabase: configurar `ANALYSIS_ACCESS_TOKEN` con al menos 32 caracteres aleatorios y escribir el mismo valor en el panel.
- Modo mixto: se puede mantener Supabase y un token compartido para uso local; la interfaz de nube no solicita el token compartido.
- Nunca configurar `service_role` en el navegador ni subir `.env.local`.

## Estado

Este paquete contiene 54 pruebas automatizadas definidas. No se pudieron ejecutar en el entorno de preparación: Node disponible 22.16.0 frente a Node 24.x requerido, y falta de resolución DNS hacia `registry.npmjs.org` durante `npm ci`. Consulta `QA_STATUS.md`. No se afirma que la suite, typecheck o build hayan pasado en esta preparación.

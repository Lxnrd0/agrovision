# AgroVisión / TerraNova 1.2.1

Bitácora de campo para registrar plantas, fotografías, observaciones y medidas; analizar imágenes con IA de forma orientativa; consultar crecimiento y comparar tratamientos. Esta entrega fortalece la autenticación del análisis, la integridad de Supabase, la sincronización y la experiencia de la bitácora en móvil.

## Objetivo de la versión 1.2.1

Corregir los riesgos técnicos identificados en la auditoría de 1.2.0 sin reconstruir la aplicación ni eliminar datos históricos. Se mantienen el diseño TerraNova, las cuentas existentes, las bitácoras, los respaldos, el análisis visual, la comparación individual y la publicación agregada del equipo.

## Requisitos e instalación

- Node.js 24.x.
- npm compatible con Node 24.

```bash
npm ci
npm run dev
```

Abrir http://localhost:3000. Si Supabase no está configurado, se puede continuar en modo local. El registro manual, la bitácora local y las exportaciones no requieren claves de IA.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa únicamente los servicios que utilices:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o

# Obligatorio para análisis IA en modo local (sin Supabase).
# Usa un secreto aleatorio de al menos 32 caracteres; no lo publiques ni lo compartas en el repositorio.
ANALYSIS_ACCESS_TOKEN=

# Supabase: URL y clave pública anon/publishable, nunca service_role.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_AGROVISION_PROJECT_ID=rabanitos-2026

# Recomendado en producción para rate limiting compartido entre instancias.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

No uses prefijo `NEXT_PUBLIC_` para claves privadas de proveedores, token local ni credenciales de Upstash.

## Autenticación del análisis IA

La ruta `/api/analyze-crop` exige autenticación antes de procesar el cuerpo o llamar a un proveedor:

- **Modo nube:** el navegador envía el access token de Supabase. El servidor lo verifica contra `/auth/v1/user` usando la URL y la clave pública del proyecto. Un JWT ausente, inválido o vencido se rechaza.
- **Modo local:** se exige `ANALYSIS_ACCESS_TOKEN` de al menos 32 caracteres. El cliente marca explícitamente el modo local con `X-Analysis-Mode: local`; esto también funciona si el proyecto tiene variables Supabase configuradas. El código se introduce en el panel y se mantiene solo en memoria del navegador.
- **Modo nube:** el cliente envía el access token de Supabase y el servidor lo verifica contra `/auth/v1/user`.
- Si el mecanismo de autenticación elegido no está configurado en el servidor, el endpoint responde `AUTH_NOT_CONFIGURED` y no llama a Gemini/OpenAI.

El endpoint limita el cuerpo de la solicitud, valida la firma básica de la imagen, valida la respuesta del modelo con Zod y devuelve errores controlados. No se utiliza una respuesta demostrativa cuando falla el proveedor.

### Límite de solicitudes

El límite autenticado es de 10 solicitudes por ventana de 60 segundos y por identidad; antes de verificar la sesión se aplica también un límite de 30 solicitudes por IP de proxy por minuto. Para compartir el contador entre instancias de Vercel configura `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. Si no se configuran, se usa un límite por instancia (adecuado para desarrollo, no equivalente a un limitador distribuido). Si Upstash está configurado pero no responde, el endpoint falla cerrado con HTTP 429 temporal en vez de omitir la protección.

## Configuración y migración Supabase

**Antes de ejecutar SQL en producción, exporta un respaldo de la base de datos y verifica las tablas actuales.** Estas migraciones no se han ejecutado automáticamente desde este ZIP.

Orden recomendado:

1. En una instalación nueva, ejecutar `supabase/personal-account.sql`.
2. En una base existente, revisar `supabase/verificar_estructura.sql` y ejecutar `supabase/preflight-hardening-1.2.1.sql` (solo lectura).
3. Ejecutar `supabase/hardening-1.2.1.sql` primero en un proyecto Supabase de pruebas. La migración sustituye las cuatro políticas legacy conocidas; si encuentra políticas distintas o claves foráneas dependientes de la PK antigua, aborta y revierte.
4. Ejecutar `supabase/comparativa-equipo.sql` después de la migración para instalar o actualizar las funciones de comparación y publicación.
5. Comprobar que el administrador y los integrantes ya estén registrados en `agrovision_members`. Ejecutar `activar-admin-comparativa.sql` o `registrar-integrante.sql` únicamente para cuentas que realmente falten; no volver a registrar las dos cuentas existentes.
6. Probar lectura, escritura, eliminación, fotos, publicación y consulta con dos cuentas de prueba. Solo después planificar una ventana de migración de producción con respaldo reciente.

La migración convierte la clave primaria de `agrovision_members` a `project_id + user_id`, si no existen claves foráneas que dependan de la clave anterior. Una cuenta puede participar en varios proyectos. La membresía es explícita: el administrador debe registrar a cada cuenta autorizada; conocer el identificador público del proyecto no basta para escribir ni consultar publicaciones. El resumen cuenta las membresías autorizadas, aunque todavía no hayan registrado observaciones. La migración sustituye las cuatro políticas legacy conocidas de `agrovision_records` y se detiene si detecta otras políticas no reconocidas, porque PostgreSQL combina políticas permisivas mediante OR. Los resultados publicados siguen siendo agregados; no incluyen fotografías ni observaciones individuales.

**Para la base de producción que ya tiene las dos cuentas registradas, no ejecutes los scripts de alta para esas mismas cuentas.**
## Cambios principales de 1.2.1

- Verificación de JWT Supabase en servidor para el endpoint IA.
- Token local obligatorio cuando no hay Supabase.
- Comparación de token local en tiempo constante.
- Límite de solicitudes por identidad y soporte opcional de Upstash Redis.
- Cabeceras HTTP de seguridad y Content Security Policy.
- Tabla de membresías por proyecto y corrección de consultas por `project_id + user_id`.
- Validaciones SQL para medidas, fechas, duplicados por planta/fecha y consistencia de tratamiento.
- RPC transaccional para altas, ediciones y eliminaciones con control de concurrencia por `updated_at`.
- Cálculo de crecimiento entre mediciones del mismo tratamiento.
- Caché de URLs firmadas de fotografías por usuario, con renovación antes de vencer y concurrencia limitada.
- Bitácora móvil con jerarquía visual uniforme, una columna en teléfonos y tarjetas más limpias; los detalles y mediciones completas permanecen en la vista expandida.
- Corrección de opción duplicada en el filtro de estado.
- Documentación de objetivo, observaciones, migración y criterios de aceptación.

## Pruebas y verificación

```bash
npm ci
npm run typecheck
npm test
npm run build
```

O ejecutar todo con:

```bash
npm run verify
```

La CI usa Node 24. Esta entrega incluye pruebas nuevas de autenticación Supabase, rechazo de sesiones inválidas, configuración de autenticación y caché de URLs firmadas. La verificación integral de build, pruebas, migración SQL y despliegue debe ejecutarse en un entorno con Node 24 y credenciales de pruebas. No se afirma que las migraciones hayan sido aplicadas a tu instancia real.

## Límites y consideraciones operativas

- Las sesiones Supabase del cliente continúan almacenándose en `localStorage`; la verificación del JWT en el servidor no equivale a una migración a cookies `HttpOnly`. Evita insertar HTML no confiable y mantén actualizadas las dependencias.
- El límite por instancia es un fallback; configura Upstash para producción multi-instancia.
- La RPC de datos necesita que `supabase/hardening-1.2.1.sql` se aplique antes de desplegar el código que la utiliza.
- La subida de fotografías a Storage ocurre antes de la transacción de metadatos. Si la RPC falla después de subir una imagen nueva, podría quedar un objeto sin referencia; revisa Storage antes de hacer limpiezas automáticas.
- No hay cola de escritura offline en modo nube. Las operaciones de nube requieren conexión.
- El análisis IA es orientativo; no confirma enfermedades ni sustituye mediciones manuales.

## Estructura principal

- `app/`: App Router y endpoint de análisis.
- `components/`: autenticación, Dashboard, bitácora, análisis y comparaciones.
- `lib/`: autenticación/sincronización, almacenamiento, métricas, validaciones y exportaciones.
- `supabase/`: SQL de instalación, actualización y hardening.
- `tests/`: pruebas unitarias y de regresión.
- `docs/`: observaciones técnicas y guía de liberación.

## Despliegue

1. Configura las variables en Vercel.
2. Ejecuta las migraciones en Supabase de pruebas y valida las cuentas.
3. Publica una Preview desde una rama, no directamente desde `main`.
4. Prueba login, análisis IA, bitácora, fotografías, comparación, publicación y modo móvil.
5. Integra a `main` solo tras aprobar QA y confirmar que la migración SQL está aplicada.

# Informe de auditoría técnica — AgroVisión / TerraNova 1.2.1

**Alcance:** análisis estático del repositorio y correcciones incorporadas al paquete. No se accedió a la cuenta Supabase ni a Vercel del propietario.

## 1. Objetivo

Fortalecer la autenticación, la autorización por proyecto, la integridad de observaciones, la consistencia de comparaciones, el rendimiento de fotografías y la adaptación móvil sin reconstruir la aplicación ni eliminar datos históricos.

## 2. Arquitectura

El proyecto mantiene Next.js App Router, React, TypeScript, componentes funcionales, lógica de negocio en `lib/`, Supabase para Auth/PostgREST/Storage, IndexedDB para modo local, SQL versionado y pruebas automatizadas.

La API `/api/analyze-crop` delega el análisis en `lib/analysis-server.ts`. El cliente conserva el flujo de análisis y envía el bearer token de Supabase en modo nube o el código local en modo local.

## 3. Hallazgos y correcciones

| Área | Hallazgo en la base 1.2.0 | Corrección incorporada |
|---|---|---|
| API IA | El token compartido era opcional y no se verificaba JWT Supabase | JWT validado contra Supabase Auth o token local obligatorio de 32+ caracteres |
| Rate limit | Contador por instancia e identidad controlable por `x-client-id` | Identidad Supabase o IP de proxy; Upstash Redis opcional; fallback por instancia documentado |
| HTTP | Cabeceras generales incompletas | CSP, HSTS en producción, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy |
| Membresías | Registro automático y comprobaciones no siempre aisladas por proyecto | Inscripción explícita por `project_id + user_id`; RLS bloquea cuentas no inscritas |
| Integridad SQL | Validaciones de negocio principalmente en cliente | Trigger SQL para fechas, medidas, duplicados por planta/fecha y tratamiento consistente |
| Mutaciones nube | Altas/ediciones/eliminaciones como peticiones separadas | RPC `SECURITY INVOKER` transaccional con control de concurrencia `updated_at` |
| Comparación | Primera y última altura podían pertenecer a tratamientos distintos | Cálculo de crecimiento condicionado al mismo tratamiento |
| Conteo de integrantes | Resumen basado en propietarios con observaciones | Resumen cuenta membresías autorizadas del proyecto |
| Fotografías | URLs firmadas solicitadas repetidamente | Caché por usuario/ruta, renovación anticipada y máximo ocho solicitudes concurrentes |
| Bitácora móvil | Tarjetas con altura y tipografía diferentes; campos poco compactos | Tarjetas uniformes, una columna en móvil, datos vacíos/detalles completos en vista expandida |

## 4. Seguridad y autorización

El modo nube exige una sesión Supabase válida en el endpoint de IA. El servidor verifica el token con `/auth/v1/user`; no confía en el formato del JWT ni en un identificador enviado por el cliente.

En modo local se exige `ANALYSIS_ACCESS_TOKEN` de al menos 32 caracteres. La comparación se realiza en tiempo constante. No se incluyen claves reales en el repositorio.

Las tablas de observaciones se restringen mediante RLS a cuentas inscritas en `agrovision_members`. La pertenencia no se concede automáticamente por conocer el identificador público del proyecto. El administrador y los integrantes se registran mediante `activar-admin-comparativa.sql` y `registrar-integrante.sql`.

## 5. Integridad de datos y comparación

La migración `supabase/hardening-1.2.1.sql` instala la validación de payload y una RPC transaccional. La comparación agrega únicamente registros de miembros inscritos, excluye demostraciones y evita calcular crecimiento mezclando tratamientos. El resumen de integrantes cuenta las membresías autorizadas, incluso si una cuenta aún no ha aportado mediciones.

## 6. Rendimiento y experiencia móvil

Las URLs firmadas se guardan temporalmente en memoria del navegador, separadas por usuario y ruta, y se renuevan antes de vencer. La bitácora conserva los detalles y medidas completas en la vista expandida; la tarjeta muestra información principal y fotografía.

## 7. Archivos principales modificados

- `lib/analysis-server.ts`
- `app/api/analyze-crop/route.ts`
- `lib/cloud.ts`
- `components/history.tsx`
- `app/globals.css`
- `next.config.mjs`
- `supabase/personal-account.sql`
- `supabase/actualizar_base_existente.sql`
- `supabase/comparativa-equipo.sql`
- `supabase/hardening-1.2.1.sql`
- `supabase/activar-admin-comparativa.sql`
- `supabase/registrar-integrante.sql`
- `tests/analysis.test.ts`
- `tests/cloud.test.ts`

## 8. Verificación

- 33 archivos TypeScript/TSX procesados por el parser: cero errores sintácticos.
- `node --check` correcto en `next.config.mjs`, `scripts/build-site.mjs` y `public/sw.js`.
- JSON de package, lockfile, tsconfig y Vercel parseables.
- `npm ci` no completó porque la descarga de dependencias agotó el tiempo disponible.
- `npm test` no pudo iniciar por ausencia del paquete `tsx`.
- Typecheck completo y build no ejecutados; el entorno dispone de Node 22.16.0 y el proyecto requiere Node 24.x.
- SQL no ejecutado en Supabase real; no se modificaron datos ni políticas remotas.
- No se desplegó a Vercel ni se hizo prueba E2E en navegador.

## 9. Limitaciones pendientes

1. Ejecutar `npm run verify` con Node 24 y dependencias instaladas.
2. Aplicar las migraciones en Supabase de pruebas y validar RLS con dos cuentas.
3. Configurar Upstash para rate limiting distribuido en producción multi-instancia.
4. La sesión Supabase del cliente sigue en `localStorage`; no se migró a cookies `HttpOnly`.
5. La subida de una fotografía precede a la transacción de metadatos; una RPC fallida puede dejar un objeto sin referencia en Storage.
6. Completar prueba visual en 360, 390, 430, 768 y 1366 px.

## 10. Conclusión

La versión 1.2.1 contiene correcciones de código y scripts de migración para los riesgos principales identificados. Es un paquete preparado para verificación, no una certificación de producción. No integrar a `main` ni desplegar hasta que el typecheck, la suite, el build, las migraciones y la validación funcional con dos cuentas hayan pasado.

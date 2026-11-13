# Entrega técnica — AgroVisión / TerraNova 1.2.1

## Objetivo

Fortalecer la seguridad del análisis IA, la integridad de la base de datos, la consistencia de las comparaciones, el rendimiento de fotografías y la bitácora móvil, conservando la arquitectura y funcionalidades de 1.2.0.

## Correcciones incluidas

1. **Autenticación:** Supabase JWT validado en servidor; token local obligatorio de 32 caracteres como mínimo y modo local explícito incluso cuando Supabase está configurado.
2. **Protección API:** comparación de token en tiempo constante, límite de solicitudes y soporte Upstash opcional.
3. **Seguridad HTTP:** Content Security Policy y cabeceras de seguridad en Next.js.
4. **Supabase:** membresías explícitas por proyecto/usuario, RLS que bloquea cuentas no inscritas, trigger de validación y RPC transaccional para mutaciones.
5. **Comparación:** crecimiento calculado únicamente con primera y última medición del mismo tratamiento.
6. **Fotografías:** caché de URLs firmadas por usuario y concurrencia limitada a ocho solicitudes.
7. **Bitácora móvil:** tarjetas de una columna, imagen de altura consistente, información principal compacta y detalle completo en vista expandida.
8. **Documentación:** objetivo, observaciones técnicas, guía SQL y plan de liberación.

## Archivos principales modificados

- `lib/analysis-server.ts`
- `components/dashboard.tsx`
- `app/api/analyze-crop/route.ts`
- `lib/cloud.ts`
- `components/history.tsx`
- `app/globals.css`
- `next.config.mjs`
- `supabase/personal-account.sql`
- `supabase/comparativa-equipo.sql`
- `supabase/hardening-1.2.1.sql`
- `supabase/preflight-hardening-1.2.1.sql`
- `tests/analysis.test.ts`
- `tests/cloud.test.ts`
- `tests/sql-migration.test.ts`
- `README.md`, `QA_FINAL.md`, `QA_STATUS.md` y `package.json`

## Correcciones de compatibilidad añadidas

- Se corrigió `hardening-1.2.1.sql` para las cuatro políticas RLS legacy identificadas en el Supabase actual.
- Se incorpora migración de PK `user_id` a `(project_id, user_id)` con verificación previa de claves foráneas dependientes y duplicados.
- Se evita duplicar el trigger de `updated_at`.
- El script de alta de integrantes deja intactas las membresías que ya existen.
- Se añade `supabase/preflight-hardening-1.2.1.sql` y pruebas estáticas del SQL.

## Observaciones y límites

- La migración SQL corregida no se ejecutó en la base de datos del propietario. Las membresías son explícitas. En la base actual las dos cuentas ya están registradas; no se deben volver a ejecutar scripts de alta para ellas. Los scripts solo se usan si falta una cuenta autorizada.
- El despliegue de Vercel no se modificó.
- No se usaron ni se incluyeron credenciales reales.
- Las pruebas automatizadas y el build completo quedan pendientes de ejecutar con Node 24 porque la instalación de dependencias no terminó en el entorno de preparación.
- La sesión Supabase del cliente continúa en `localStorage`; no se ha migrado a cookies HttpOnly.
- Para rate limiting distribuido en Vercel se deben configurar las credenciales Upstash.

## Comprobación local

```bash
npm ci
npm run verify
```

Seguir `docs/GUIA_MIGRACION_SUPABASE_1.2.1.md` antes de desplegar. Revisar `docs/PLAN_LIBERACION_1.2.1.md` para el procedimiento de Preview y liberación.

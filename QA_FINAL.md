# QA final — TerraNova 1.2.0

## Comprobaciones completadas en el entorno de preparación
- 33 archivos TypeScript/TSX procesados por el parser de TypeScript: 0 errores sintácticos.
- `node --check` correcto para `next.config.mjs`, `scripts/build-site.mjs` y `public/sw.js`.
- JSON de `package.json` y `package-lock.json` parseable.
- `lib/types.ts`, `lib/tracking.ts` y `lib/metrics.ts` compilados aisladamente con TypeScript global.
- Prueba aislada de métricas con 20 observaciones sintéticas: 4 plantas, 2 tratamientos, promedios de altura/diámetro/hojas y conteos coherentes.

## Comprobaciones no ejecutadas
- `npm ci` agotó el tiempo al descargar dependencias; el entorno tiene Node 22.16.0, pero el proyecto exige Node 24.x.
- No se ejecutó `npm run verify` ni se afirma que la suite o el build completo hayan pasado.
- No se ejecutó SQL contra la instancia Supabase del propietario.
- No se verificaron sesiones, políticas RLS, almacenamiento de fotos, publicación RPC ni acceso real con dos cuentas.
- No se hizo prueba visual/E2E en navegador.

## Verificación obligatoria en el equipo del propietario

Con Node 24.x y acceso al registro npm:

```powershell
npm ci
npm run verify
npm run dev
```

Luego:
1. Entrar con la cuenta administradora y comprobar el Resumen general.
2. Confirmar que se muestra la tabla de tratamientos y los tamaños de muestra `n`.
3. Pulsar «Publicar al equipo» y confirmar la publicación.
4. Entrar con una cuenta integrante del mismo proyecto y comprobar que solo ve la publicación agregada.
5. Confirmar que la cuenta integrante no puede acceder a la vista previa administrativa ni publicar.

No integrar en `main` ni desplegar si `npm run verify` falla. No copiar claves privadas al repositorio.

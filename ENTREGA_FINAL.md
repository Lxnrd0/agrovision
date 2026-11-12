# Entrega final — TerraNova 1.2.0

## Qué incluye esta versión

Esta entrega parte del ZIP `agrovision-feature-comparativa-equipo(2)` enviado en la conversación.

### Panel de administración
- Conserva el resumen general con indicadores, destacados, crecimiento, conclusión y PDF.
- Incorpora una tabla visible de tratamientos con cultivo, fertilizante, dosis, cantidad de plantas e integrantes, edad, altura media, velocidad de crecimiento, hojas, diámetro y estado sanitario.
- Cada promedio muestra su tamaño de muestra (`n`). Los datos ausentes se muestran como no disponibles, no como cero.
- Añade el botón **Publicar al equipo**. Antes de publicar solicita confirmación y llama a la función RPC protegida por Supabase. No publica datos individuales.
- Muestra la fecha de la última publicación y el resultado de la publicación actual.

### Vista de integrantes
- El apartado Resumen general aparece también para usuarios autenticados que no son administradores.
- El administrador ve la vista previa privada y puede publicar.
- Los demás integrantes ven únicamente la última instantánea agregada publicada.
- La lectura de la publicación sigue validada en el servidor por pertenencia al proyecto.
- Los integrantes no reciben acceso a la vista previa, a las fotografías ni a los registros individuales de otras cuentas.

### Configuración reproducible de Supabase
Se incorporan a `supabase/` los scripts:
1. `comparativa-equipo.sql`: tablas de administración/publicación, trigger de pertenencia, funciones RPC, permisos y cálculo agregado.
2. `activar-admin-comparativa.sql`: activa como administrador la cuenta cuyo correo se complete localmente en el SQL Editor.
3. Se conservan `personal-account.sql`, `actualizar_base_existente.sql` y `verificar_estructura.sql`.

No se incluyen correos, UUID, claves ni credenciales privadas.

## Criterios de cálculo del panel

La RPC `agrovision_comparison_preview`:
- Filtra por `project_id`.
- Excluye registros `source = demo`.
- Requiere cultivo, lote, código de planta, fertilizante, dosis y fechas válidas.
- Identifica una planta por propietario + cultivo + lote + código + fecha de siembra.
- Usa la última medición manual válida por planta para altura, diámetro y hojas.
- Calcula velocidad de crecimiento por planta como (última altura manual − primera altura manual) / días transcurridos.
- Agrupa por cultivo, fertilizante y dosis.
- Cuenta plantas e integrantes distintos.
- Devuelve métricas agregadas, advertencias y metodología; no incluye nombres, fotos, notas ni IDs personales.

La clasificación de crecimiento es descriptiva. No demuestra causalidad ni superioridad agronómica universal. El estado sanitario utiliza la última evaluación de salud registrada por planta; no se debe interpretar como una medición física manual.

## Verificaciones realizadas en esta preparación

| Verificación | Resultado |
|---|---|
| Archivos TypeScript/TSX inspeccionados por el parser de TypeScript | 33 archivos, 0 errores sintácticos |
| `next.config.mjs`, `scripts/build-site.mjs`, `public/sw.js` | `node --check` correcto |
| JSON de package y lockfile | Correcto |
| Lógica real `tracking.ts` + `metrics.ts` compilada de forma aislada | Correcta |
| Datos sintéticos en memoria | 20 observaciones, 4 plantas, 2 tratamientos; promedios de tamaño calculados |
| Instalación completa `npm ci` | No completada: el entorno de preparación no resolvió el registro npm y agotó el tiempo |
| `npm run typecheck`, `npm test`, `npm run build` completos | No ejecutados en esta preparación por falta de dependencias instaladas |
| Supabase real / RLS / RPC / Storage | No se modificó ni se llamó a la instancia del usuario; las funciones fueron revisadas desde los CSV SQL proporcionados |
| Prueba visual real en navegador | Pendiente de ejecutar en el entorno del propietario |

**No se declara certificación completa de producción** porque no se dispone de las credenciales del proyecto Supabase ni del entorno Node 24 con dependencias descargadas. Esta limitación no se oculta ni se sustituye por resultados simulados.

## Inicio y verificación local

Requisito: Node.js 24.x.

```powershell
npm ci
npm run verify
npm run dev
```

Abrir `http://localhost:3000`.

## Configuración de Supabase para el panel de equipo

Si las funciones ya están instaladas en el proyecto Supabase actual, no vuelvas a ejecutar los scripts sin necesidad. Si se trata de una instalación nueva o se necesita recrear la configuración:

1. Confirmar el esquema base y las políticas existentes.
2. Ejecutar `supabase/comparativa-equipo.sql`.
3. Reemplazar el marcador de correo en `supabase/activar-admin-comparativa.sql` y ejecutar el bloque desde una sesión segura del SQL Editor.
4. Configurar las variables públicas en `.env.local` o en el proveedor de hosting y volver a desplegar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (valor de la Publishable key)
   - `NEXT_PUBLIC_AGROVISION_PROJECT_ID`

Nunca configurar `service_role` ni claves privadas con prefijo `NEXT_PUBLIC_`.

## Publicación

El ZIP no ejecuta `git push`, no fusiona ramas, no modifica GitHub ni despliega Vercel. Para publicar esta versión hay que revisar el diff en GitHub Desktop, ejecutar `npm run verify` en Node 24 y desplegar la rama deseada. La publicación de resultados del equipo dentro de la aplicación es una acción separada que solo el administrador puede realizar.

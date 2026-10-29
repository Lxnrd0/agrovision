> Versión 1.1.1 preparada para GitHub web y Vercel. Las instrucciones de reemplazo y los códigos completos para copiar están en la carpeta superior del ZIP. Usa Node 24.x. La configuración `vercel.json` fija instalación y build de Next.js.

# AgroVision / TerraNova

Bitácora de campo para registrar plantas, fotografías, observaciones y medidas; interpretar imágenes con IA de forma orientativa; consultar crecimiento y comparar tratamientos. La interfaz conserva la identidad TerraNova del proyecto original.

## Inicio local

Este paquete fija Node.js 24.x, compatible con Vercel. Verificado con Node 24.22.1.

```bash
npm ci
npm run dev
```

Abrir http://localhost:3000 y seleccionar **Continuar solo en este dispositivo** si no se configuró Supabase. No se necesita clave para la demostración, el registro manual o las exportaciones. La bitácora empieza vacía. Los resultados de demostración son simulados, independientes de la foto y se etiquetan como tales.

## Configuración de IA

Copiar `.env.example` a `.env.local` (en PowerShell: `Copy-Item .env.example .env.local`). Completar las claves que correspondan y reiniciar el servidor:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ANALYSIS_ACCESS_TOKEN=
```

Gemini tiene prioridad si hay dos claves; la selección depende de la configuración del servidor. No hay conmutación automática a otro proveedor ni a demostraciones cuando falla una llamada real. Las claves privadas nunca deben llevar `NEXT_PUBLIC_`. Si se define `ANALYSIS_ACCESS_TOKEN`, escribir el código en el panel de análisis; permanece en memoria del navegador.

El indicador de configuración solo confirma la presencia de una clave, no su validez o cuota. El servidor valida JSON y firma de imagen y envía la foto al proveedor. Zod comprueba el resultado. Timeout del proveedor: 55 segundos; cliente: 65 segundos. Los errores de cuota, autenticación, disponibilidad, formato y tiempo de espera se muestran expresamente.

No se afirma una prueba real de proveedores en esta entrega. La precisión agronómica no está validada. Una foto no confirma una enfermedad; la confianza es una autoestimación no calibrada. El diámetro estimado se descarta si no se declara una escala, y el modelo debe comprobar que sea visible.

## Cuenta opcional en Supabase

1. Crear un proyecto propio y ejecutar `supabase/personal-account.sql` en su editor SQL. Si ya existen tablas/políticas, revisar su compatibilidad y cualquier política permisiva anterior antes de usarlo.
2. Completar estas variables **públicas** de `.env.local` antes de compilar:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICA
NEXT_PUBLIC_AGROVISION_PROJECT_ID=rabanitos-2026
```

3. Reiniciar desarrollo o recompilar producción. Crear cuenta, confirmar correo si Supabase lo exige e iniciar sesión. Configurar en Supabase el origen permitido y los redirects de recuperación. No usar la clave `service_role` en el navegador.

Hay registro, login, cierre de sesión y recuperación de contraseña mediante Supabase Auth. Cada cuenta tiene sus propios registros, no una bitácora de equipo compartida. Las fotos se guardan en un bucket privado y se leen con URLs temporales de una hora. El cliente consulta cambios cada 12 segundos mientras la pestaña está visible. Las variables `NEXT_PUBLIC_` quedan fijadas al compilar.

La primera cuenta elegible puede migrar las observaciones reales del navegador; se conserva un marcador de propietario para no copiarlas automáticamente a otra cuenta. Una importación manual de respaldo es una acción distinta y explícita.

La API de IA y la cuenta Supabase tienen controles separados: el login por sí solo no protege `/api/analyze-crop`. Para exponer un servidor con coste, definir el token de análisis y añadir una política de acceso y limitación adecuada al alojamiento. El limitador incluido (10 solicitudes/minuto/cliente/instancia) no es un control distribuido resistente al abuso.

## Funciones implementadas

- JPG, PNG, WEBP y HEIC/HEIF si el navegador puede decodificarlos; máximo 12 MiB de entrada. Conversión a JPEG con lado mayor de 1280 px; el servidor limita el cuerpo a 4,2 MB y la data URL a 4.000.000 de caracteres, por debajo del límite de Vercel. Un HEIC incompatible muestra error en vez de simular una conversión.
- Análisis orientativo, demostración explícita y registro manual. Se preservan las observaciones originales de IA y las medidas manuales por separado.
- Identificación de planta por cultivo + lote + código + fecha de siembra; tratamiento y dosis consistentes; una observación real por fecha y planta, validada en el cliente.
- Bitácora con búsqueda, filtros, detalle, corrección y eliminación con confirmación. Se pueden corregir registros antiguos sin inventar seguimiento faltante; estos siguen excluidos de cálculos que necesitan siembra y dosis.
- Crecimiento, comparación por tratamiento/dosis y edad; promedios y desviación estándar muestral. No se trata como cero una medida faltante y no se equipara una estimación IA con una medida manual.
- CSV completo con procedencia, diagnóstico y crecimiento; PDF por planta con historial, gráficas manuales y observaciones/recomendaciones/limitaciones de IA. Las fotos no se incrustan: se conservan en el respaldo JSON.
- Respaldo JSON portable con fotos y restauración por ID sin sobrescribir los existentes. En modo nube se escribe en la nube y se espera su resultado; no se incorpora accidentalmente la bitácora local.
- Cuatro protocolos de buenas prácticas, temas claro/oscuro y diseño con reglas adaptables a móvil.

## Almacenamiento y modo sin conexión

Sin Supabase: IndexedDB, base `agrovision`, almacén `data`, clave `records`. Cada modificación local usa una transacción de lectura/escritura. BroadcastChannel avisa a otras pestañas compatibles del mismo origen. Borrar datos del navegador borra esta bitácora: descargar respaldos periódicamente.

En producción el service worker guarda HTML, JS/CSS iniciales y recursos de marca al instalarse. Una primera visita debe terminar la instalación antes de desconectarse. No guarda respuestas de API ni llamadas externas. El modo local permite consultar/registrar sin internet. El PDF necesita haber descargado sus módulos dinámicos previamente. En modo nube no hay cola offline ni réplica local: las operaciones necesitan conexión. Las URLs firmadas de fotos vencen y se renuevan al consultar la nube.

No hay sensores IoT, diagnóstico agronómico confirmado, trabajo colaborativo entre cuentas ni análisis local de imágenes. El entorno no permitió una prueba visual en navegador; consultar `INFORME_AUDITORIA.md` y `VERIFICACION_VERCEL.md` para límites y pendientes.

## Verificación y producción

```bash
npm run typecheck
npm test
npm run build
npm start
```

Se actualizaron Next.js a 16.4.3, React a 19.3.1, Zod a 4.6.7 y jsPDF a 4.2.1 para resolver avisos de dependencias; el diseño y los datos de IndexedDB se conservan. El build usa Webpack explícitamente. La compilación no sustituye una prueba visual. No existe un comando de lint independiente configurado.

`npm run build:site` es un adaptador opcional: genera una copia estática y un Worker ESM con la API en `dist/server/index.js`. No publica nada. Si existe `.openai/hosting.json`, lo copia; de lo contrario informa que falta configurar destino. Para ese adaptador, proporcionar las variables públicas como variables del proceso de build; la copia temporal no incluye `.env.local`. Las claves del proveedor se suministran al Worker en ejecución. No poner secretos en archivos de hosting ni en el ZIP.

## Archivos principales

`app/api/analyze-crop/route.ts` adapta la API de Next al motor `lib/analysis-server.ts`. `components/auth-gate.tsx` resuelve cuenta/local y `components/dashboard.tsx` coordina vistas, persistencia y análisis. `report-form`, `history`, `edit-observation`, `comparison` y `plant-growth` implementan los flujos de campo. `lib/storage.ts` maneja IndexedDB, `lib/cloud.ts` Supabase, `lib/backup.ts` validación de respaldos, `lib/tracking.ts` identidad/fechas/crecimiento, `lib/metrics.ts` estadísticas y CSV seguro, `lib/exports.ts` los archivos CSV/PDF. `public/sw.js` implementa la caché offline.

## Referencias

- Modelo Gemini: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Actualización Next: https://nextjs.org/docs/app/guides/upgrading/version-16
- Foto de muestra: Omar Roque, Unsplash: https://unsplash.com/photos/a-bunch-of-radishes-sitting-on-top-of-green-leaves-qGTl7GssT5w (Unsplash License).

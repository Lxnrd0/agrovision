> Informe histórico de la primera revisión. Para este paquete 1.1.1, los resultados actualizados y las condiciones de despliegue están en VERIFICACION_VERCEL.md. La paginación ya admite un límite de servidor menor que 500 y el cuerpo máximo de análisis ahora es 4,2 MB. No ejecutar personal-account.sql a ciegas sobre una base existente: usar la verificación y migración aditiva incluidas.

# Auditoría y reparación de AgroVision / TerraNova

Fecha: 28 de octubre de 2026. Fuente: `agrovision-main(4).zip`. Se revisó el código completo de los módulos funcionales, no solo el README. El archivo original se conserva intacto; esta entrega es una copia corregida.

## Qué es y quién lo utiliza

Es una aplicación web en español para agricultores, técnicos y estudiantes que llevan una bitácora de cultivos, especialmente rabanitos. Permite registrar observaciones periódicas de una planta, adjuntar fotografías y medidas verificadas en campo, obtener una interpretación visual orientativa mediante un proveedor de IA, comparar tratamientos y producir respaldos e informes. La interfaz usa la marca TerraNova, aunque el repositorio y la base local se llaman AgroVision.

No es un sistema que confirme enfermedades, mida automáticamente con precisión validada, conecte sensores ni demuestre causalidad de fertilizantes. El código implementa dos modos de persistencia: local o cuenta personal de Supabase. No hay permisos de equipo ni una bitácora compartida entre cuentas diferentes.

## Arquitectura y dependencias

- Next.js App Router sirve la interfaz React y `app/api/analyze-crop/route.ts`. El dashboard concentra navegación, estado del análisis y persistencia; los formularios y vistas están separados en componentes.
- `lib/analysis-server.ts` es el motor del servidor: valida imágenes y JSON, limita solicitudes, llama a Gemini mediante `@google/genai` o a OpenAI por HTTP y valida la respuesta con Zod. No guarda fotos en el servidor de Next.
- `lib/storage.ts` conserva un arreglo de registros con fotografías en IndexedDB. Las mutaciones locales son transaccionales; BroadcastChannel informa a otras pestañas del mismo origen.
- `lib/cloud.ts` utiliza Supabase Auth, PostgREST y Storage mediante fetch. La sesión y el refresh token se guardan en localStorage. Las fotos se suben a un bucket privado; se firman por una hora para visualizarlas. El dashboard consulta cambios cada 12 segundos mientras la pestaña es visible.
- `lib/tracking.ts` define identidad de planta, edad, medidas válidas, tratamiento y crecimiento. `lib/metrics.ts` calcula promedios, desviación estándar muestral y protección CSV. `lib/exports.ts` genera CSV y PDF con jsPDF/AutoTable.
- Tailwind y CSS propio implementan el diseño; Lucide aporta iconos. No se reescribió el diseño.
- `public/sw.js` instala caché de interfaz para producción; excluye la API y peticiones de otros orígenes.
- `scripts/build-site.mjs` es un adaptador opcional que exporta una copia estática y empaqueta un Worker ESM. No publica el proyecto ni necesita alterar el endpoint de Next.
- Se actualizaron las dependencias afectadas por los avisos de npm audit: Next 16.4.3, React/ReactDOM 19.3.1, jsPDF 4.2.1, AutoTable 5.0.9, Zod 4.6.7 y PostCSS 8.5.32; el lockfile incorpora también las correcciones transitivas de DOMPurify y postcss-selector-parser. Se mantuvo Tailwind 3 y el SDK Gemini. Se añadió fake-indexeddb solo como dependencia de desarrollo para pruebas.

## Recorrido real de los datos

1. El usuario elige modo local o inicia sesión si configuró Supabase. En local, la bitácora inicial está vacía. La autenticación de cuenta no es necesaria para trabajar en el modo local.
2. Carga o arrastra una fotografía. Se comprueban el tipo y el límite de 12 MiB. El navegador debe poder decodificarla; HEIC depende de su soporte. Se redimensiona a un lado mayor máximo de 1280 px y se convierte a JPEG. Esta conversión elimina los metadatos originales al dibujar en canvas.
3. En modo real, el cliente envía la imagen como data URL a la API. El servidor comprueba origen si hay cabecera Origin, token si se configuró, tipo JSON, tamaño del cuerpo (7,1 MB), firma JPEG/PNG/WEBP y campos. Gemini se prefiere cuando hay dos claves. La alternativa OpenAI se selecciona por configuración, no como fallback tras un fallo de Gemini.
4. El proveedor recibe instrucciones y foto. Timeout de servidor: 55 s; cliente: 65 s. Se exige JSON estructurado; Zod valida rangos y estructura. Sin referencia de escala declarada se elimina el diámetro estimado. La comprobación de que la regla está realmente visible corresponde al modelo, no a una medición geométrica determinista.
5. El usuario revisa el análisis y abre el formulario. Puede corregir medidas manuales y registrar responsable, cultivo, código de planta, lote, siembra, observación, fertilizante y dosis. Las estimaciones y observaciones originales de IA se conservan aparte. Riego, humedad y temperatura se almacenan como notas, no como series numéricas independientes.
6. Al guardar se comprueban fechas, medidas, duplicados por planta/fecha y consistencia de tratamiento. La identidad de planta usa cultivo + lote + código + siembra, normalizando espacios, mayúsculas y acentos. La escritura se dirige a IndexedDB o Supabase según el modo activo.
7. La bitácora ofrece búsqueda, filtros, detalle, edición y eliminación confirmada. El editor conserva fotografía, identidad y estimaciones originales. Si un registro cambió mientras el editor estaba abierto, se rechaza una corrección obsoleta.
8. La comparativa excluye demostraciones, separa tratamientos/dosis y usa una observación por planta en el rango de edad elegido. Las barras se agrupan por edad. La gráfica de crecimiento utiliza medidas manuales y no convierte faltantes en ceros. No basta para atribuir diferencias al tratamiento.
9. CSV conserva ahora diagnóstico, procedencia, estimaciones, medidas y cambios. El PDF separa correctamente plantas, aunque repitan código, e incorpora el análisis orientativo. Las fotos quedan en la bitácora y en JSON, no incrustadas en CSV/PDF.
10. El respaldo descarga registros y fotos incorporadas. Restaurar agrega IDs ausentes y conserva los existentes. La restauración local es atómica; la nube tiene operaciones HTTP por registro y puede quedar parcialmente completada si una operación posterior falla. Un reintento omite IDs ya presentes.

## Errores confirmados y reparaciones

“Confirmado” significa demostrado por inspección de una ruta de código concreta y, cuando se indica, por una prueba automatizada. Los servicios simulados no equivalen a acceso real a Supabase o IA.

| ID | Gravedad | Archivo afectado | Reproducción, causa y efecto originales | Reparación y evidencia |
|---|---|---|---|---|
| AV-01 | Alta | `components/backup-controls.tsx`, `components/dashboard.tsx` | En modo nube, restaurar un JSON con una bitácora local previa. La restauración escribía primero en IndexedDB y entregaba al dashboard la mezcla completa; este la subía a la cuenta. Incorporaba registros locales ajenos al respaldo y dejaba datos de nube en el dispositivo. | El destino de restauración es una operación inyectada y exclusiva: nube o local. Prueba con IndexedDB emulado y Supabase simulado confirma que el local queda intacto y solo se sube lo importado. |
| AV-02 | Media | Mismos archivos | Hacer fallar la escritura Supabase durante una restauración. El callback devolvía inmediatamente y el control anunciaba éxito antes de finalizar la nube. | Se espera la operación completa; los errores impiden el mensaje de éxito. Prueba de denegación HTTP 403. |
| AV-03 | Media | `components/backup-controls.tsx`, `lib/cloud.ts` | Descargar respaldo de un registro de nube con foto. Todas las URLs externas se rechazaban, incluso las URLs firmadas del propio bucket. No podía descargarse el respaldo portable. | Se permiten exclusivamente las rutas firmadas del bucket del Supabase configurado, además del mismo origen. Se prueban URL permitida y URLs ajenas rechazadas. La descarga real desde Storage sigue pendiente. |
| AV-04 | Alta | `lib/exports.ts` | Exportar PDF de P01 en dos lotes o siembras. Se agrupaba solo por plantId, fusionando plantas distintas y sus medidas. | Agrupación por la identidad completa. Prueba sobre un PDF generado con tres plantas del mismo código. |
| AV-05 | Media | `components/dashboard.tsx`, `lib/exports.ts` | Exportar un análisis con recomendaciones y limitaciones. El botón CSV utilizaba una función simplificada y el PDF omitía estos detalles, pese a lo anunciado en README. | El botón usa el CSV completo ya existente; el PDF incorpora análisis originales, recomendaciones y limitaciones. Se comprueban archivos generados y escape de fórmulas CSV. |
| AV-06 | Alta | `public/sw.js` | Primera visita a producción, esperar instalación y desconectar antes de recargar. El worker almacenaba HTML pero no los JS/CSS descargados antes de tomar control, por lo que faltaban dependencias para iniciar React. También omitía imágenes de marca. | La instalación precarga referencias JS/CSS del HTML y recursos de marca; cambia caché a v5. Prueba del evento install con Cache API simulada. Falta comprobación offline en navegador real. |
| AV-07 | Alta | `components/dashboard.tsx`, `lib/storage.ts` | Dos pestañas abiertas por primera vez; una lee “sin datos” y otra guarda antes de la inicialización de la primera. El read seguido de write separado permitía sobrescribir la bitácora con el arreglo inicial. | Inicialización mediante una sola transacción de mutación. Se prueban inicialización paralela y dos inserciones simultáneas. |
| AV-08 | Media | `components/edit-observation.tsx`, `lib/tracking.ts` | Editar un registro antiguo sin planta, dosis o siembra. El formulario no permitía completar esos campos pero la validación los exigía, bloqueando toda corrección. | La corrección admite seguimiento ausente, conserva los campos originales y sigue validando fechas/medidas presentes. Nuevos registros siguen sujetos a requisitos completos. Prueba de compatibilidad y rechazo de altura negativa. |
| AV-09 | Media | `lib/backup.ts`, `components/backup-controls.tsx` | Importar JSON con visualMetrics=[null]. El validador no revisaba ese campo y el render posterior accedía a label/value de null. | Se valida la lista opcional y sus objetos antes de importar. Pruebas con null y tipos inválidos; se siguen rechazando URLs ejecutables. |
| AV-10 | Alta | `lib/cloud.ts` | Una cuenta supera el límite habitual de filas de PostgREST. La lectura sin paginar devolvía solo la primera página; desaparecía parte de la bitácora en pantalla/exports. | Páginas de 500 con orden estable por timestamp e ID. Prueba simulada con 1.001 registros. El despliegue Supabase debe admitir páginas de 500 o más; si tiene un máximo menor se debe ajustar pageSize. |
| AV-11 | Alta | `lib/cloud.ts`, `components/dashboard.tsx` | Abrir una edición y modificar el registro desde otra pestaña/dispositivo. Se podía reemplazar una versión más reciente con un objeto obsoleto; el upsert tampoco rechazaba una colisión de ID. | El dashboard detecta cambios desde la apertura. PATCH/DELETE condicionales por updated_at detectan cambios después de la lectura de nube; nuevas inserciones no usan upsert destructivo. Prueba de conflicto con retorno vacío y filtro de timestamp. Requiere el trigger SQL incluido. |
| AV-12 | Alta | `components/auth-gate.tsx`, `lib/cloud.ts` | Cerrar sesión o cambiar de cuenta en una segunda pestaña. La primera conservaba el dashboard de la cuenta anterior mientras las operaciones consultaban los nuevos tokens de localStorage. | Escucha cambios de sesión y recarga al cambiar identidad o cerrar sesión. La renovación del token de la misma cuenta no recarga ni descarta borradores. Se prueba la decisión de identidad; falta interacción real entre pestañas. |
| AV-13 | Media | `lib/cloud.ts` | Un fallo de lectura de IndexedDB era convertido a arreglo vacío y podía marcarse la migración como completa; un fallo de persistencia del propietario permitía continuar sin aislamiento confirmado. | No se oculta el fallo de lectura. Si no puede establecerse propietario, no se copian datos locales a la cuenta. Verificación por código y TypeScript. |
| AV-14 | Crítica según avisos del registro | `package.json`, `package-lock.json` | npm audit detectó 7 paquetes afectados: DOMPurify, jsPDF, Next, PostCSS, postcss-selector-parser, source-map-js y Zod. Esto acredita versiones afectadas, no explotación de cada aviso en esta aplicación. | Actualización compatible con el código y build; instalación limpia reproducida. Auditoría final: 0 vulnerabilidades conocidas por npm al ejecutarse. No equivale a ausencia de todos los defectos posibles. |
| AV-15 | Alta para habilitar nube | `supabase/personal-account.sql`, `.env.example` | La pantalla exigía ejecutar un SQL que no existía en el ZIP; faltaban además las variables públicas de Supabase en el ejemplo. La configuración documentada no podía completarse. | Se incluye tabla, timestamp para concurrencia, RLS por propietario y bucket privado con políticas de carpeta. **Entregado sin ejecutar en Supabase**: seguridad efectiva y compatibilidad pendientes de una base real. |
| AV-16 | Media | `scripts/build-site.mjs` | Ejecutar build:site desde el ZIP. Intentaba copiar .openai/hosting.json inexistente al final del proceso, haciendo fallar el empaquetado. | Copia opcional con mensaje explícito si falta destino. Build del adaptador y smoke test del Worker completados, sin publicación. |
| AV-17 | Baja | `components/auth-gate.tsx`, `components/dashboard.tsx` | En nube la interfaz afirmaba siempre estar sincronizada y el pie aseguraba guardado local, incluso con carga fallida. | Etiquetas de modo y referencia al estado real del dashboard. Se conserva el indicador de última sincronización efectiva. Verificación por código/build. |
| AV-18 | Baja | `README.md`, `LEEME_PRIMERO.txt`, `.github/workflows/ci.yml` | README mencionaba ocho registros inexistentes, tamaños antiguos, ausencia de cuentas, un índice comparativo eliminado y un archivo de inicio ausente. CI solo atendía pushes de una rama de arreglo. | Documentación ajustada al código actual, guía inicial incluida y CI en main/PR a main. No se ejecutó GitHub Actions: se ejecutaron localmente sus comprobaciones. |

## Archivos modificados y motivo

| Archivo | Motivo |
|---|---|
| `.env.example` | Incluir configuración pública de nube sin credenciales. |
| `package.json`, `package-lock.json` | Actualizar dependencias con avisos, tipos React, mínimo Node y agregar IndexedDB emulado para regresión. |
| `tsconfig.json`, `next-env.d.ts` | Ajustes de JSX y tipos generados por la nueva versión de Next. |
| `components/dashboard.tsx` | Inicialización atómica, destino exclusivo de respaldo, CSV completo, detección de edición obsoleta y texto de almacenamiento correcto. |
| `components/auth-gate.tsx` | Invalidar interfaz al cambiar cuenta en otra pestaña; no afirmar sincronización antes de comprobarla. |
| `components/backup-controls.tsx` | Esperar restauración y permitir respaldos de fotos privadas autorizadas. |
| `components/edit-observation.tsx` | Permitir corrección compatible de registros antiguos. |
| `lib/backup.ts` (nuevo) | Extraer validación reutilizable e inspeccionar visualMetrics. |
| `lib/storage.ts` | Inicializar/restaurar dentro de transacciones y compartir lógica de fusión por ID. |
| `lib/tracking.ts` | Validación opcional de corrección antigua, preservando validación de datos presentes. |
| `lib/cloud.ts` | Paginación, timeout de 30 s en fetch, validación de lecturas, restauración exclusiva, conflictos de edición/eliminación, aislamiento de migración y decisión de cambio de identidad. |
| `lib/exports.ts` | Identidad de planta correcta en PDF, análisis IA en informe y separación de generación/descarga para verificar el PDF. |
| `public/sw.js` | Precargar arranque completo y marca antes del uso sin conexión. |
| `supabase/personal-account.sql` (nuevo) | Completar la instalación de la integración de nube y el control de versiones de filas. |
| `scripts/build-site.mjs` | Alinear build Webpack y admitir ausencia de configuración privada de hosting. |
| `tests/analysis.test.ts` | Añadir rechazo de método/tipo/tamaño, timeout y límite de solicitudes. |
| `tests/cloud.test.ts` (nuevo) | Comprobar respaldo exclusivo, error de escritura, paginación, conflicto, URLs permitidas y cambio de identidad. |
| `tests/regression.test.ts` (nuevo) | Concurrencia IndexedDB, restauración atómica, compatibilidad antigua, validación, fechas, crecimiento y archivos CSV/PDF. |
| `tests/service-worker.test.ts` (nuevo) | Comprobar precarga durante la primera instalación del worker. |
| `.github/workflows/ci.yml` | Ejecutar CI al actualizar main, además de PR. |
| `README.md`, `LEEME_PRIMERO.txt`, este informe | Instrucciones y evidencia coherentes con el producto entregado. |

## Resultados de verificaciones

Entorno: Linux, Node.js 24.22.1, npm 11.9.0. No se agregaron credenciales reales ni se hicieron llamadas facturables a proveedores.

| Verificación | Resultado real |
|---|---|
| Instalación original con npm ci | Correcta; 176 paquetes instalados. |
| TypeScript original | Correcto. |
| Pruebas originales | 22/22 correctas. No cubrían los fallos reparados de respaldo/PDF/arranque offline. |
| Build original de producción | Correcto con Next 14.2.35. |
| Instalación limpia final con npm ci | Correcta; 180 paquetes instalados y lockfile reproducible en este entorno. |
| npm run typecheck final | Correcto. |
| npm test final | **41/41 correctas**, sin pruebas omitidas. Incluye 19 regresiones adicionales a las 22 originales. |
| npm run build final | Correcto con Next 16.4.3/Webpack, revisión TypeScript y generación de rutas. |
| npm audit final | **0 vulnerabilidades conocidas**: 0 críticas, 0 altas, 0 moderadas, 0 bajas. |
| Servidor de producción / HTTP | Arranque correcto. GET / = 200; ocho recursos JS/CSS iniciales = 200; worker, foto y marca = 200. |
| API real del servidor sin claves | GET configuración = 200 con configured=false. POST = 503 ENGINE_NOT_CONFIGURED y sin diagnóstico simulado. |
| npm run build:site | Correcto: 44 recursos y Worker ESM; no se publicó. |
| Worker empaquetado | Smoke test directo de GET interfaz/recursos = 200; GET estado sin clave y POST 503 comprobados. |
| Exportación | Se generaron PDF reales en memoria y CSV Blob; se comprobaron separación de plantas, detalles de IA y protección de fórmulas. No se hizo inspección visual del PDF. |
| Supabase y proveedores de IA | Pruebas con respuestas simuladas y IndexedDB emulado. No hay comprobación de servicio real. |
| Navegador | Playwright estaba disponible como biblioteca, pero faltaba su ejecutable Chromium. La descarga devolvió un archivo incompleto y no pudo instalarse. No se afirma validación visual ni end-to-end de escritorio/móvil. |

Durante el trabajo hubo comprobaciones intermedias fallidas por ajustes de los nuevos tests y por archivos de dependencias que se estaban actualizando; se corrigieron y se repitió una instalación limpia. Los resultados anteriores son los finales. El log esperado de pruebas incluye errores de proveedor deliberadamente simulados: no son fallos de la suite.

## Limitaciones y riesgos pendientes

1. **Servicios reales y RLS:** faltan URL y credenciales del proyecto propio. No se ejecutó el SQL en PostgreSQL/Supabase ni se verificaron con dos usuarios las políticas de acceso, las URLs firmadas, correo de confirmación y recuperación, carga de fotos o renovación de sesión. Una política permisiva anterior puede combinarse con la incluida; revisar antes de operar. El SQL no borra los datos existentes, pero tampoco migra automáticamente cualquier esquema previo incompatible.
2. **Concurrencia distribuida:** el control condicional protege cambios de una misma fila. Crear simultáneamente desde dos dispositivos observaciones con IDs diferentes para la misma planta/fecha todavía requiere una restricción o transacción de servidor específica del dominio. La consistencia de tratamiento entre filas también depende de validación cliente. No se garantiza atomicidad de una restauración de muchas filas en nube; puede haber progreso parcial. La paginación no es una instantánea transaccional si otros dispositivos escriben mientras se descargan páginas.
3. **Autenticación de la API de IA:** la cuenta Supabase no protege automáticamente el endpoint. Un cliente no navegador puede llamar sin Origin y los identificadores/cabeceras de cliente se pueden falsificar según el proxy. El límite en memoria es por instancia y no sustituye autenticación de servidor ni limitación distribuida. El proyecto sigue preparado para uso local; no se publicó ningún servidor de pago.
4. **Trabajo offline de nube:** no existe cola de escrituras ni réplica persistente por usuario. El worker solo conserva la interfaz. Las fotos firmadas requieren red y vencen tras una hora. En local, IndexedDB puede perderse por borrado o políticas del navegador; el respaldo es necesario. BroadcastChannel requiere soporte del navegador.
5. **Fotos:** no se probó decodificación real de cámara, HEIC o imágenes con EXIF en móviles. Se inspeccionan tipos/tamaños y firma, pero no se garantiza que el servidor decodifique completamente el archivo antes de enviarlo al proveedor. Las fotos privadas pueden quedar huérfanas en Storage al eliminar una observación o fallar una escritura posterior a la carga; no se implementó una limpieza que pudiera borrar fotos aún referenciadas.
6. **Interfaz y exportación visual:** formularios, filtros y navegación se revisaron en el código; no se pudieron accionar en navegador. Quedan pendientes foco/modal, controles táctiles, tamaños 360/390/768/1440, desplazamiento y diseño visual del PDF con textos extensos. Las pruebas de PDF son funcionales, no de apariencia.
7. **Modelos y agronomía:** Gemini 3.8 Flash figura en la documentación oficial consultada, pero eso no acredita acceso o cuota en la cuenta del usuario. No se comprobó la calidad agronómica de una salida real. No se consultan fuentes web durante el análisis de fotos.
8. **Sesiones y XSS:** los tokens de Supabase se guardan en localStorage, como en la implementación original. Un XSS en el mismo origen podría acceder a ellos. React escapa textos y no se utiliza HTML importado para mostrar notas; esto no es una auditoría de penetración completa ni una certificación de seguridad.
9. **Comparativas:** la interfaz no ofrece todas las funciones antiguas anunciadas (índice de rendimiento, ordenamiento interactivo de columnas y filtro dedicado de cultivo/origen). No se reintrodujeron funciones inexistentes como si fueran reparaciones. La identidad y agrupación sí separan cultivos. `exportSimpleCsv` se conserva como función auxiliar, pero el botón principal usa ahora la exportación completa.
10. **Adaptador opcional:** probado como build/Worker local, no en el proveedor de hosting. Las variables públicas deben proporcionarse al proceso; la copia de exportación no incluye `.env.local`. La configuración del alojamiento y sus límites siguen pendientes.

## Repetir la verificación

```bash
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Entrar a http://localhost:3000. Para IA y Supabase seguir README.md; no hay secretos incluidos. Para comprobar modo offline, usar producción, esperar `navigator.serviceWorker.ready`, desconectar la red y recargar. Para PDF offline, exportar una vez conectado antes de probar sin conexión.

## Fuentes externas consultadas

- Modelo Gemini: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Actualización del framework: https://nextjs.org/docs/app/guides/upgrading/version-16
- Avisos de dependencias: resultado real de npm audit del lockfile inicial y final; los avisos se atribuyen a versiones instaladas, no a ataques ejecutados.

El ZIP excluye node_modules, .next, dist, copias temporales del adaptador, caches, tsbuildinfo y archivos .env privados. Incluye código, recursos públicos, pruebas, lockfile, guía, ejemplo de variables y script SQL para completar la configuración de nube.

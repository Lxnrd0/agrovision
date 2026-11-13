# Objetivo y observaciones técnicas — AgroVisión / TerraNova 1.2.1

## 1. Objetivo general de la aplicación

AgroVisión / TerraNova tiene como objetivo registrar y organizar observaciones de cultivos durante su desarrollo, conservar fotografías y mediciones, analizar imágenes de forma orientativa y comparar tratamientos agrícolas utilizando datos trazables. La aplicación debe distinguir mediciones manuales de estimaciones de IA, excluir registros demostrativos de los resultados reales y comunicar cuando la muestra no es suficiente para declarar un tratamiento ganador.

## 2. Objetivo de la intervención 1.2.1

Fortalecer la seguridad, la integridad y la mantenibilidad del repositorio 1.2.0 sin reconstruir el sistema ni alterar innecesariamente los flujos de trabajo existentes. La intervención se centra en autenticar las solicitudes de análisis, validar datos también en PostgreSQL, evitar comparaciones que mezclen tratamientos, optimizar la recuperación de fotografías y mantener una bitácora legible en laptop y celular.

## 3. Observaciones técnicas identificadas

1. El endpoint de análisis permitía solicitudes sin credenciales cuando `ANALYSIS_ACCESS_TOKEN` no estaba configurado.
2. En modo nube, el endpoint no verificaba el JWT de Supabase contra Auth; recibía un bearer token, pero no comprobaba su identidad.
3. El límite de solicitudes estaba en memoria por instancia y aceptaba `x-client-id` como identidad, una cabecera controlable por el cliente.
4. La tabla `agrovision_members` se utilizaba desde las funciones de comparación, pero no estaba definida en el script base de cuenta personal.
5. Las comprobaciones de membresía no siempre consideraban conjuntamente `project_id` y `user_id`, y el registro automático permitía incorporarse conociendo el identificador público del proyecto.
6. Las validaciones de medidas, fechas, duplicados y tratamiento se aplicaban principalmente desde la interfaz.
7. La sincronización podía solicitar URLs firmadas de fotografías repetidamente y en paralelo sin límite.
8. Las altas, ediciones y eliminaciones múltiples se ejecutaban como varias peticiones REST independientes.
9. El cálculo SQL de crecimiento podía relacionar primera y última medición aunque el tratamiento hubiera cambiado entre registros.
10. La bitácora móvil utilizaba una imagen más alta y una jerarquía tipográfica distinta de la tarjeta de escritorio; el filtro de estado también tenía una opción duplicada.
11. La documentación de versiones anteriores contenía afirmaciones que no correspondían al código entregado en 1.2.0.

## 4. Correcciones incorporadas al código

- Autenticación del endpoint por JWT validado en Supabase Auth o código local de al menos 32 caracteres.
- Rechazo de solicitudes sin mecanismo de autenticación configurado.
- Comparación en tiempo constante del código local.
- Rate limit por identidad, con soporte opcional de Upstash Redis y fallback por instancia documentado.
- Cabeceras de seguridad HTTP y Content Security Policy.
- Definición de membresías explícitas por proyecto y usuario, bloqueo RLS de cuentas no inscritas y detección de duplicados antes de crear el índice único.
- Validación de fechas, medidas, duplicados por planta/fecha y consistencia del tratamiento en un trigger SQL.
- RPC transaccional para altas, ediciones y eliminaciones con control optimista mediante `updated_at`.
- Cálculo SQL de crecimiento restringido a mediciones del mismo tratamiento.
- Caché de URLs firmadas por usuario y ruta, renovación anticipada y concurrencia máxima de ocho firmas simultáneas.
- Tarjetas de bitácora más compactas y homogéneas, con datos detallados conservados en la vista expandida.
- Eliminación de la opción duplicada en el filtro de salud.

## 5. Objetivos específicos y criterios observables

| Objetivo específico | Indicador de aceptación |
|---|---|
| Proteger el análisis IA | Sin token: 401; JWT inválido: 401; auth sin configurar: 503 |
| Evitar uso no autorizado de datos | RLS y RPC respetan `auth.uid()` y el proyecto solicitado |
| Mantener integridad de mediciones | Rechazo de medidas inválidas, fechas inconsistentes y duplicados |
| Evitar mezclar tratamientos | La velocidad de crecimiento solo usa primera y última medición del mismo tratamiento |
| Reducir solicitudes de imágenes | URL firmada vigente reutilizada; renovación al vencer |
| Hacer operaciones masivas consistentes | La RPC revierte el lote completo ante un conflicto |
| Mejorar bitácora móvil | Tarjeta sin desbordamiento y con jerarquía visual coherente con escritorio |

## 6. Limitaciones pendientes de verificación

- No se ejecutaron las migraciones en la instancia Supabase real del propietario.
- La instalación de dependencias no pudo completarse en el entorno de preparación; se requiere Node.js 24 y acceso al registro npm para ejecutar toda la suite y el build.
- La autenticación Supabase del endpoint se verifica en servidor, pero el cliente todavía guarda la sesión en `localStorage`; no se ha migrado a cookies `HttpOnly`.
- El rate limit es distribuido únicamente si se configuran las credenciales Upstash. Sin ellas, el contador es por instancia.
- La carga de fotos a Storage antecede a la transacción de metadatos; un fallo posterior puede dejar un objeto sin referencia que deberá revisarse manualmente.
- La interfaz requiere prueba visual real en navegador y dispositivo móvil antes de liberar.
- La IA es orientativa; no confirma diagnósticos fitosanitarios ni sustituye mediciones manuales.

## 7. Conclusión

La versión 1.2.1 incorpora mejoras concretas de autenticación, integridad de datos, sincronización y presentación móvil. La liberación a producción queda condicionada a ejecutar `npm run verify` con Node 24, aplicar primero las migraciones en una instancia Supabase de pruebas y completar la validación de dos cuentas, Storage, publicación de resultados y bitácora móvil.

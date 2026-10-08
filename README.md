# Inicio rápido

Lee `LEEME_PRIMERO.txt`. Proyecto Next.js completo; clave privada no incluida.

# AgroVision — Sistema Inteligente de Monitoreo y Análisis Agrícola

Plataforma en español para observar rábanos y otras hortalizas, analizar fotografías y registrar el trabajo de campo.

## Abrir en Visual Studio Code

Requisitos: Node.js 20 o superior y npm. Descomprime este proyecto y abre su carpeta en VS Code.

```bash
npm install
npm run dev
```

Abre http://localhost:3000. No necesitas una clave para explorar la demostración, crear registros, comparar muestras ni exportar datos.

Para verificar y ejecutar la versión de producción:

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Activar Gemini real (nivel gratuito sujeto a cuota)

1. Crea una clave en [Google AI Studio](https://aistudio.google.com/apikey). El acceso gratuito tiene límites por modelo y proyecto; la cuota activa se consulta en AI Studio.
2. Abre `.env.local` en la carpeta `agrovision` y pega la clave:

```dotenv
GEMINI_API_KEY=tu_clave_de_google_ai_studio
GEMINI_MODEL=gemini-3.1-flash-lite
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ANALYSIS_ACCESS_TOKEN=
```

3. Guarda y reinicia el servidor (`Ctrl+C`, luego `npm run dev`). El selector **Gemini · Visión IA** viene seleccionado por defecto. Carga una foto y pulsa **Analizar cultivo**.

El servidor prioriza Gemini cuando encuentra `GEMINI_API_KEY`; si no está configurada, usa OpenAI cuando `OPENAI_API_KEY` exista. Las claves permanecen en el servidor y nunca llevan prefijo `NEXT_PUBLIC_`. La cuota gratuita no es ilimitada y puede cambiar o agotarse; Google indica que el contenido del nivel gratis puede utilizarse para mejorar sus productos. Evita enviar fotos confidenciales. Crear una clave no evita las cuotas.

`ANALYSIS_ACCESS_TOKEN` es opcional. Si lo defines, introduce el mismo token en **Configuración → Código de acceso**. El navegador solo lo mantiene en memoria hasta recargar. Antes de exponer un servidor con API de pago a una audiencia pública, integra autenticación de usuarios y un límite compartido de peticiones. El límite incluido es de 10 solicitudes/minuto por cliente por instancia; no es distribuido. Este ZIP está preparado para ejecución local.

## Funcionalidades

- React 18 + **Next.js 14.2.35 App Router**, TypeScript, Tailwind CSS y Lucide React.
- Tema oscuro por defecto y tema claro persistente; diseño adaptable a móvil, tableta y escritorio.
- Carga y arrastre de JPG, PNG y WEBP, máximo 8 MB. Conversión local a JPEG de hasta 1600 píxeles, sin metadatos originales.
- Selector explícito de demostración o IA real; animación de escaneo mientras se espera la respuesta. La animación no representa progreso del proveedor.
- Diagnóstico estructurado: cultivo, colores, hojas, diámetro, estado, confianza, observaciones, recomendaciones y limitaciones.
- Uso del diagnóstico en un reporte, registro manual, adjunto, búsqueda, filtros, detalle y eliminación con confirmación.
- Comparativa de tratamientos con filtros de cultivo, lote y origen, ordenamiento por columna, clasificación automática y gráfico de diámetro.
- Cuatro protocolos interactivos de buenas prácticas.
- Exportación de toda la bitácora a CSV y PDF con diagnósticos completos. Las imágenes se conservan en la bitácora y no se incrustan en las exportaciones.
- IndexedDB para registros e imágenes; BroadcastChannel y transacciones para sincronización entre pestañas del mismo navegador.
- Registro sin conexión una vez cargada la aplicación. La versión de producción incluye service worker para volver a abrir la interfaz sin conexión después de una primera visita. El análisis real siempre requiere internet. PDF sin conexión requiere que sus módulos se hayan cargado anteriormente.

## Persistencia y datos de ejemplo

La primera apertura crea 8 registros ilustrativos, todos etiquetados **Ejemplo**. Se pueden eliminar. Una bitácora vacía se mantiene vacía al recargar. Los diagnósticos simulados están expresamente identificados y no dependen del contenido de la foto. Los registros manuales y reales preservan su origen.

El almacenamiento es local al navegador y origen. No existe un servidor de reportes ni sincronización multiusuario o entre dispositivos. La URL publicada y localhost tienen bitácoras independientes. Puedes compartir las exportaciones con tu equipo. Borrar datos del navegador elimina la bitácora local.

## Interpretación de resultados

- Una foto no confirma una enfermedad. **Sano** significa aspecto visual saludable; **Enfermo** indica signos visuales que requieren verificación. **Indeterminado** se conserva cuando no hay evidencia suficiente.
- `confidence` es una estimación del modelo, no una probabilidad agronómica calibrada.
- Sin una referencia métrica declarada y visible, el servidor devuelve `diameterCm: null`. El prompt exige verificar la escala y no asumirla.
- El estado del motor distingue demostración, configuración disponible y procesamiento. “Listo” indica una clave configurada; su validez se comprueba al solicitar el análisis. El indicador de guardado se refiere al almacenamiento local, no a una nube.
- Índice descriptivo (0–100): 60% del diámetro medio del grupo dividido por el mayor diámetro del conjunto filtrado + 40% de la proporción de plantas sanas. No es producción en kg/ha ni evidencia causal de la eficacia del fertilizante. Diámetros nulos se excluyen del promedio y estados indeterminados del porcentaje de salud. Si no hay medidas o estados evaluables, no se calcula el índice. Compara cultivos y condiciones semejantes.

## Estructura

```text
app/
  layout.tsx                  Metadatos, idioma y estilos
  page.tsx                    Página principal
  globals.css                 Tokens y diseño adaptable
  api/analyze-crop/route.ts    GET configuración / POST análisis real
components/
  dashboard.tsx               Estado, navegación, métricas y sincronización
  analysis-panel.tsx          Carga, procesamiento y diagnóstico
  report-form.tsx             Formulario de campo
  history.tsx                 Galería, filtros y detalle
  comparison.tsx              Tabla, ordenamiento y gráfico
  protocols.tsx               Buenas prácticas
  ui.tsx                     Diálogo accesible, badges y notificaciones
lib/
  analysis-server.ts          Validación y conexión segura con Gemini/OpenAI
  types.ts                    Tipos compartidos
  storage.ts                  IndexedDB, transacciones y preparación de imagen
  metrics.ts                  Métricas e índice comparativo
  exports.ts                  Exportación CSV/PDF
  demo.ts                     Datos de demostración
public/
  icon.svg                    Identidad visual
  radish-sample.jpg            Fotografía de ejemplo
  sw.js                       Soporte sin conexión en producción
tests/
  analysis.test.ts            Contrato y errores del servicio (proveedor simulado)
  metrics.test.ts             Métricas, agrupación y seguridad CSV
scripts/
  build-site.mjs              Adaptador de publicación opcional
  worker-entry.ts             Worker con el mismo manejador de API
.env.example
package.json
package-lock.json
```

## Contrato de la API

`GET /api/analyze-crop` devuelve `{ configured, provider, model, requiresToken }` sin secretos. Gemini se prefiere cuando se configura `GEMINI_API_KEY`; OpenAI sigue disponible como alternativa.

`POST /api/analyze-crop` recibe `Content-Type: application/json`:

```json
{
  "image": "data:image/jpeg;base64,...",
  "crop": "Rábano",
  "scaleReference": "Regla de 10 cm visible junto al bulbo"
}
```

Respuesta correcta:

```json
{
  "source": "gemini",
  "model": "gemini-3.1-flash-lite",
  "analyzedAt": "2026-09-24T12:00:00.000Z",
  "diagnosis": {
    "crop": "Rábano",
    "bulbColor": "Rojo",
    "leafColor": "Verde",
    "leafCount": 6,
    "diameterCm": null,
    "health": "Indeterminado",
    "confidence": 60,
    "observations": ["Ejemplo de estructura, no diagnóstico real."],
    "recommendations": ["Verificar la planta en campo."],
    "limitations": ["No hay escala visible suficiente."]
  }
}
```

Errores: 400 entrada inválida, 401 token de acceso incorrecto, 403 origen no permitido, 415 tipo de contenido incorrecto, 422 interpretación rechazada/incompleta, 429 cuota o límite, 502 respuesta inválida/error del proveedor, 503 clave sin configurar, 504 timeout. Se limita el cuerpo a 7,1 MB después de la conversión cliente y se comprueba la firma JPEG/PNG/WEBP. Timeout del proveedor: 55 segundos. El servidor no guarda fotografías ni registra claves.

El backend usa Gemini `generateContent` con foto en línea y JSON estructurado; valida la respuesta con Zod. OpenAI Chat Completions está disponible como alternativa. No emplea respuestas simuladas como fallback para errores de la API real.

## Publicación

El flujo habitual de Next.js es `npm run build` y `npm start`. Puede desplegarse en un servidor compatible con Next.js 14 configurando las variables de entorno.

El adaptador opcional `npm run build:site` exporta la interfaz desde una copia temporal e incorpora el mismo manejador de API en un Worker ESM. No modifica el endpoint original de Next.js. Esta ruta empaqueta los recursos públicos en el Worker para una publicación autocontenida. Este ZIP no incluye credenciales ni configuración privada de publicación.

Next.js 14 se conserva por el requisito solicitado; evalúa una migración a una rama con soporte vigente antes de una operación pública de largo plazo. No se implementan cuentas multiusuario, sensores IoT ni una base de datos compartida.

## Validación de la entrega

Se incluyen comprobación de TypeScript, compilación de producción y pruebas del contrato del servidor con el proveedor simulado. El análisis real requiere la clave del usuario; no se afirma una prueba en vivo sin credenciales. La infraestructura de navegador de esta sesión no proporciona el flujo de inspección visual habilitado, por lo que no se declara una prueba de interfaz en navegador.

## Fuentes y créditos

- Gemini: [modelo Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [cuotas](https://ai.google.dev/gemini-api/docs/rate-limits), [precios y nivel gratuito](https://ai.google.dev/gemini-api/docs/pricing).
- Next.js: [Actualización de seguridad de la rama 14](https://nextjs.org/blog/security-update-2025-12-11).
- Fotografía: **Omar Roque**, [Unsplash](https://unsplash.com/photos/a-bunch-of-radishes-sitting-on-top-of-green-leaves-qGTl7GssT5w), Unsplash License. Fotografía real usada como muestra visual; las cifras de demostración son ilustrativas.

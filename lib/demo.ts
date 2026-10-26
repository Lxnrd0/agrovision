
import type { Diagnosis, FieldRecord } from "./types";

export const demoDiagnosis: Diagnosis = {
  crop: "Rábano · Raphanus sativus",
  bulbColor: "Rojo carmín",
  leafColor: "Verde intenso",

  visualMetrics: [
    {
      label: "Estado del follaje",
      value: "Verde intenso en el ejemplo ilustrativo.",
    },
    {
      label: "Raíz engrosada visible",
      value: "Color rojo carmín en el ejemplo ilustrativo.",
    },
    {
      label: "Daño foliar",
      value: "Sin daño evidente en el ejemplo simulado.",
    },
    {
      label: "Desarrollo aparente",
      value: "Resultado ilustrativo; no es una medición real.",
    },
  ],

  leafCount: 7,
  diameterCm: 3.8,
  health: "Sano",
  confidence: 94,

  observations: [
    "Bulbo de color uniforme, sin lesiones visibles en la muestra de ejemplo.",
    "Hojas de apariencia turgente y desarrollo foliar equilibrado.",
    "Sin señales evidentes de daño por insectos en este registro ilustrativo.",
  ],

  recommendations: [
    "Mantener un registro fotográfico bajo condiciones de luz similares.",
    "Verificar humedad del suelo antes del siguiente riego.",
  ],

  limitations: [
    "Resultado simulado: no es un análisis de la fotografía.",
    "Diámetro ilustrativo; el análisis real requiere una referencia de escala.",
    "La confianza del modelo no es una probabilidad clínica ni agronómica calibrada.",
  ],
};

export const demoRecords: FieldRecord[] = [];

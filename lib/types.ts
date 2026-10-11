export type PlantHealth = "Sano" | "Enfermo" | "Indeterminado";

export type Diagnosis = {
  crop: string;
  bulbColor: string;
  leafColor: string;
  leafCount: number | null;
  diameterCm: number | null;
  health: PlantHealth;
  confidence: number;
  observations: string[];
  recommendations: string[];
  limitations: string[];
};

export type MeasurementSource = "manual" | "ia" | "unknown";

export type FieldRecord = Diagnosis & {
  id: string;

  // Observaciones originales del análisis de IA.
  aiObservations?: string[];

  // Datos de seguimiento de la planta.
  // Opcionales para conservar registros antiguos.
  plantId?: string;
  sowingDate?: string;
  dose?: string;
  heightCm?: number | null;

  // Origen de cada medida.
  measurementSources?: Partial<
    Record<
      "diameterCm" | "heightCm" | "leafCount",
      MeasurementSource
    >
  >;

  // Estimaciones originales de IA.
  estimatedDiameterCm?: number | null;
  estimatedLeafCount?: number | null;

  collaborator: string;
  date: string;
  zone: string;
  fertilizer: string;
  image: string;
  source: "demo" | "manual" | "openai" | "gemini";
  createdAt: string;
};

export type View =
  | "analysis"
  | "history"
  | "comparison"
  | "protocols";

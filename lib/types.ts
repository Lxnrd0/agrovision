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

  // Identificación y seguimiento de la planta.
  // Son opcionales para conservar los registros antiguos.
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

  // Estimaciones originales para contrastarlas
  // con las mediciones manuales.
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

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
export type FieldRecord = Diagnosis & {
  id: string;
  collaborator: string;
  date: string;
  zone: string;
  fertilizer: string;
  image: string;
  source: "demo" | "manual" | "openai" | "gemini";
  createdAt: string;
};
export type View = "analysis" | "history" | "comparison" | "protocols";

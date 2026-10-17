import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

export type EngineEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ANALYSIS_ACCESS_TOKEN?: string;
};

const diagnosisSchema = z.object({
  crop: z.string().max(200),
  bulbColor: z.string().max(200),
  leafColor: z.string().max(200),
  leafCount: z.number().int().min(0).max(10000).nullable(),
  diameterCm: z.number().positive().max(1000).nullable(),
  health: z.enum(["Sano", "Enfermo", "Indeterminado"]),
  confidence: z.number().min(0).max(100),
  observations: z.array(z.string().max(1000)).max(12),
  recommendations: z.array(z.string().max(1000)).max(12),
  limitations: z.array(z.string().max(1000)).max(12),
});

const inputSchema = z.object({
  image: z
    .string()
    .max(7_000_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/),
  crop: z.string().trim().max(100).default("Rábano"),
  scaleReference: z.string().max(250).optional(),
});

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    crop: { type: "string" },
    bulbColor: { type: "string" },
    leafColor: { type: "string" },
    leafCount: { type: ["integer", "null"] },
    diameterCm: { type: ["number", "null"] },
    health: {
      type: "string",
      enum: ["Sano", "Enfermo", "Indeterminado"],
    },
    confidence: { type: "number" },
    observations: {
      type: "array",
      items: { type: "string" },
    },
    recommendations: {
      type: "array",
      items: { type: "string" },
    },
    limitations: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "crop",
    "bulbColor",
    "leafColor",
    "leafCount",
    "diameterCm",
    "health",
    "confidence",
    "observations",
    "recommendations",
    "limitations",
  ],
};

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function status(env: EngineEnv) {
  return Response.json(
    {
      configured: !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY),
      provider: env.GEMINI_API_KEY ? "Gemini" : "OpenAI",
      model: env.GEMINI_API_KEY
        ? env.GEMINI_MODEL || "gemini-2.5-flash"
        : env.OPENAI_MODEL || "gpt-4o",
      requiresToken: !!env.ANALYSIS_ACCESS_TOKEN,
    },
    { headers },
  );
}

const requests = new Map<
  string,
  { time: number; count: number }

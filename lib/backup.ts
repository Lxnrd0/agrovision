import type { FieldRecord } from "./types";
import { daysBetween } from "./tracking";

export function isObject(
  input: unknown,
): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input)
  );
}

export function isRecord(input: unknown): input is FieldRecord {
  if (!isObject(input)) return false;

  const strings = [
    "id",
    "date",
    "collaborator",
    "zone",
    "fertilizer",
    "crop",
    "bulbColor",
    "leafColor",
    "image",
    "createdAt",
  ];

  if (strings.some((key) => typeof input[key] !== "string")) {
    return false;
  }

  if (!(input.id as string).trim()) return false;

  if (
    !Number.isFinite(
      daysBetween(input.date as string, input.date as string),
    )
  ) {
    return false;
  }

  if (!Number.isFinite(Date.parse(input.createdAt as string))) {
    return false;
  }

  if (
    !["Sano", "Enfermo", "Indeterminado"].includes(
      String(input.health),
    )
  ) {
    return false;
  }

  if (
    !["manual", "gemini", "openai", "demo"].includes(
      String(input.source),
    )
  ) {
    return false;
  }

  if (
    typeof input.confidence !== "number" ||
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 100
  ) {
    return false;
  }

  for (const key of [
    "observations",
    "recommendations",
    "limitations",
  ]) {
    const list = input[key];

    if (
      !Array.isArray(list) ||
      list.some((item) => typeof item !== "string")
    ) {
      return false;
    }
  }

  for (const key of ["plantId", "sowingDate", "dose"]) {
    if (
      input[key] !== undefined &&
      typeof input[key] !== "string"
    ) {
      return false;
    }
  }

  for (const key of [
    "heightCm",
    "leafCount",
    "diameterCm",
    "estimatedDiameterCm",
    "estimatedLeafCount",
  ]) {
    const measure = input[key];

    if (measure == null) continue;

    if (
      typeof measure !== "number" ||
      !Number.isFinite(measure) ||
      measure < 0
    ) {
      return false;
    }

    if (
      (key === "leafCount" || key === "estimatedLeafCount") &&
      !Number.isInteger(measure)
    ) {
      return false;
    }
  }

  if (input.measurementSources !== undefined) {
    if (!isObject(input.measurementSources)) return false;

    for (const [key, source] of Object.entries(
      input.measurementSources,
    )) {
      if (
        !["heightCm", "leafCount", "diameterCm"].includes(key) ||
        !["manual", "ia", "unknown"].includes(String(source))
      ) {
        return false;
      }
    }
  }

  if (
    input.aiObservations !== undefined &&
    (
      !Array.isArray(input.aiObservations) ||
      input.aiObservations.some(
        (item) => typeof item !== "string",
      )
    )
  ) {
    return false;
  }

  if (input.visualMetrics !== undefined && (
    !Array.isArray(input.visualMetrics) ||
    input.visualMetrics.length > 4 ||
    input.visualMetrics.some((metric) => !isObject(metric) ||
      typeof metric.label !== "string" || typeof metric.value !== "string")
  )) return false;

  const photo = input.image as string;

  if (
    photo &&
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(
      photo,
    )
  ) {
    return false;
  }

  return true;
}


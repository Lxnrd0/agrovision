
import type { FieldRecord } from "./types";

export type Metric = "diameterCm" | "heightCm" | "leafCount";

function normalizeKey(value: string | undefined | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function daysBetween(a: string, b: string): number {
  function parse(date: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;

    const timestamp = Date.parse(`${date}T00:00:00Z`);

    if (!Number.isFinite(timestamp)) return NaN;

    const normalized = new Date(timestamp)
      .toISOString()
      .slice(0, 10);

    return normalized === date ? timestamp : NaN;
  }

  const start = parse(a);
  const end = parse(b);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return NaN;
  }

  return (end - start) / 86400000;
}

export function age(record: FieldRecord): number | null {
  const days = daysBetween(
    record.sowingDate || "",
    record.date,
  );

  return Number.isFinite(days) && days >= 0 ? days : null;
}

export function plantKey(record: FieldRecord): string {
  return JSON.stringify([
    normalizeKey(record.crop),
    normalizeKey(record.zone),
    normalizeKey(record.plantId),
    record.sowingDate || "",
  ]);
}

export function treatmentKey(record: FieldRecord): string {
  return JSON.stringify([
    normalizeKey(record.crop),
    normalizeKey(record.fertilizer),
    normalizeKey(record.dose),
  ]);
}

export function origin(
  record: FieldRecord,
  metric: Metric,
): string {
  return record.measurementSources?.[metric] || "unknown";
}

export function value(
  record: FieldRecord,
  metric: Metric,
): number | null {
  const measure = record[metric];

  if (
    typeof measure !== "number" ||
    !Number.isFinite(measure) ||
    measure < 0
  ) {
    return null;
  }

  if (metric === "diameterCm" && measure <= 0) {
    return null;
  }

  if (metric === "leafCount" && !Number.isInteger(measure)) {
    return null;
  }

  return measure;
}

export function eligible(record: FieldRecord): boolean {
  return (
    record.source !== "demo" &&
    !!record.plantId?.trim() &&
    !!record.dose?.trim() &&
    age(record) !== null
  );
}

export function validateRecord(
  record: FieldRecord,
  records: FieldRecord[],
  options: { allowLegacy?: boolean } = {},
): void {
  if (!options.allowLegacy && (
    !record.plantId?.trim() ||
    !record.sowingDate ||
    !record.dose?.trim()
  )) {
    throw new Error(
      "Completa planta, fecha de siembra y dosis con su unidad.",
    );
  }

  if (!Number.isFinite(daysBetween(record.date, record.date)) ||
      (record.sowingDate ? age(record) === null : !options.allowLegacy)) {
    throw new Error(
      "La observación debe ser posterior o igual a una fecha de siembra válida.",
    );
  }

  const metrics: Metric[] = [
    "diameterCm",
    "heightCm",
    "leafCount",
  ];

  for (const metric of metrics) {
    if (
      record[metric] != null &&
      value(record, metric) === null
    ) {
      throw new Error(
        "Revisa las medidas: diámetro positivo, altura no negativa y hojas enteras.",
      );
    }
  }

  const peers = records.filter(
    (previous) =>
      previous.id !== record.id &&
      previous.source !== "demo" &&
      record.source !== "demo" &&
      plantKey(previous) === plantKey(record),
  );

  if (peers.some((previous) => previous.date === record.date)) {
    throw new Error(
      "Esta planta ya tiene una observación en esa fecha. Corrígela desde Bitácora → Editar observación; registra otra visita usando su fecha real.",
    );
  }

  if (
    peers.some(
      (previous) =>
        treatmentKey(previous) !== treatmentKey(record),
    )
  ) {
    throw new Error(
      "Esta planta tiene otro tratamiento o dosis. Mantén su asignación para comparar.",
    );
  }
}

export function growth(
  record: FieldRecord,
  records: FieldRecord[],
  metric: Metric,
) {
  const currentValue = value(record, metric);

  if (
    !eligible(record) ||
    currentValue === null ||
    origin(record, metric) === "unknown"
  ) {
    return null;
  }

  const previous = records
    .filter(
      (candidate) =>
        eligible(candidate) &&
        plantKey(candidate) === plantKey(record) &&
        treatmentKey(candidate) === treatmentKey(record) &&
        candidate.date < record.date &&
        origin(candidate, metric) === origin(record, metric) &&
        value(candidate, metric) !== null,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!previous) return null;

  const previousValue = value(previous, metric);
  const days = daysBetween(previous.date, record.date);

  if (
    previousValue === null ||
    !Number.isFinite(days) ||
    days <= 0
  ) {
    return null;
  }

  const delta = currentValue - previousValue;

  return {
    delta,
    days,
    perDay: delta / days,
    previousDate: previous.date,
  };
}

export function calibration(records: FieldRecord[]) {
  const pairs = records.filter(
    (record) =>
      record.source !== "demo" &&
      origin(record, "diameterCm") === "manual" &&
      value(record, "diameterCm") !== null &&
      typeof record.estimatedDiameterCm === "number" &&
      Number.isFinite(record.estimatedDiameterCm) &&
      record.estimatedDiameterCm > 0,
  );

  if (!pairs.length) {
    return {
      n: 0,
      mae: null,
      bias: null,
      mape: null,
    };
  }

  const errors = pairs.map(
    (record) =>
      record.estimatedDiameterCm! - record.diameterCm!,
  );

  const mae =
    errors.reduce((sum, error) => sum + Math.abs(error), 0) /
    pairs.length;

  const bias =
    errors.reduce((sum, error) => sum + error, 0) /
    pairs.length;

  const mape =
    (pairs.reduce(
      (sum, record) =>
        sum +
        Math.abs(
          record.estimatedDiameterCm! - record.diameterCm!,
        ) /
          record.diameterCm!,
      0,
    ) /
      pairs.length) *
    100;

  return {
    n: pairs.length,
    mae,
    bias,
    mape,
  };
}

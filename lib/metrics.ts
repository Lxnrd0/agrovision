
import type { FieldRecord } from "./types";

import {
  age,
  eligible,
  plantKey,
  treatmentKey,
  origin,
  value,
} from "./tracking";

import type { Metric } from "./tracking";

// Estadísticas de una variable agrícola.
function statistics(values: number[]) {
  const n = values.length;

  if (n === 0) {
    return {
      n: 0,
      mean: null,
      min: null,
      max: null,
      standardDeviation: null,
    };
  }

  const mean =
    values.reduce((sum, number) => sum + number, 0) / n;

  const variance =
    n > 1
      ? values.reduce(
          (sum, number) => sum + (number - mean) ** 2,
          0,
        ) / (n - 1)
      : null;

  return {
    n,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    standardDeviation:
      variance === null ? null : Math.sqrt(variance),
  };
}

// Resumen general de la bitácora.
export function summary(records: FieldRecord[]) {
  const real = records.filter(
    (record) => record.source !== "demo",
  );

  const measured = real.filter(
    (record) =>
      origin(record, "diameterCm") === "manual" &&
      value(record, "diameterCm") !== null,
  );

  const assessed = real.filter(
    (record) =>
      record.health === "Sano" ||
      record.health === "Enfermo",
  );

  const diameters = measured
    .map((record) => value(record, "diameterCm"))
    .filter(
      (measure): measure is number => measure !== null,
    );

  return {
    count: records.length,
    realCount: real.length,

    diameter: statistics(diameters).mean ?? 0,

    health: assessed.length
      ? (100 *
          assessed.filter(
            (record) => record.health === "Sano",
          ).length) /
        assessed.length
      : 0,

    zones: new Set(
      real.map((record) => record.zone.trim()),
    ).size,

    assessed: assessed.length,
    measured: measured.length,
  };
}

type ComparisonOptions = {
  minAge?: number;
  maxAge?: number;

  // Permite comparar exactamente la misma edad.
  targetAge?: number;

  origin?: "manual" | "ia";
};

// Comparación por tratamiento y dosis.
// Usa una observación por planta.
export function compare(
  records: FieldRecord[],
  options: ComparisonOptions = {},
) {
  const minimum = options.minAge ?? 0;
  const maximum = options.maxAge ?? Infinity;

  if (
    !Number.isInteger(minimum) ||
    minimum < 0 ||
    maximum < minimum ||
    (maximum !== Infinity &&
      (!Number.isInteger(maximum) || maximum < 0)) ||
    (options.targetAge !== undefined &&
      (!Number.isInteger(options.targetAge) ||
        options.targetAge < 0))
  ) {
    return [];
  }

  const valid = records.filter((record) => {
    if (!eligible(record)) return false;

    const plantAge = age(record);

    if (plantAge === null) return false;

    if (
      plantAge < minimum ||
      plantAge > maximum
    ) {
      return false;
    }

    if (
      options.targetAge !== undefined &&
      plantAge !== options.targetAge
    ) {
      return false;
    }

    return true;
  });

  // Última observación válida de cada planta
  // dentro del rango de edad seleccionado.
  const latest = new Map<string, FieldRecord>();

  for (const record of valid) {
    const key = plantKey(record);
    const previous = latest.get(key);

    if (
      !previous ||
      record.date > previous.date ||
      (record.date === previous.date &&
        record.createdAt > previous.createdAt)
    ) {
      latest.set(key, record);
    }
  }

  // Agrupación por fertilizante y dosis.
  const groups = new Map<string, FieldRecord[]>();

  for (const record of latest.values()) {
    const key = treatmentKey(record);

    const rows = groups.get(key) ?? [];
    rows.push(record);
    groups.set(key, rows);
  }

  return [...groups].map(([key, rows]) => {
    function metric(name: Metric) {
      const measurements = rows
        .filter(
          (record) =>
            origin(record, name) ===
            (options.origin ?? "manual"),
        )
        .map((record) => value(record, name))
        .filter(
          (measure): measure is number =>
            measure !== null,
        );

      return statistics(measurements);
    }

    const diameter = metric("diameterCm");
    const height = metric("heightCm");
    const leaves = metric("leafCount");

    const ages = rows
      .map((record) => age(record))
      .filter(
        (days): days is number => days !== null,
      );

    return {
      key,
      name: rows[0].fertilizer,
      dose: rows[0].dose!,

      // Cantidad de plantas distintas.
      count: rows.length,

      // Diámetro del rabanito.
      diameter: diameter.mean,
      measured: diameter.n,
      diameterSD: diameter.standardDeviation,

      // Altura de la planta.
      height: height.mean,
      heightN: height.n,
      heightSD: height.standardDeviation,

      // Número de hojas.
      leaves: leaves.mean,
      leavesN: leaves.n,
      leavesSD: leaves.standardDeviation,

      // Edad del cultivo.
      minAge: Math.min(...ages),
      maxAge: Math.max(...ages),

      // Advierte si se mezclan edades diferentes.
      sameAge:
        Math.min(...ages) === Math.max(...ages),

      // Total de observaciones seleccionadas.
      observations: rows.length,
    };
  });
}

// Escapa valores para exportación CSV.
export function csvCell(value: unknown) {
  let text = String(value ?? "");

  // Evita ejecutar fórmulas al abrir el CSV.
  if (/^[\s]*[=+@\-]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

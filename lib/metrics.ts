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
    (record) => record.health !== "Indeterminado",
  );

  return {
    count: records.length,

    diameter: measured.length
      ? measured.reduce(
          (sum, record) => sum + record.diameterCm!,
          0,
        ) / measured.length
      : 0,

    health: assessed.length
      ? (100 *
          assessed.filter(
            (record) => record.health === "Sano",
          ).length) /
        assessed.length
      : 0,

    zones: new Set(real.map((record) => record.zone)).size,
    assessed: assessed.length,
    measured: measured.length,
  };
}

type ComparisonOptions = {
  minAge?: number;
  maxAge?: number;
  origin?: "manual" | "ia";
};

// Compara una observación por planta,
// separando tratamientos y dosis.
export function compare(
  records: FieldRecord[],
  options: ComparisonOptions = {},
) {
  const valid = records.filter(eligible);

  const latest = new Map<string, FieldRecord>();

  for (const record of valid) {
    const plantAge = age(record)!;

    if (
      plantAge < (options.minAge ?? 0) ||
      plantAge > (options.maxAge ?? Infinity)
    ) {
      continue;
    }

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

  const groups = new Map<string, FieldRecord[]>();

  for (const record of latest.values()) {
    const key = treatmentKey(record);
    const rows = groups.get(key) || [];

    groups.set(key, [...rows, record]);
  }

  return [...groups].map(([key, rows]) => {
    function metric(name: Metric) {
      const values = rows
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

      return {
        n: values.length,

        mean: values.length
          ? values.reduce(
              (sum, measure) => sum + measure,
              0,
            ) / values.length
          : null,
      };
    }

    const diameter = metric("diameterCm");
    const height = metric("heightCm");
    const leaves = metric("leafCount");

    const ages = rows.map((record) => age(record)!);

    return {
      key,
      name: rows[0].fertilizer,
      dose: rows[0].dose!,

      // Una observación por planta.
      count: rows.length,

      diameter: diameter.mean,
      measured: diameter.n,

      height: height.mean,
      heightN: height.n,

      leaves: leaves.mean,
      leavesN: leaves.n,

      minAge: Math.min(...ages),
      maxAge: Math.max(...ages),
    };
  });
}

// Protege las exportaciones CSV y escapa su contenido.
export function csvCell(value: unknown) {
  let text = String(value ?? "");

  if (/^[\s]*[=+@\-]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

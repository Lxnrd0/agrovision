
import test from "node:test";
import assert from "node:assert/strict";

import {
  summary,
  compare,
  csvCell,
} from "../lib/metrics";

import {
  plantKey,
  treatmentKey,
} from "../lib/tracking";

import type { FieldRecord } from "../lib/types";

// Registro de prueba. No representa datos reales.
function plant(
  id: string,
  fertilizer: string,
  height: number,
  diameter: number,
  days: number,
): FieldRecord {
  const date = new Date(
    Date.UTC(2026, 9, 1 + days),
  ).toISOString().slice(0, 10);

  return {
    id: `${id}-${days}`,
    plantId: id,
    sowingDate: "2026-10-01",
    date,
    createdAt: `${date}T12:00:00.000Z`,

    crop: "Rabanito",
    zone: "Parcela A",
    fertilizer,
    dose: "100 g/planta",
    collaborator: "Estudiante",

    heightCm: height,
    diameterCm: diameter,
    leafCount: 5,

    measurementSources: {
      heightCm: "manual",
      diameterCm: "manual",
      leafCount: "manual",
    },

    bulbColor: "Rojo",
    leafColor: "Verde",
    health: "Sano",
    confidence: 0,

    observations: [],
    recommendations: [],
    limitations: [],

    image: "",
    source: "manual",
  };
}

// Prueba 1: promedio correcto.
test("Calcula promedios por tratamiento", () => {
  const records = [
    plant("R01", "Humus", 10, 2, 14),
    plant("R02", "Humus", 12, 4, 14),
  ];

  const groups = compare(records, {
    targetAge: 14,
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].height, 11);
  assert.equal(groups[0].diameter, 3);
});

// Prueba 2: no duplicar plantas.
test("Cuenta cada planta una sola vez", () => {
  const records = [
    plant("R01", "Humus", 5, 1, 7),
    plant("R01", "Humus", 10, 2, 14),
  ];

  const groups = compare(records);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
  assert.equal(groups[0].height, 10);
});

// Prueba 3: comparar por edad.
test("Filtra plantas por edad del cultivo", () => {
  const records = [
    plant("R01", "Humus", 8, 2, 7),
    plant("R02", "Humus", 12, 4, 14),
  ];

  const groups = compare(records, {
    targetAge: 14,
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 1);
  assert.equal(groups[0].height, 12);
  assert.equal(groups[0].sameAge, true);
});

// Prueba 4: excluir demostraciones.
test("Excluye datos de demostracion", () => {
  const example = plant(
    "R01",
    "Humus",
    10,
    2,
    14,
  );

  const groups = compare([
    { ...example, source: "demo" },
  ]);

  assert.equal(groups.length, 0);
});

// Prueba 5: mediciones incompletas.
test("No convierte medidas ausentes en cero", () => {
  const record = plant(
    "R01",
    "Humus",
    10,
    2,
    14,
  );

  const groups = compare([
    { ...record, diameterCm: null },
  ]);

  assert.equal(groups[0].diameter, null);
  assert.equal(groups[0].measured, 0);
});

// Prueba 6: resumen de salud.
test("Calcula el porcentaje de plantas sanas", () => {
  const records = [
    plant("R01", "Humus", 10, 2, 14),
    {
      ...plant("R02", "Humus", 8, 2, 14),
      health: "Enfermo" as const,
    },
  ];

  const result = summary(records);

  assert.equal(result.health, 50);
  assert.equal(result.assessed, 2);
});

// Prueba 7: exportación segura.
test("Escapa correctamente los datos CSV", () => {
  assert.equal(
    csvCell("=1+2"),
    '"\'=1+2"',
  );

  assert.equal(
    csvCell('a"b'),
    '"a""b"',
  );

  assert.equal(csvCell(null), '""');
});

// Prueba 8: separar cultivos diferentes.
test("No mezcla plantas de cultivos diferentes", () => {
  const radish = plant(
    "P01",
    "Humus",
    10,
    2,
    14,
  );

  const tomato: FieldRecord = {
    ...plant("P01", "Humus", 20, 4, 14),
    crop: "Tomate",
  };

  const groups = compare([radish, tomato], {
    targetAge: 14,
  });

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.count),
    [1, 1],
  );
});

// Prueba 9: incluir el cultivo en las claves.
test("Distingue plantas y tratamientos de cultivos diferentes", () => {
  const radish = plant(
    "P01",
    "Humus",
    10,
    2,
    14,
  );

  const tomato: FieldRecord = {
    ...radish,
    crop: "Tomate",
  };

  assert.notEqual(
    plantKey(radish),
    plantKey(tomato),
  );

  assert.notEqual(
    treatmentKey(radish),
    treatmentKey(tomato),
  );
});

// Prueba 10: normalizar espacios, mayúsculas y acentos.
test("Normaliza las claves de plantas y tratamientos", () => {
  const original = plant(
    "P01",
    "Humus",
    10,
    2,
    14,
  );

  const normalized: FieldRecord = {
    ...original,
    crop: " RÁBANITO ",
    zone: " PARCELA A ",
    fertilizer: " HÚMUS ",
  };

  assert.equal(
    plantKey(original),
    plantKey(normalized),
  );

  assert.equal(
    treatmentKey(original),
    treatmentKey(normalized),
  );
});

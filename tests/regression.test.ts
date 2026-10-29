import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { isRecord } from "../lib/backup";
import { initialiseRecords, mutateRecords, readRecords, restoreRecords, writeRecords } from "../lib/storage";
import { age, daysBetween, growth, validateRecord } from "../lib/tracking";
import { buildPdf, exportCsv } from "../lib/exports";
import type { FieldRecord } from "../lib/types";

export function record(id = "a", overrides: Partial<FieldRecord> = {}): FieldRecord {
  return { id, plantId: id, sowingDate: "2026-10-01", date: "2026-10-10",
    crop: "Rabanito", collaborator: "Ana", zone: "A", fertilizer: "Humus", dose: "1 g/planta",
    heightCm: 10, leafCount: 5, diameterCm: 2, measurementSources: { heightCm: "manual" },
    bulbColor: "Rojo", leafColor: "Verde", health: "Sano", confidence: 0,
    observations: [], recommendations: [], limitations: [], image: "", source: "manual",
    createdAt: "2026-10-10T12:00:00Z", ...overrides };
}

test("parallel first-use initializations preserve a concurrent write", async () => {
  await writeRecords([]);
  await Promise.all([initialiseRecords(), mutateRecords(rows => [...rows, record()]), initialiseRecords()]);
  assert.deepEqual((await readRecords())?.map(r => r.id), ["a"]);
});
test("parallel local inserts are both retained", async () => {
  await writeRecords([]);
  await Promise.all([mutateRecords(rows => [...rows, record("a")]), mutateRecords(rows => [...rows, record("b")])]);
  assert.equal((await readRecords())?.length, 2);
});
test("restoration merges IDs without overwriting and rolls back duplicate plant dates", async () => {
  await writeRecords([record()]);
  const result = await restoreRecords([record("a", { collaborator: "Changed" }), record("b")]);
  assert.equal(result.added, 1);
  assert.equal(result.records.find(r => r.id === "a")?.collaborator, "Ana");
  await assert.rejects(restoreRecords([record("c"), record("d", { plantId: "a" })]), /ya tiene una observación/);
  assert.equal((await readRecords())?.length, 2);
});
test("legacy records remain restorable and editable without invented tracking", async () => {
  const legacy = record("old", { plantId: undefined, dose: undefined, sowingDate: undefined });
  await writeRecords([]);
  await restoreRecords([legacy]);
  assert.doesNotThrow(() => validateRecord(legacy, [], { allowLegacy: true }));
  assert.throws(() => validateRecord(legacy, []));
  assert.equal(age(legacy), null);
  assert.throws(() => validateRecord({ ...legacy, heightCm: -1 }, [], { allowLegacy: true }));
});
test("backup rejects malformed visual metrics and unsafe image URLs", () => {
  assert.equal(isRecord(record()), true);
  assert.equal(isRecord(record("a", { visualMetrics: [{ label: "Color", value: "Rojo" }] })), true);
  assert.equal(isRecord({ ...record(), visualMetrics: [null] }), false);
  assert.equal(isRecord({ ...record(), visualMetrics: [{ label: 2, value: "x" }] }), false);
  assert.equal(isRecord({ ...record(), image: "javascript:alert(1)" }), false);
});
test("calendar rejects overflow dates and growth excludes incompatible measurements", () => {
  assert.ok(Number.isNaN(daysBetween("2026-02-30", "2026-03-01")));
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  const previous = record("a", { date: "2026-10-05", heightCm: 5 });
  const current = record("b", { plantId: "a", heightCm: 15 });
  assert.equal(growth(current, [previous], "heightCm")?.perDay, 2);
  assert.equal(growth({ ...current, measurementSources: { heightCm: "ia" } }, [previous], "heightCm"), null);
});
test("PDF separates same plant codes across lots and sowing dates", async () => {
  const doc = await buildPdf([record("a", { plantId: "P01" }),
    record("b", { plantId: "P01", zone: "B" }),
    record("c", { plantId: "P01", sowingDate: "2026-10-02" })]);
  assert.ok(doc.getNumberOfPages() >= 3);
  assert.match(doc.output(), /3 planta/);
});

test("full CSV retains diagnosis, origin and formula protections", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalUrl = URL.createObjectURL;
  let generated: Blob | undefined;
  URL.createObjectURL = (blob) => { if (blob instanceof Blob) generated = blob; return "blob:test"; };
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} },
  } });
  try {
    exportCsv([record("a", { source: "openai", collaborator: "=1+1", recommendations: ["RECOMENDACION_UNICA"] })]);
    const csv = await generated!.text();
    assert.ok(csv.includes("RECOMENDACION_UNICA"));
    assert.ok(csv.includes("Registro con análisis de OpenAI"));
    assert.ok(csv.includes("'=1+1"));
  } finally {
    URL.createObjectURL = originalUrl;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("PDF includes AI recommendations and limitations", async () => {
  const doc = await buildPdf([record("a", { source: "openai", recommendations: ["RECOMENDACION_UNICA"], limitations: ["LIMITE_UNICO"] })]);
  assert.match(doc.output(), /RECOMENDACION_UNICA/);
  assert.match(doc.output(), /LIMITE_UNICO/);
});

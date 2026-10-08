import test from "node:test";
import assert from "node:assert/strict";
import { summary, compare, csvCell } from "../lib/metrics";
import { demoRecords } from "../lib/demo";
test("summary excludes unknown health and unscaled measurements", () => {
  const s = summary([
    { ...demoRecords[0], diameterCm: null, health: "Indeterminado" },
    demoRecords[1],
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.diameter, demoRecords[1].diameterCm);
  assert.equal(s.health, 100);
  assert.equal(s.assessed, 1);
});
test("comparison groups each record exactly once and uses a bounded index", () => {
  const groups = compare(demoRecords);
  assert.equal(
    groups.reduce((sum, g) => sum + g.count, 0),
    demoRecords.length,
  );
  assert.ok(
    groups.every((g) => g.index !== null && g.index >= 0 && g.index <= 100),
  );
  assert.equal(groups.find((g) => g.name === "Humus de lombriz")?.count, 3);
});
test("CSV escapes quotes, line breaks and spreadsheet formulas", () => {
  assert.equal(csvCell("=1+2"), '"\'=1+2"');
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(" @SUM(A1)"), '"\' @SUM(A1)"');
});

test("missing measurements never become a zero-size performance result", () => {
  const groups = compare([{ ...demoRecords[0], diameterCm: null }]);
  assert.equal(groups[0].measured, 0);
  assert.equal(groups[0].index, null);
});

import { FieldRecord } from "./types";
export function summary(records: FieldRecord[]) {
  const measured = records.filter((r) => r.diameterCm !== null);
  const assessed = records.filter((r) => r.health !== "Indeterminado");
  return {
    count: records.length,
    diameter: measured.length
      ? measured.reduce((s, r) => s + r.diameterCm!, 0) / measured.length
      : 0,
    health: assessed.length
      ? (100 * assessed.filter((r) => r.health === "Sano").length) /
        assessed.length
      : 0,
    zones: new Set(records.map((r) => r.zone)).size,
    assessed: assessed.length,
    measured: measured.length,
  };
}
export function compare(records: FieldRecord[]) {
  const groups = new Map<string, FieldRecord[]>();
  records.forEach((r) =>
    groups.set(r.fertilizer, [...(groups.get(r.fertilizer) || []), r]),
  );
  const max = Math.max(...records.map((r) => r.diameterCm || 0), 1);
  return [...groups].map(([name, rows]) => {
    const s = summary(rows);
    return {
      name,
      ...s,
      leaves: rows.filter((r) => r.leafCount !== null).length
        ? rows.reduce((a, r) => a + (r.leafCount || 0), 0) /
          rows.filter((r) => r.leafCount !== null).length
        : 0,
      index:
        s.measured && s.assessed
          ? Math.round(
              ((s.diameter / max) * 0.6 + (s.health / 100) * 0.4) * 100,
            )
          : null,
    };
  });
}
export function csvCell(value: unknown) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

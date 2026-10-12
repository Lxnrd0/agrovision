import type { FieldRecord } from "./types";
import type { Metric } from "./tracking";
import { csvCell } from "./metrics";
import { age, growth, origin, value } from "./tracking";

type MetricDefinition = {
  key: Metric;
  label: string;
  unit: string;
};

const metrics: MetricDefinition[] = [
  { key: "heightCm", label: "Altura", unit: "cm" },
  { key: "leafCount", label: "Hojas", unit: "hojas" },
  { key: "diameterCm", label: "Diámetro", unit: "cm" },
];

function format(
  number: number | null | undefined,
  decimals = 2,
) {
  return number == null || !Number.isFinite(number)
    ? "No disponible"
    : number.toFixed(decimals);
}

function sourceLabel(source: FieldRecord["source"]) {
  switch (source) {
    case "demo":
      return "DEMOSTRACIÓN: datos simulados";
    case "manual":
      return "Registro manual";
    case "gemini":
      return "Registro con análisis de Gemini";
    case "openai":
      return "Registro con análisis de OpenAI";
    default:
      return "Origen no identificado";
  }
}

function measurementSource(
  record: FieldRecord,
  metric: Metric,
) {
  if (value(record, metric) === null) return "Sin medida";

  switch (origin(record, metric)) {
    case "manual":
      return "Manual";
    case "ia":
      return "Estimación IA";
    default:
      return "Sin verificar";
  }
}

function measurementText(
  record: FieldRecord,
  metric: MetricDefinition,
) {
  const measured = value(record, metric.key);

  if (measured === null) return "No medido";

  return `${format(
    measured,
    metric.key === "leafCount" ? 0 : 2,
  )} ${metric.unit} · ${measurementSource(record, metric.key)}`;
}

function growthText(
  record: FieldRecord,
  records: FieldRecord[],
  metric: Metric,
  unit: string,
) {
  const change = growth(record, records, metric);

  if (!change) return "Sin medidas comparables";

  return [
    `${change.delta > 0 ? "+" : ""}${format(change.delta)} ${unit}`,
    `en ${change.days} días`,
    `${format(change.perDay)} ${unit}/día`,
    `desde ${change.previousDate}`,
    measurementSource(record, metric),
  ].join(" · ");
}

function sortedRecords(records: FieldRecord[]) {
  return [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.plantId ?? "").localeCompare(
        b.plantId ?? "",
        "es",
        { numeric: true },
      ) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

function download(url: string, name: string) {
  const link = document.createElement("a");

  link.href = url;
  link.download = name;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV sencillo para compartir las mediciones manuales del rabanito. */
export function exportSimpleCsv(records: FieldRecord[]) {
  const header = [
    "ID del registro",
    "Código de planta",
    "Responsable",
    "Fecha de siembra",
    "Fecha de observación",
    "Edad (días)",
    "Lote",
    "Fertilizante",
    "Dosis",
    "Altura (cm)",
    "Número de hojas",
    "Diámetro (cm)",
    "Observaciones",
    "Tiene fotografía",
  ];

  const manualValue = (record: FieldRecord, metric: Metric) =>
    origin(record, metric) === "manual" ? value(record, metric) : null;

  const rows = sortedRecords(records)
    .filter((record) => record.source !== "demo")
    .map((record) => [
      record.id,
      record.plantId ?? "",
      record.collaborator,
      record.sowingDate ?? "",
      record.date,
      age(record),
      record.zone,
      record.fertilizer,
      record.dose ?? "",
      manualValue(record, "heightCm"),
      manualValue(record, "leafCount"),
      manualValue(record, "diameterCm"),
      record.observations.join(" | "),
      record.image ? "Sí" : "No",
    ]);

  const content =
    "\uFEFF" +
    [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8",
  });

  download(URL.createObjectURL(blob), "AgroVision_monitoreo.csv");
}

export function exportCsv(records: FieldRecord[]) {
  const header = [
    "ID del registro",
    "Identificador de planta",
    "Fecha de siembra",
    "Fecha de observación",
    "Edad en días",
    "Responsable",
    "Lote",
    "Tratamiento",
    "Dosis y frecuencia",
    "Cultivo",
    "Altura cm",
    "Origen altura",
    "Número de hojas",
    "Origen hojas",
    "Diámetro cm",
    "Origen diámetro",
    "Diámetro estimado IA cm",
    "Hojas estimadas IA",
    "Estado observado",
    "Color del bulbo",
    "Color de las hojas",
    "Confianza del modelo %",
    "Origen del registro",
    "Es ejemplo",
    "Tiene fotografía",
    "Síntomas y observaciones",
    "Observaciones originales IA",
    "Recomendaciones IA",
    "Limitaciones",
    "Fecha de creación",
  ];

  for (const metric of metrics) {
    header.push(
      `${metric.label}: cambio ${metric.unit}`,
      `${metric.label}: días entre medidas`,
      `${metric.label}: cambio ${metric.unit}/día`,
      `${metric.label}: fecha de medida anterior`,
      `${metric.label}: origen del cambio`,
    );
  }

  const rows = sortedRecords(records).map((record) => {
    const hasAnalysis =
      record.source === "gemini" ||
      record.source === "openai" ||
      record.source === "demo";

    const row: (string | number | null | undefined)[] = [
      record.id,
      record.plantId,
      record.sowingDate,
      record.date,
      age(record),
      record.collaborator,
      record.zone,
      record.fertilizer,
      record.dose,
      record.crop,

      value(record, "heightCm"),
      measurementSource(record, "heightCm"),

      value(record, "leafCount"),
      measurementSource(record, "leafCount"),

      value(record, "diameterCm"),
      measurementSource(record, "diameterCm"),

      record.estimatedDiameterCm,
      record.estimatedLeafCount,

      record.health,
      record.bulbColor,
      record.leafColor,
      hasAnalysis ? record.confidence : null,

      sourceLabel(record.source),
      record.source === "demo" ? "Sí" : "No",
      record.image ? "Sí" : "No",

      record.observations.join(" | "),
      (record.aiObservations ?? []).join(" | "),
      record.recommendations.join(" | "),
      record.limitations.join(" | "),
      record.createdAt,
    ];

    for (const metric of metrics) {
      const change = growth(record, records, metric.key);

      row.push(
        change?.delta ?? null,
        change?.days ?? null,
        change?.perDay ?? null,
        change?.previousDate ?? null,
        change ? measurementSource(record, metric.key) : null,
      );
    }

    return row;
  });

  const content =
    "\uFEFF" +
    [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

  const blob = new Blob([content], {
    type: "text/csv;charset=utf-8",
  });

  download(
    URL.createObjectURL(blob),
    "AgroVision_seguimiento.csv",
  );
}

export async function exportPdf(records: FieldRecord[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const real = sortedRecords(records).filter((record) => record.source !== "demo");
  const groups = new Map<string, FieldRecord[]>();
  for (const record of real) {
    const key = record.plantId?.trim() || `Sin código (${record.id})`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const green: [number, number, number] = [35, 78, 49];
  const dark: [number, number, number] = [19, 31, 25];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 15;
  const right = pageWidth - 15;
  const usable = right - left;
  let y = 0;

  function header(title: string) {
    doc.setFillColor(...dark);
    doc.rect(0, 0, pageWidth, 32, "F");
    doc.setTextColor(166, 231, 124);
    doc.setFontSize(21);
    doc.text("AgroVision", left, 15);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(title, left, 24);
    doc.setTextColor(35, 45, 39);
    y = 42;
  }

  function newPage(title: string) {
    doc.addPage();
    header(title);
  }

  function ensureSpace(height: number, title: string) {
    if (y + height > pageHeight - 18) newPage(title);
  }

  function section(title: string, pageTitle: string, requiredSpace = 20) {
    ensureSpace(requiredSpace, pageTitle);
    doc.setTextColor(...green);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(title, left, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(35, 45, 39);
    y += 4.5;
  }

  function table(head: string[], body: string[][], title: string, widths?: Record<number, { cellWidth: number }>) {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: "striped",
      styles: { fontSize: 7.6, cellPadding: 1.7, overflow: "linebreak" },
      rowPageBreak: "avoid",
      pageBreak: body.length <= 10 ? "avoid" : "auto",
      headStyles: { fillColor: green },
      columnStyles: widths,
      margin: { left, right: 15, top: 40, bottom: 18 },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          // Continuaciones de tablas largas mantienen el encabezado de informe.
          doc.setTextColor(...green);
          doc.setFontSize(9);
          doc.text(`AgroVision · ${title}`, left, 12);
        }
      },
    });
    const finalY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    y = (finalY ?? y + 20) + 5;
  }

  function manual(record: FieldRecord, metric: Metric): number | null {
    return origin(record, metric) === "manual" ? value(record, metric) : null;
  }

  function latestManual(rows: FieldRecord[], metric: Metric) {
    for (let i = rows.length - 1; i >= 0; i--) {
      const measured = manual(rows[i], metric);
      if (measured !== null) return { date: rows[i].date, measured };
    }
    return null;
  }

  function chart(rows: FieldRecord[], title: string) {
    const points = rows
      .map((record) => ({ date: record.date, days: age(record), height: manual(record, "heightCm") }))
      .filter((point): point is { date: string; days: number; height: number } =>
        point.days !== null && point.height !== null,
      );
    section("Evolución de la altura (mediciones manuales)", title, points.length > 1 ? 77 : 22);
    if (points.length === 0) {
      doc.setFontSize(9);
      doc.text("Aún no se han registrado medidas manuales de altura.", left, y + 3);
      y += 14;
      return;
    }
    if (points.length === 1) {
      doc.setFontSize(9);
      doc.text(`Día ${points[0].days}: ${format(points[0].height)} cm. Se necesita otra medición para trazar la evolución.`, left, y + 3);
      y += 14;
      return;
    }
    const x0 = left + 13;
    const x1 = right - 8;
    const y0 = y + 51;
    const y1 = y + 7;
    const minDay = Math.min(...points.map((p) => p.days));
    const maxDay = Math.max(...points.map((p) => p.days));
    const maxHeight = Math.max(1, ...points.map((p) => p.height));
    const scaleX = (day: number) => x0 + ((day - minDay) / Math.max(1, maxDay - minDay)) * (x1 - x0);
    const scaleY = (height: number) => y0 - (height / maxHeight) * (y0 - y1);
    doc.setDrawColor(200, 210, 201);
    doc.setLineWidth(0.25);
    for (let i = 0; i <= 4; i++) {
      const yy = y0 - (i / 4) * (y0 - y1);
      doc.line(x0, yy, x1, yy);
      doc.setFontSize(7);
      doc.setTextColor(100, 110, 102);
      doc.text(format((i / 4) * maxHeight, 1), x0 - 2, yy + 1, { align: "right" });
    }
    doc.setDrawColor(...green);
    doc.setLineWidth(0.7);
    for (let i = 1; i < points.length; i++) {
      doc.line(scaleX(points[i - 1].days), scaleY(points[i - 1].height), scaleX(points[i].days), scaleY(points[i].height));
    }
    for (const point of points) {
      doc.setFillColor(...green);
      doc.circle(scaleX(point.days), scaleY(point.height), 1.4, "F");
    }
    doc.setFontSize(8);
    doc.setTextColor(80, 90, 83);
    doc.text(`Día ${minDay}`, x0, y0 + 5);
    doc.text(`Día ${maxDay}`, x1, y0 + 5, { align: "right" });
    y += 66;
  }

  header("Informe de seguimiento del cultivo de rabanito");
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString("es-PE")}`, left, y);
  y += 6;
  doc.text(`${groups.size} planta(s) · ${real.length} observación(es) reales`, left, y);
  y += 9;

  if (real.length === 0) {
    doc.setFontSize(10);
    doc.text("No hay observaciones reales para incluir en el informe.", left, y);
  }

  let groupIndex = 0;
  for (const [plantId, rows] of groups) {
    if (groupIndex++ > 0) newPage(`Seguimiento individual · ${plantId}`);
    const latest = rows[rows.length - 1];
    const pageTitle = `Seguimiento individual · ${plantId}`;
    section(`Planta ${plantId}`, pageTitle, 82);
    const detail: string[][] = [
      ["Cultivo", latest.crop || "Rabanito"],
      ["Responsable", latest.collaborator || "No registrado"],
      ["Lote", latest.zone || "No registrado"],
      ["Fecha de siembra", latest.sowingDate || "No registrada"],
      ["Última observación", latest.date],
      ["Edad en la última observación", age(latest) === null ? "No disponible" : `${age(latest)} días`],
      ["Fertilizante / tratamiento", latest.fertilizer || "No registrado"],
      ["Dosis y frecuencia", latest.dose || "No registrada"],
      ["Observaciones registradas", String(rows.length)],
    ];
    table(["Información general", "Detalle"], detail, pageTitle, { 0: { cellWidth: 64 } });

    section("Últimas mediciones manuales disponibles", pageTitle, 34);
    const measurements = metrics.map((metric) => {
      const result = latestManual(rows, metric.key);
      return [metric.label, result ? `${format(result.measured, metric.key === "leafCount" ? 0 : 2)} ${metric.unit}` : "No medido", result?.date ?? "—"];
    });
    table(["Variable", "Valor", "Fecha de medición"], measurements, pageTitle);

    chart(rows, pageTitle);
    section("Historial de observaciones", pageTitle, 23);
    const history = rows.map((record) => [
      record.date,
      age(record) === null ? "—" : String(age(record)),
      manual(record, "heightCm") === null ? "—" : format(manual(record, "heightCm")),
      manual(record, "leafCount") === null ? "—" : format(manual(record, "leafCount"), 0),
      manual(record, "diameterCm") === null ? "—" : format(manual(record, "diameterCm")),
    ]);
    table(["Fecha", "Día", "Altura (cm)", "Hojas", "Diámetro (cm)"], history, pageTitle);

    section("Cambios entre medidas comparables", pageTitle, 34);
    const changes = metrics.map((metric) => {
      const last = [...rows].reverse().find((record) => manual(record, metric.key) !== null);
      return [metric.label, last ? growthText(last, rows, metric.key, metric.unit) : "Sin medidas comparables"];
    });
    table(["Variable", "Crecimiento registrado"], changes, pageTitle, { 0: { cellWidth: 37 } });

    const notes = rows.flatMap((record) => record.observations.map((note) => [record.date, note]));
    if (notes.length) {
      section("Observaciones de campo", pageTitle, 24);
      table(["Fecha", "Nota registrada"], notes, pageTitle, { 0: { cellWidth: 32 } });
    }
    const photos = rows.filter((record) => record.image);
    if (photos.length) {
      section("Fotografías", pageTitle, 21);
      doc.setFontSize(9);
      doc.text(`${photos.length} observación(es) con fotografía. Las imágenes se conservan en el respaldo JSON.`, left, y + 2);
      y += 10;
    }
    ensureSpace(16, pageTitle);
    doc.setFontSize(8);
    doc.setTextColor(95, 105, 97);
    const disclaimer = "Informe descriptivo de una planta. Las diferencias observadas no demuestran por sí solas el efecto causal de un fertilizante.";
    const wrapped = doc.splitTextToSize(disclaimer, usable);
    doc.text(wrapped, left, y + 2);
    y += wrapped.length * 4 + 7;
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setTextColor(110, 120, 112);
    doc.setFontSize(8);
    doc.text(`AgroVision · Página ${page} de ${totalPages}`, left, pageHeight - 9);
  }
  doc.save("AgroVision_seguimiento.pdf");
}

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

  const doc = new jsPDF();
  const ordered = sortedRecords(records);

  const realCount = records.filter(
    (record) => record.source !== "demo",
  ).length;

  const exampleCount = records.length - realCount;

  doc.setFillColor(19, 31, 25);
  doc.rect(0, 0, 210, 36, "F");

  doc.setTextColor(166, 231, 124);
  doc.setFontSize(23);
  doc.text("AgroVision", 14, 18);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text("Seguimiento de plantas de rabanito", 14, 27);

  doc.setTextColor(40);
  doc.setFontSize(9);

  doc.text(
    `Exportado: ${new Date().toLocaleString("es-PE")}`,
    14,
    46,
  );

  doc.text(
    `${realCount} registros reales · ${exampleCount} ejemplos`,
    14,
    52,
  );

  autoTable(doc, {
    startY: 59,
    head: [
      [
        "Planta",
        "Observación",
        "Edad",
        "Lote",
        "Tratamiento",
        "Tipo",
      ],
    ],
    body: ordered.map((record) => [
      record.plantId || "Sin identificar",
      record.date,
      age(record) === null ? "N/D" : `${age(record)} d`,
      record.zone,
      record.fertilizer,
      record.source === "demo" ? "EJEMPLO" : "Real",
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [35, 78, 49],
    },
    margin: {
      left: 14,
      right: 14,
      bottom: 18,
    },
  });

  for (const record of ordered) {
    doc.addPage();

    doc.setTextColor(40);
    doc.setFontSize(16);
    doc.text("Ficha de observación", 14, 20);

    const plantAge = age(record);

    const hasAnalysis =
      record.source === "gemini" ||
      record.source === "openai" ||
      record.source === "demo";

    const body: string[][] = [
      ["ID del registro", record.id],
      ["Planta", record.plantId || "Sin identificar"],
      ["Cultivo", record.crop],
      ["Fecha de siembra", record.sowingDate || "No registrada"],
      ["Fecha de observación", record.date],
      [
        "Edad",
        plantAge === null ? "No disponible" : `${plantAge} días`,
      ],
      ["Responsable", record.collaborator],
      ["Lote", record.zone],
      ["Tratamiento", record.fertilizer],
      ["Dosis / frecuencia", record.dose || "No registrada"],
      ["Origen del registro", sourceLabel(record.source)],
      ["Estado observado", record.health],
      ["Color del bulbo", record.bulbColor || "No observado"],
      ["Color de las hojas", record.leafColor || "No observado"],
    ];

    for (const metric of metrics) {
      body.push([
        metric.label,
        measurementText(record, metric),
      ]);
    }

    body.push(
      [
        "Diámetro estimado IA",
        record.estimatedDiameterCm == null
          ? "Sin estimar"
          : `${format(record.estimatedDiameterCm)} cm`,
      ],
      [
        "Hojas estimadas IA",
        record.estimatedLeafCount == null
          ? "Sin estimar"
          : format(record.estimatedLeafCount, 0),
      ],
      [
        "Confianza del modelo",
        hasAnalysis
          ? `${format(record.confidence, 1)} %. No equivale a precisión comprobada.`
          : "No aplica",
      ],
    );

    for (const metric of metrics) {
      body.push([
        `Cambio de ${metric.label.toLowerCase()}`,
        growthText(record, records, metric.key, metric.unit),
      ]);
    }

    body.push(
      [
        "Síntomas / observaciones",
        record.observations.join("\n") ||
          "Sin observaciones escritas",
      ],
      [
        "Recomendaciones IA",
        record.recommendations.join("\n") ||
          "Sin recomendaciones",
      ],
      [
        "Limitaciones",
        record.limitations.join("\n") ||
          "Sin limitaciones registradas",
      ],
      [
        "Fotografía",
        record.image
          ? "Adjunta en la aplicación; no incluida en este PDF."
          : "Sin fotografía",
      ],
      [
        "Criterio de crecimiento",
        "Cambio respecto a la medida válida anterior de la misma planta, tratamiento y origen, entre los registros exportados.",
      ],
    );

    autoTable(doc, {
      startY: 29,
      theme: "striped",
      body,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        overflow: "linebreak",
      },
      columnStyles: {
        0: {
          cellWidth: 48,
          fontStyle: "bold",
        },
      },
      margin: {
        left: 14,
        right: 14,
        top: 18,
        bottom: 18,
      },
    });
  }

  const pageCount = doc.getNumberOfPages();

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setTextColor(110);
    doc.setFontSize(8);

    doc.text(
      `AgroVision · Página ${page} de ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 9,
    );
  }

  doc.save("AgroVision_seguimiento.pdf");
}

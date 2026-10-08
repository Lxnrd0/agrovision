import { FieldRecord } from "./types";
import { csvCell } from "./metrics";
export function exportCsv(records: FieldRecord[]) {
  const header = [
    "ID",
    "Fecha",
    "Colaborador",
    "Lote",
    "Fertilizante",
    "Cultivo",
    "Color bulbo",
    "Color hojas",
    "Hojas",
    "Diámetro cm",
    "Estado",
    "Confianza %",
    "Origen",
    "Observaciones",
    "Recomendaciones",
    "Limitaciones",
  ];
  const rows = records.map((r) => [
    r.id,
    r.date,
    r.collaborator,
    r.zone,
    r.fertilizer,
    r.crop,
    r.bulbColor,
    r.leafColor,
    r.leafCount,
    r.diameterCm,
    r.health,
    r.confidence,
    r.source,
    r.observations.join(" | "),
    r.recommendations.join(" | "),
    r.limitations.join(" | "),
  ]);
  const blob = new Blob(
    [
      "\uFEFF" +
        [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  download(URL.createObjectURL(blob), "AgroVision_bitacora.csv");
}
function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportPdf(records: FieldRecord[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF();
  doc.setFillColor(19, 31, 25);
  doc.rect(0, 0, 210, 36, "F");
  doc.setTextColor(166, 231, 124);
  doc.setFontSize(23);
  doc.text("AgroVision", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Bitácora y diagnósticos de campo", 14, 27);
  doc.setTextColor(40);
  doc.setFontSize(9);
  doc.text(
    `Exportado: ${new Date().toLocaleString("es-PE")} | ${records.length} registros`,
    14,
    46,
  );
  autoTable(doc, {
    startY: 53,
    head: [["Fecha", "Lote", "Fertilizante", "cm", "Estado", "Origen"]],
    body: records.map((r) => [
      r.date,
      r.zone,
      r.fertilizer,
      r.diameterCm ?? "N/D",
      r.health,
      r.source,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [35, 78, 49] },
  });
  for (const r of records) {
    doc.addPage();
    doc.setFontSize(16);
    doc.text(`${r.zone} · ${r.date}`, 14, 20);
    autoTable(doc, {
      startY: 30,
      theme: "striped",
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 42 } },
      body: [
        ["Colaborador", r.collaborator],
        ["Cultivo", r.crop],
        ["Fertilizante", r.fertilizer],
        [
          "Origen",
          r.source === "demo" ? "DEMOSTRACIÓN: datos simulados" : r.source,
        ],
        ["Bulbo / hojas", `${r.bulbColor} / ${r.leafColor}`],
        [
          "Hojas / diámetro",
          `${r.leafCount ?? "N/D"} / ${r.diameterCm ?? "N/D"} cm`,
        ],
        [
          "Estado / confianza",
          `${r.health} / ${r.confidence}% (estimación no calibrada)`,
        ],
        ["Observaciones", r.observations.join("\n")],
        ["Recomendaciones", r.recommendations.join("\n")],
        ["Limitaciones", r.limitations.join("\n")],
      ],
    });
  }
  doc.save("AgroVision_reporte.pdf");
}

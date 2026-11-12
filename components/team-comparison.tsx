"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileDown, RefreshCw, ShieldCheck } from "lucide-react";
import {
  isProjectComparisonAdmin,
  readProjectComparisonPreview,
} from "@/lib/cloud";
import type { ProjectComparisonData, ProjectComparisonTreatment } from "@/lib/cloud";
import type { FieldRecord } from "@/lib/types";
import Comparison from "./comparison";

type Metric = "growth" | "height" | "diameter" | "leaves" | "health";

type MetricDefinition = {
  key: Metric;
  label: string;
  unit: string;
  decimals: number;
};

const metrics: MetricDefinition[] = [
  { key: "growth", label: "Velocidad media de crecimiento", unit: "cm/día", decimals: 3 },
  { key: "height", label: "Altura media", unit: "cm", decimals: 2 },
  { key: "diameter", label: "Diámetro medio", unit: "cm", decimals: 2 },
  { key: "leaves", label: "Número medio de hojas", unit: "hojas", decimals: 1 },
  { key: "health", label: "Plantas sanas", unit: "%", decimals: 1 },
];

function metricValue(treatment: ProjectComparisonTreatment, metric: Metric): number | null {
  switch (metric) {
    case "growth": return treatment.growth.meanCmPerDay;
    case "height": return treatment.height.meanCm;
    case "diameter": return treatment.diameter.meanCm;
    case "leaves": return treatment.leaves.meanCount;
    case "health": return treatment.health.healthyPercent;
  }
}

function formatNumber(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "No disponible";
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo generar el informe. Inténtalo nuevamente.";
}

function bestTreatment(
  treatments: ProjectComparisonTreatment[],
  metric: Metric,
): ProjectComparisonTreatment | null {
  const available = treatments.filter((item) => metricValue(item, metric) !== null);
  if (!available.length) return null;
  return available.sort((a, b) =>
    (metricValue(b, metric) ?? -Infinity) - (metricValue(a, metric) ?? -Infinity),
  )[0];
}

async function downloadTeamComparisonPdf(data: ProjectComparisonData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const green: [number, number, number] = [24, 91, 61];
  const lightGreen: [number, number, number] = [232, 245, 235];
  const dark: [number, number, number] = [25, 43, 34];
  const muted: [number, number, number] = [93, 105, 97];
  const generated = new Date(data.generatedAt);
  const generatedLabel = Number.isNaN(generated.getTime())
    ? data.generatedAt
    : generated.toLocaleString("es-PE", { dateStyle: "long", timeStyle: "short" });

  doc.setProperties({
    title: "TerraNova - Informe comparativo del experimento",
    subject: "Comparación de tratamientos de fertilización",
    author: "TerraNova - Gestión de Cultivos",
    creator: "TerraNova",
  });

  // Portada / resumen ejecutivo.
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 43, "F");
  doc.setTextColor(180, 226, 188);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.text("TerraNova", margin, 17);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Informe comparativo del experimento", margin, 29);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Análisis descriptivo de los fertilizantes aplicados al cultivo", margin, 36);

  let y = 54;
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resumen del experimento", margin, y);
  y += 7;

  const summaryRows = [
    ["Proyecto", data.projectId || "No identificado"],
    ["Integrantes con registros", String(data.summary.members)],
    ["Plantas evaluadas", String(data.summary.plants)],
    ["Tratamientos identificados", String(data.summary.treatments)],
    ["Observaciones válidas", String(data.summary.observations)],
    ["Fecha de cálculo", generatedLabel],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Resultado"]],
    body: summaryRows,
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: dark },
    headStyles: { fillColor: green, textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 65 } },
    margin: { left: margin, right: margin },
  });

  y = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 45) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...dark);
  doc.text("Resultados destacados por indicador", margin, y);
  y += 3;

  const highlights = metrics.map((metric) => {
    const best = bestTreatment(data.treatments, metric.key);
    return [
      metric.label,
      best?.fertilizer ?? "Sin datos suficientes",
      best ? `${formatNumber(metricValue(best, metric.key), metric.decimals)} ${metric.unit}` : "No disponible",
      best?.dose ?? "—",
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Tratamiento con mayor valor", "Resultado", "Dosis"]],
    body: highlights,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 2.4, overflow: "linebreak" },
    headStyles: { fillColor: green, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: lightGreen },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { cellWidth: 67 }, 1: { cellWidth: 72 }, 2: { cellWidth: 48 }, 3: { cellWidth: 75 } },
  });

  // Ranking descriptivo ordenado por velocidad de crecimiento; los valores faltantes quedan al final.
  doc.addPage();
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 25, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Ranking y comparación de tratamientos", margin, 16);

  const ranked = [...data.treatments].sort((a, b) => {
    const av = a.growth.meanCmPerDay;
    const bv = b.growth.meanCmPerDay;
    if (av === null && bv === null) return a.fertilizer.localeCompare(b.fertilizer, "es");
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });

  autoTable(doc, {
    startY: 33,
    head: [["Puesto*", "Cultivo", "Fertilizante", "Dosis", "Plantas", "Altura media (cm)", "Crecimiento (cm/día)", "Hojas medias", "Diámetro medio (cm)", "Plantas sanas (%)"]],
    body: ranked.map((item, index) => [
      item.growth.meanCmPerDay === null ? "—" : `${index + 1}.º`,
      item.crop || "—",
      item.fertilizer || "—",
      item.dose || "—",
      String(item.plantCount),
      formatNumber(item.height.meanCm, 2),
      formatNumber(item.growth.meanCmPerDay, 3),
      formatNumber(item.leaves.meanCount, 1),
      formatNumber(item.diameter.meanCm, 2),
      formatNumber(item.health.healthyPercent, 1),
    ]),
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: green, textColor: [255, 255, 255], fontSize: 7 },
    alternateRowStyles: { fillColor: [241, 247, 242] },
    margin: { left: margin, right: margin, bottom: 20 },
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text("* El puesto se asigna únicamente cuando existe una medición válida de velocidad de crecimiento.", margin, pageHeight - 12);
    },
  });

  // Gráfico comparativo solo cuando existen mediciones reales de crecimiento.
  const growthRows = ranked.filter((item) => item.growth.meanCmPerDay !== null);
  if (growthRows.length) {
    doc.addPage();
    doc.setFillColor(...dark);
    doc.rect(0, 0, pageWidth, 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Comparación de velocidad de crecimiento", margin, 16);

    const chartTop = 42;
    const labelWidth = 66;
    const chartWidth = pageWidth - margin * 2 - labelWidth - 30;
    const maxValue = Math.max(...growthRows.map((item) => item.growth.meanCmPerDay ?? 0), 0.0001);
    let chartY = chartTop;

    growthRows.forEach((item, index) => {
      const value = item.growth.meanCmPerDay ?? 0;
      const barWidth = Math.max(0, (value / maxValue) * chartWidth);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...dark);
      doc.text(`${item.fertilizer}${item.dose ? ` · ${item.dose}` : ""}`.slice(0, 48), margin, chartY + 5);
      doc.setFillColor(232, 239, 233);
      doc.roundedRect(margin + labelWidth, chartY, chartWidth, 8, 2, 2, "F");
      doc.setFillColor(...(index === 0 ? [35, 145, 78] as [number, number, number] : [83, 157, 112] as [number, number, number]));
      if (barWidth > 0) doc.roundedRect(margin + labelWidth, chartY, barWidth, 8, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.text(`${formatNumber(value, 3)} cm/día`, margin + labelWidth + chartWidth + 4, chartY + 5.5);
      chartY += 17;
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("El gráfico compara promedios calculados a partir de mediciones manuales válidas.", margin, chartY + 7);
  }

  // Metodología, advertencias y límites de interpretación.
  doc.addPage();
  doc.setFillColor(...dark);
  doc.rect(0, 0, pageWidth, 25, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Metodología y consideraciones", margin, 16);
  let notesY = 38;

  const methodology = [
    ["Mediciones", data.methodology.measurements],
    ["Crecimiento", data.methodology.growth],
    ["Promedios", data.methodology.averages],
    ["Privacidad", data.methodology.privacy],
  ].filter((row) => Boolean(row[1]));

  autoTable(doc, {
    startY: notesY,
    head: [["Aspecto", "Criterio aplicado"]],
    body: methodology,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: green, textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 48 } },
    margin: { left: margin, right: margin },
  });

  notesY = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? notesY + 20) + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...dark);
  doc.text("Advertencias del análisis", margin, notesY);
  notesY += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...dark);

  const warnings = data.warnings.length
    ? data.warnings
    : ["No se informaron advertencias adicionales en el cálculo."];
  warnings.forEach((warning) => {
    const lines = doc.splitTextToSize(`• ${warning}`, pageWidth - margin * 2);
    if (notesY + lines.length * 4 > pageHeight - 22) {
      doc.addPage();
      notesY = 20;
    }
    doc.text(lines, margin, notesY);
    notesY += lines.length * 4 + 2;
  });

  if (notesY + 20 > pageHeight - 18) {
    doc.addPage();
    notesY = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...green);
  doc.text("Conclusión", margin, notesY + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...dark);
  const conclusion = data.treatments.length
    ? "Los indicadores se presentan por separado. El tratamiento con mayor valor en un indicador no necesariamente es el mejor en todos los demás. La comparación es descriptiva y no demuestra causalidad por sí sola."
    : "Todavía no hay tratamientos con datos suficientes para establecer una comparación. Registra observaciones y genera nuevamente el informe cuando existan mediciones válidas.";
  doc.text(doc.splitTextToSize(conclusion, pageWidth - margin * 2), margin, notesY + 10);

  // Pie de página.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(`TerraNova · Informe comparativo · Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  doc.save("TerraNova_informe_comparativo.pdf");
}

export default function TeamComparison({ records }: { records: FieldRecord[] }) {
  const [tab, setTab] = useState<"team" | "personal">("team");
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const checkAccess = useCallback(async () => {
    setCheckingAccess(true);
    setError("");
    try {
      setIsAdmin(await isProjectComparisonAdmin());
    } catch (reason) {
      setError(getErrorMessage(reason));
      setIsAdmin(false);
    } finally {
      setCheckingAccess(false);
    }
  }, []);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  async function generateReport() {
    if (!isAdmin || generating) return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      // Recalcula en Supabase al pulsar para incluir los registros más recientes.
      const latestData = await readProjectComparisonPreview();
      await downloadTeamComparisonPdf(latestData);
      setMessage("Informe generado y descargado correctamente.");
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setGenerating(false);
    }
  }

  const tabControls = (
    <div className="filter-bar" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <button
        className={`button ${tab === "team" ? "primary" : "secondary"}`}
        type="button"
        onClick={() => setTab("team")}
        disabled={tab === "team"}
      >
        Informe del equipo
      </button>
      <button
        className={`button ${tab === "personal" ? "primary" : "secondary"}`}
        type="button"
        onClick={() => setTab("personal")}
        disabled={tab === "personal"}
      >
        Mi comparativa
      </button>
    </div>
  );

  if (tab === "personal") {
    return (
      <div className="team-comparison">
        {tabControls}
        <Comparison records={records} />
      </div>
    );
  }

  if (checkingAccess) {
    return (
      <div className="team-comparison">
        {tabControls}
        <section className="panel" style={{ padding: 24, textAlign: "center" }}>
          <RefreshCw size={20} className="auth-spinner" />
          <p className="table-note">Verificando permisos…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="team-comparison">
      {tabControls}
      <section className="panel" style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <div className="section-heading" style={{ alignItems: "flex-start" }}>
          <div>
            <h2>Informe comparativo del experimento</h2>
            <p>
              Genera un único PDF con el análisis conjunto de los fertilizantes,
              las mediciones disponibles, los indicadores destacados y las conclusiones.
            </p>
          </div>
          <FileDown size={28} />
        </div>

        {isAdmin ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 13, borderRadius: 10, background: "var(--surface-secondary, rgba(35, 120, 70, .08))", margin: "18px 0" }}>
              <ShieldCheck size={19} />
              <span className="table-note">Acceso de administrador. El informe se calcula nuevamente al generarlo.</span>
            </div>
            <button
              className="button primary"
              type="button"
              onClick={() => void generateReport()}
              disabled={generating}
              style={{ width: "100%", minHeight: 48, justifyContent: "center" }}
            >
              {generating ? <RefreshCw size={18} className="auth-spinner" /> : <FileDown size={18} />}
              {generating ? "Generando informe PDF…" : "Generar informe PDF"}
            </button>
            <p className="table-note" style={{ marginTop: 12, textAlign: "center" }}>
              El PDF se descarga directamente. Los resultados detallados no se muestran en esta pantalla.
            </p>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 10, background: "var(--surface-secondary, rgba(100, 110, 100, .08))", marginTop: 18 }}>
            <ShieldCheck size={19} />
            <p className="table-note" style={{ margin: 0 }}>
              El informe comparativo del equipo solo puede generarlo el administrador. Solicítale el PDF cuando esté disponible.
            </p>
          </div>
        )}

        {message && <p className="auth-message" role="status">{message}</p>}
        {error && (
          <p className="form-error" role="alert" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={16} /> {error}
          </p>
        )}
      </section>
    </div>
  );
}

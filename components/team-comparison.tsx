"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileDown,
  FlaskConical,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Trophy,
  Users,
} from "lucide-react";
import {
  isProjectComparisonAdmin,
  readProjectComparisonPreview,
} from "@/lib/cloud";
import type {
  ProjectComparisonData,
  ProjectComparisonTreatment,
} from "@/lib/cloud";

type MetricResult = {
  treatment: ProjectComparisonTreatment;
  value: number;
  sample: number;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (!finite(value)) return "No disponible";
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function treatmentLabel(treatment: ProjectComparisonTreatment): string {
  return treatment.dose
    ? `${treatment.fertilizer} · ${treatment.dose}`
    : treatment.fertilizer;
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(\s*raphanus\s+sativus\s*\)/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCrop(value: string): string {
  const normalized = normalizeToken(value);
  return normalized === "raphanus sativus" ? "rabanito" : normalized;
}

function comparisonTreatments(rows: ProjectComparisonTreatment[]): ProjectComparisonTreatment[] {
  const crops = new Set(rows.map((row) => normalizeCrop(row.crop)).filter(Boolean));
  // No se mezclan especies distintas en una misma clasificación de fertilizantes.
  return crops.size <= 1 ? rows : [];
}

function weightedMean(
  rows: ProjectComparisonTreatment[],
  getMean: (row: ProjectComparisonTreatment) => number | null,
  getCount: (row: ProjectComparisonTreatment) => number,
): { n: number; mean: number | null } {
  let total = 0;
  let weighted = 0;
  for (const row of rows) {
    const mean = getMean(row);
    const count = getCount(row);
    if (finite(mean) && Number.isInteger(count) && count > 0) {
      weighted += mean * count;
      total += count;
    }
  }
  return { n: total, mean: total > 0 ? weighted / total : null };
}

/** Consolidates only spelling/scientific-name variants of the same crop + fertilizer + dose. */
function consolidateTreatments(rows: ProjectComparisonTreatment[]): ProjectComparisonTreatment[] {
  const groups = new Map<string, ProjectComparisonTreatment[]>();
  for (const row of rows) {
    const key = [normalizeCrop(row.crop), normalizeToken(row.fertilizer), normalizeToken(row.dose)].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) => {
    const first = group[0];
    const height = weightedMean(group, (row) => row.height.meanCm, (row) => row.height.n);
    const growth = weightedMean(group, (row) => row.growth.meanCmPerDay, (row) => row.growth.n);
    const growthPeriod = weightedMean(group, (row) => row.growth.meanPeriodDays, (row) => row.growth.n);
    const leaves = weightedMean(group, (row) => row.leaves.meanCount, (row) => row.leaves.n);
    const diameter = weightedMean(group, (row) => row.diameter.meanCm, (row) => row.diameter.n);
    const assessed = group.reduce((sum, row) => sum + row.health.assessed, 0);
    const healthy = group.reduce((sum, row) => sum + row.health.healthy, 0);
    return {
      ...first,
      plantCount: group.reduce((sum, row) => sum + row.plantCount, 0),
      // The RPC does not expose member IDs, so max avoids double-counting a member
      // when the same treatment is split only by a crop-name spelling variant.
      memberCount: Math.max(...group.map((row) => row.memberCount)),
      ageMinDays: group.every((row) => row.ageMinDays === null) ? null : Math.min(...group.flatMap((row) => row.ageMinDays === null ? [] : [row.ageMinDays])),
      ageMaxDays: group.every((row) => row.ageMaxDays === null) ? null : Math.max(...group.flatMap((row) => row.ageMaxDays === null ? [] : [row.ageMaxDays])),
      height: { n: height.n, meanCm: height.mean },
      growth: { n: growth.n, meanCmPerDay: growth.mean, meanPeriodDays: growthPeriod.mean },
      leaves: { n: leaves.n, meanCount: leaves.mean },
      diameter: { n: diameter.n, meanCm: diameter.mean },
      health: {
        assessed,
        healthy,
        healthyPercent: assessed > 0 ? (healthy / assessed) * 100 : null,
      },
    };
  });
}

function prepareSummary(data: ProjectComparisonData): ProjectComparisonData {
  const treatments = consolidateTreatments(data.treatments);
  const mergedAliases = treatments.length < data.treatments.length;
  const mixedCrops = new Set(treatments.map((row) => normalizeCrop(row.crop)).filter(Boolean)).size > 1;
  return {
    ...data,
    summary: { ...data.summary, treatments: treatments.length },
    treatments,
    warnings: [
      ...data.warnings,
      ...(mergedAliases ? ["Se unificaron variantes de escritura del nombre del cultivo para evitar duplicar tratamientos equivalentes."] : []),
      ...(mixedCrops ? ["Se detectaron varios cultivos en el proyecto. No se mezclaron entre sí para determinar un tratamiento ganador."] : []),
    ],
  };
}

function bestMetric(
  treatments: ProjectComparisonTreatment[],
  metric: "growth" | "height" | "health",
): MetricResult | null {
  const available: MetricResult[] = treatments.flatMap((treatment) => {
    if (metric === "growth") {
      const value = treatment.growth.meanCmPerDay;
      return finite(value) && treatment.growth.n > 0
        ? [{ treatment, value, sample: treatment.growth.n }]
        : [];
    }
    if (metric === "height") {
      const value = treatment.height.meanCm;
      return finite(value) && treatment.height.n > 0
        ? [{ treatment, value, sample: treatment.height.n }]
        : [];
    }
    const value = treatment.health.healthyPercent;
    return finite(value) && treatment.health.assessed > 0
      ? [{ treatment, value, sample: treatment.health.assessed }]
      : [];
  });
  // No se presenta un "mejor" tratamiento si solo uno tiene datos para ese indicador.
  if (available.length < 2) return null;
  available.sort((a, b) => b.value - a.value);
  if (available.length > 1 && Math.abs(available[0].value - available[1].value) < 1e-9) {
    return null;
  }
  return available[0] ?? null;
}

function getConclusion(data: ProjectComparisonData, winner: MetricResult | null, comparableGrowth: number): string {
  if (!data.summary.observations || !data.treatments.length) {
    return "Todavía no hay observaciones reales completas para elaborar una comparación. Cuando los integrantes registren sus mediciones, el resumen se actualizará.";
  }
  if (new Set(data.treatments.map((row) => normalizeCrop(row.crop)).filter(Boolean)).size > 1) {
    return "Se detectaron varios cultivos en el proyecto. Para evitar una comparación incorrecta, los resultados de especies distintas no se mezclan; revisa que el experimento corresponda al mismo cultivo.";
  }
  if (comparableGrowth < 2) {
    return "Aún no hay mediciones suficientes de crecimiento en al menos dos tratamientos. Se muestran los datos disponibles, pero todavía no se puede declarar un ganador.";
  }
  if (!winner) {
    return "Los tratamientos comparables obtuvieron el mismo valor máximo de crecimiento. Se informa el empate y no se declara un ganador único.";
  }
  return `${treatmentLabel(winner.treatment)} presentó la mayor velocidad media de crecimiento registrada: ${formatNumber(winner.value, 3)} cm/día, calculada con ${winner.sample} medición${winner.sample === 1 ? " válida" : "es válidas"}. Este resultado es descriptivo y no demuestra por sí solo que el fertilizante sea superior en todos los indicadores.`;
}

async function downloadSummaryPdf(data: ProjectComparisonData): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 13;
  const forest: [number, number, number] = [16, 67, 44];
  const pale: [number, number, number] = [237, 247, 235];
  const ink: [number, number, number] = [28, 43, 33];
  const muted: [number, number, number] = [95, 111, 98];
  const comparisonRows = comparisonTreatments(data.treatments);
  const growth = bestMetric(comparisonRows, "growth");
  const height = bestMetric(comparisonRows, "height");
  const health = bestMetric(comparisonRows, "health");
  const comparableGrowth = comparisonRows.filter((item) => item.growth.n > 0 && finite(item.growth.meanCmPerDay)).length;
  const winner = comparableGrowth >= 2 ? growth : null;

  doc.setProperties({
    title: "TerraNova - Resumen general del experimento",
    subject: "Resumen de resultados del cultivo",
    author: "TerraNova - Gestión de Cultivos",
    creator: "TerraNova",
  });

  // Encabezado del informe.
  doc.setFillColor(...forest);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(210, 239, 208);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("TerraNova", margin, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("Resumen general del experimento", margin, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Resultados consolidados del proyecto · Datos agregados desde Supabase", margin, 31);
  doc.setFontSize(8);
  doc.text(`Generado: ${formatDate(data.generatedAt)}`, pageWidth - margin, 25, { align: "right" });

  // Tarjeta del resultado principal.
  doc.setFillColor(...pale);
  doc.roundedRect(margin, 43, 115, 36, 4, 4, "F");
  doc.setTextColor(...forest);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("MAYOR CRECIMIENTO OBSERVADO", margin + 6, 51);
  doc.setFontSize(15);
  const winnerName = winner ? winner.treatment.fertilizer : comparableGrowth >= 2 ? "Empate · sin ganador único" : "Pendiente de evaluación";
  doc.text(doc.splitTextToSize(winnerName, 102), margin + 6, 61);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(winner ? `${formatNumber(winner.value, 3)} cm/día · n=${winner.sample}` : comparableGrowth >= 2 ? "Los tratamientos empataron en el valor máximo" : "No hay dos tratamientos comparables", margin + 6, 73);

  const cardStart = margin + 123;
  const cardGap = 5;
  const cardWidth = (pageWidth - margin * 2 - 123 - cardGap * 2) / 3;
  const highlights = [
    { label: "Mayor crecimiento", value: growth ? `${formatNumber(growth.value, 3)} cm/día` : "No disponible", treatment: growth ? treatmentLabel(growth.treatment) : "Sin datos" },
    { label: "Mayor altura media", value: height ? `${formatNumber(height.value, 2)} cm` : "No disponible", treatment: height ? treatmentLabel(height.treatment) : "Sin datos" },
    { label: "Mejor estado sanitario", value: health ? `${formatNumber(health.value, 1)} %` : "No disponible", treatment: health ? treatmentLabel(health.treatment) : "Sin datos" },
  ];
  highlights.forEach((item, index) => {
    const x = cardStart + index * (cardWidth + cardGap);
    doc.setFillColor(index === 1 ? 253 : 240, index === 1 ? 244 : 248, index === 1 ? 237 : 241);
    doc.roundedRect(x, 43, cardWidth, 36, 4, 4, "F");
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(item.label, x + 4, 51);
    doc.setTextColor(...ink);
    doc.setFontSize(12);
    doc.text(item.value, x + 4, 62);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(item.treatment, cardWidth - 8), x + 4, 71);
  });

  // Totales del proyecto.
  const statsY = 87;
  const stats = [
    ["Integrantes", String(data.summary.members)],
    ["Plantas evaluadas", String(data.summary.plants)],
    ["Tratamientos", String(data.summary.treatments)],
    ["Observaciones válidas", String(data.summary.observations)],
  ];
  const statsGap = 5;
  const statsWidth = (pageWidth - margin * 2 - statsGap * 3) / 4;
  stats.forEach(([label, value], index) => {
    const x = margin + index * (statsWidth + statsGap);
    doc.setFillColor(247, 250, 246);
    doc.roundedRect(x, statsY, statsWidth, 19, 3, 3, "F");
    doc.setTextColor(...forest);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(value, x + 5, statsY + 9);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(label, x + 5, statsY + 15);
  });

  // Tabla breve por tratamiento.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Resultados por tratamiento", margin, 116);
  autoTable(doc, {
    startY: 120,
    head: [["Fertilizante", "Dosis", "Plantas", "Altura media", "Crecimiento", "Hojas medias", "Diámetro", "Plantas sanas"]],
    body: data.treatments.map((item) => [
      item.fertilizer || "No especificado",
      item.dose || "No disponible",
      String(item.plantCount),
      finite(item.height.meanCm) ? `${formatNumber(item.height.meanCm, 2)} cm (n=${item.height.n})` : "No disponible",
      finite(item.growth.meanCmPerDay) ? `${formatNumber(item.growth.meanCmPerDay, 3)} cm/día (n=${item.growth.n})` : "No disponible",
      finite(item.leaves.meanCount) ? `${formatNumber(item.leaves.meanCount, 1)} (n=${item.leaves.n})` : "No disponible",
      finite(item.diameter.meanCm) ? `${formatNumber(item.diameter.meanCm, 2)} cm (n=${item.diameter.n})` : "No disponible",
      finite(item.health.healthyPercent) ? `${formatNumber(item.health.healthyPercent, 1)} % (n=${item.health.assessed})` : "No disponible",
    ]),
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2.2, textColor: ink, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: forest, textColor: [255, 255, 255], fontSize: 7 },
    alternateRowStyles: { fillColor: [243, 248, 242] },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 145;
  let conclusionY = finalY + 8;
  if (conclusionY + 22 > pageHeight - 12) {
    doc.addPage();
    doc.setFillColor(...forest);
    doc.rect(0, 0, pageWidth, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Conclusión del experimento", margin, 15);
    conclusionY = 34;
  }
  doc.setFillColor(...pale);
  doc.roundedRect(margin, conclusionY, pageWidth - margin * 2, 17, 3, 3, "F");
  doc.setTextColor(...forest);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONCLUSIÓN", margin + 4, conclusionY + 6);
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const conclusion = getConclusion(data, winner, comparableGrowth);
  doc.text(doc.splitTextToSize(conclusion, pageWidth - margin * 2 - 8), margin + 4, conclusionY + 11);

  if (data.warnings.length > 0) {
    let notesY = conclusionY + 24;
    if (notesY + 9 > pageHeight - 12) {
      doc.addPage();
      doc.setFillColor(...forest);
      doc.rect(0, 0, pageWidth, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Consideraciones del análisis", margin, 15);
      notesY = 34;
    }
    doc.setTextColor(...forest);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("Consideraciones", margin, notesY);
    notesY += 6;
    doc.setTextColor(...ink);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    for (const warning of data.warnings) {
      const lines = doc.splitTextToSize(`• ${warning}`, pageWidth - margin * 2 - 2);
      const blockHeight = lines.length * 3.6 + 2;
      if (notesY + blockHeight > pageHeight - 12) {
        doc.addPage();
        doc.setFillColor(...forest);
        doc.rect(0, 0, pageWidth, 24, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("Consideraciones del análisis", margin, 15);
        notesY = 34;
        doc.setTextColor(...ink);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
      }
      doc.text(lines, margin + 1, notesY);
      notesY += blockHeight;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const footerY = pageHeight - 7;
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    doc.text("Comparación descriptiva · No se infieren datos faltantes.", margin, footerY);
    doc.text(`Proyecto: ${data.projectId} · Página ${page}/${pageCount}`, pageWidth - margin, footerY, { align: "right" });
  }

  doc.save("TerraNova_resumen_general.pdf");
}

export default function TeamComparison() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProjectComparisonData | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const latest = prepareSummary(await readProjectComparisonPreview());
      setData(latest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar el resumen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function verify() {
      setCheckingAccess(true);
      try {
        const allowed = await isProjectComparisonAdmin();
        if (!active) return;
        setIsAdmin(allowed);
        if (allowed) await loadSummary();
      } catch (reason) {
        if (!active) return;
        setIsAdmin(false);
        setError(reason instanceof Error ? reason.message : "No se pudieron verificar los permisos.");
      } finally {
        if (active) setCheckingAccess(false);
      }
    }
    void verify();
    return () => { active = false; };
  }, [loadSummary]);

  const derived = useMemo(() => {
    if (!data) return null;
    const comparisonRows = comparisonTreatments(data.treatments);
    const growth = bestMetric(comparisonRows, "growth");
    const height = bestMetric(comparisonRows, "height");
    const health = bestMetric(comparisonRows, "health");
    const comparableGrowth = comparisonRows.filter(
      (item) => item.growth.n > 0 && finite(item.growth.meanCmPerDay),
    ).length;
    const winner = comparableGrowth >= 2 ? growth : null;
    const chartRows = comparisonRows
      .filter((item) => item.growth.n > 0 && finite(item.growth.meanCmPerDay))
      .slice()
      .sort((a, b) => (b.growth.meanCmPerDay ?? 0) - (a.growth.meanCmPerDay ?? 0));
    const maxGrowth = Math.max(0, ...chartRows.map((item) => Math.abs(item.growth.meanCmPerDay ?? 0)));
    return {
      growth, height, health, winner, comparableGrowth, chartRows, maxGrowth,
      conclusion: getConclusion(data, winner, comparableGrowth),
    };
  }, [data]);

  async function handleDownload() {
    if (!data || !isAdmin || downloading) return;
    setDownloading(true);
    setError("");
    try {
      // Reconsultar para que el PDF use la información más reciente disponible.
      const latest = prepareSummary(await readProjectComparisonPreview());
      setData(latest);
      await downloadSummaryPdf(latest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo descargar el resumen PDF.");
    } finally {
      setDownloading(false);
    }
  }

  if (checkingAccess) {
    return (
      <section className="tn-summary tn-summary-state" aria-live="polite">
        <RefreshCw className="tn-spin" size={22} />
        <p>Verificando acceso de administrador…</p>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section className="tn-summary tn-summary-state">
        <ShieldCheck size={30} />
        <h2>Acceso restringido</h2>
        <p>El resumen general del experimento está disponible únicamente para la cuenta administradora.</p>
      </section>
    );
  }

  return (
    <section className="tn-summary">
      <header className="tn-summary-header">
        <div className="tn-summary-title">
          <span className="tn-summary-mark"><Sprout size={28} /></span>
          <div>
            <p className="tn-summary-eyebrow">TERRANOVA · ANÁLISIS DE CAMPO</p>
            <h1>Resumen general del experimento</h1>
            <p>Resultados consolidados del cultivo y sus tratamientos.</p>
          </div>
        </div>
        <div className="tn-summary-actions-top">
          <span className="tn-admin-pill"><ShieldCheck size={15} /> Administrador</span>
          <button className="tn-icon-action" type="button" onClick={() => void loadSummary()} disabled={loading} aria-label="Actualizar resultados" title="Actualizar resultados">
            <RefreshCw size={17} className={loading ? "tn-spin" : ""} />
          </button>
        </div>
      </header>

      {error && <div className="tn-summary-error" role="alert"><AlertTriangle size={17} />{error}</div>}

      {loading && !data ? (
        <div className="tn-summary-loading"><RefreshCw className="tn-spin" size={22} />Consultando resultados reales de Supabase…</div>
      ) : data && derived ? (
        <>
          <div className="tn-summary-top-grid">
            <article className="tn-winner-card">
              <div className="tn-winner-copy">
                <div className="tn-winner-label"><Trophy size={25} /> <span>MAYOR CRECIMIENTO OBSERVADO</span></div>
                <h2>{derived.winner?.treatment.fertilizer ?? "Pendiente de evaluación"}</h2>
                <p>
                  {derived.winner
                    ? `Mayor velocidad media de crecimiento: ${formatNumber(derived.winner.value, 3)} cm/día.`
                    : derived.comparableGrowth >= 2
                      ? "Los tratamientos empataron en el crecimiento medio; no hay un ganador único."
                      : "Se necesitan mediciones válidas de al menos dos tratamientos para identificar un ganador."}
                </p>
                {derived.winner && <span className="tn-winner-sample">Dosis: {derived.winner.treatment.dose || "No especificada"} · n={derived.winner.sample} medición{derived.winner.sample === 1 ? "" : "es"}</span>}
              </div>
              <div className="tn-winner-visual" aria-hidden="true">
                <img src="/radish-sample.jpg" alt="" />
              </div>
              <span className="tn-winner-ribbon"><Trophy size={20} /></span>
            </article>

            <article className="tn-highlights-card">
              <div className="tn-card-heading"><BarChart3 size={21} /><h2>Resultados destacados</h2></div>
              <div className="tn-highlight-grid">
                <div className="tn-highlight tn-highlight-growth">
                  <Sprout size={27} />
                  <span>Mayor crecimiento</span>
                  <strong>{derived.growth ? `${formatNumber(derived.growth.value, 3)} cm/día` : "—"}</strong>
                  <small>{derived.growth ? treatmentLabel(derived.growth.treatment) : "Empate o datos insuficientes"}</small>
                </div>
                <div className="tn-highlight tn-highlight-height">
                  <FlaskConical size={27} />
                  <span>Mayor altura media</span>
                  <strong>{derived.height ? `${formatNumber(derived.height.value, 2)} cm` : "—"}</strong>
                  <small>{derived.height ? treatmentLabel(derived.height.treatment) : "Empate o datos insuficientes"}</small>
                </div>
                <div className="tn-highlight tn-highlight-health">
                  <ShieldCheck size={27} />
                  <span>Mejor estado sanitario</span>
                  <strong>{derived.health ? `${formatNumber(derived.health.value, 1)} %` : "—"}</strong>
                  <small>{derived.health ? treatmentLabel(derived.health.treatment) : "Empate o datos insuficientes"}</small>
                </div>
              </div>
            </article>
          </div>

          <div className="tn-summary-lower-grid">
            <article className="tn-growth-card">
              <div className="tn-card-heading"><BarChart3 size={21} /><h2>Velocidad media de crecimiento</h2></div>
              <p className="tn-card-subtitle">Comparación entre tratamientos · centímetros por día</p>
              {derived.chartRows.length >= 2 ? (
                <div className="tn-growth-chart">
                  {derived.chartRows.map((item, index) => {
                    const value = item.growth.meanCmPerDay ?? 0;
                    const width = derived.maxGrowth > 0 ? Math.max(3, (Math.abs(value) / derived.maxGrowth) * 100) : 0;
                    return (
                      <div className="tn-growth-row" key={`${item.crop}-${item.fertilizer}-${item.dose}`}>
                        <div className="tn-growth-meta"><strong>{treatmentLabel(item)}</strong><span>{formatNumber(value, 3)} cm/día · n={item.growth.n}</span></div>
                        <div className="tn-growth-track"><span className={`${index === 0 ? "is-best" : ""} ${value < 0 ? "is-negative" : ""}`} style={{ width: `${width}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="tn-empty-chart"><BarChart3 size={28} /><strong>Sin tratamientos comparables todavía</strong><span>Se necesitan mediciones válidas de crecimiento en al menos dos tratamientos para mostrar una comparación.</span></div>
              )}
              <p className="tn-chart-note">La velocidad se calcula con la diferencia entre la primera y última altura manual dividida entre los días transcurridos.</p>
            </article>

            <article className="tn-stats-card">
              <div className="tn-card-heading"><Users size={21} /><h2>Datos generales del experimento</h2></div>
              <div className="tn-stats-grid">
                <div className="tn-stat"><Users size={24} /><strong>{data.summary.members}</strong><span>Integrantes con registros</span></div>
                <div className="tn-stat"><Sprout size={24} /><strong>{data.summary.plants}</strong><span>Plantas evaluadas</span></div>
                <div className="tn-stat"><FlaskConical size={24} /><strong>{data.summary.treatments}</strong><span>Tratamientos</span></div>
                <div className="tn-stat"><CalendarDays size={24} /><strong>{data.summary.observations}</strong><span>Observaciones válidas</span></div>
              </div>
              <div className="tn-data-updated"><CheckCircle2 size={15} /> Datos consultados: {formatDate(data.generatedAt)}</div>
            </article>
          </div>

          <div className="tn-summary-bottom-grid">
            <article className="tn-conclusion-card">
              <div className="tn-conclusion-icon"><Leaf size={26} /></div>
              <div><h2>Conclusión general</h2><p>{derived.conclusion}</p></div>
            </article>
            <article className="tn-download-card">
              <div><FileDown size={25} /><strong>Resumen del experimento</strong><span>Indicadores y resultados disponibles</span></div>
              <button type="button" onClick={() => void handleDownload()} disabled={downloading || loading || !data}>
                {downloading ? <RefreshCw size={18} className="tn-spin" /> : <Download size={18} />}
                {downloading ? "Preparando PDF…" : "Descargar resumen PDF"}
              </button>
            </article>
          </div>

          {data.warnings.length > 0 && (
            <details className="tn-summary-warnings">
              <summary><AlertTriangle size={16} /> Consideraciones del análisis ({data.warnings.length})</summary>
              <ul>{data.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
            </details>
          )}
        </>
      ) : (
        <div className="tn-summary-loading">No se pudo cargar el resumen. Intenta actualizar.</div>
      )}
      <footer className="tn-summary-footer"><ShieldCheck size={14} /> Vista privada del administrador · Se muestran únicamente resultados agrupados, sin datos personales.</footer>
    </section>
  );
}

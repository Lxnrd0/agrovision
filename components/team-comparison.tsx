"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  FileDown,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  isProjectComparisonAdmin,
  readProjectComparisonPreview,
} from "@/lib/cloud";
import type {
  ProjectComparisonData,
  ProjectComparisonTreatment,
} from "@/lib/cloud";
import type { FieldRecord } from "@/lib/types";

type MetricKey = "growth" | "height" | "diameter" | "leaves" | "health";

type MetricDefinition = {
  key: MetricKey;
  label: string;
  unit: string;
  decimals: number;
  sampleLabel: string;
  value: (treatment: ProjectComparisonTreatment) => number | null;
  sample: (treatment: ProjectComparisonTreatment) => number;
};

const metricDefinitions: MetricDefinition[] = [
  {
    key: "growth",
    label: "Velocidad media de crecimiento",
    unit: "cm/día",
    decimals: 3,
    sampleLabel: "plantas con dos medidas",
    value: (treatment) => treatment.growth.meanCmPerDay,
    sample: (treatment) => treatment.growth.n,
  },
  {
    key: "height",
    label: "Altura media final",
    unit: "cm",
    decimals: 2,
    sampleLabel: "plantas medidas",
    value: (treatment) => treatment.height.meanCm,
    sample: (treatment) => treatment.height.n,
  },
  {
    key: "diameter",
    label: "Diámetro medio",
    unit: "cm",
    decimals: 2,
    sampleLabel: "plantas medidas",
    value: (treatment) => treatment.diameter.meanCm,
    sample: (treatment) => treatment.diameter.n,
  },
  {
    key: "leaves",
    label: "Número medio de hojas",
    unit: "hojas",
    decimals: 1,
    sampleLabel: "plantas medidas",
    value: (treatment) => treatment.leaves.meanCount,
    sample: (treatment) => treatment.leaves.n,
  },
  {
    key: "health",
    label: "Plantas registradas como sanas",
    unit: "%",
    decimals: 1,
    sampleLabel: "plantas con estado evaluado",
    value: (treatment) => treatment.health.healthyPercent,
    sample: (treatment) => treatment.health.assessed,
  },
];

const GREEN: [number, number, number] = [24, 91, 61];
const DARK: [number, number, number] = [25, 43, 34];
const LIGHT_GREEN: [number, number, number] = [232, 245, 235];
const MUTED: [number, number, number] = [93, 105, 97];
const WHITE: [number, number, number] = [255, 255, 255];
const ORANGE: [number, number, number] = [183, 112, 32];

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCount(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`La respuesta de Supabase contiene un conteo inválido (${label}). No se generó el PDF.`);
  }
}

function assertNullableNumber(
  value: unknown,
  label: string,
  options: { allowNegative?: boolean } = {},
): asserts value is number | null {
  if (value === null) return;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (!options.allowNegative && value < 0)
  ) {
    throw new Error(`La respuesta de Supabase contiene una medida inválida (${label}). No se generó el PDF.`);
  }
}

function validateComparisonData(input: unknown): ProjectComparisonData {
  if (!isObject(input)) {
    throw new Error("Supabase devolvió un informe vacío o con formato incorrecto.");
  }

  const summary = input.summary;
  const treatments = input.treatments;
  const methodology = input.methodology;

  if (
    typeof input.projectId !== "string" ||
    !input.projectId.trim() ||
    typeof input.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    !isObject(summary) ||
    !Array.isArray(treatments) ||
    !Array.isArray(input.warnings) ||
    !input.warnings.every((warning) => typeof warning === "string") ||
    !isObject(methodology)
  ) {
    throw new Error("La respuesta de Supabase está incompleta. No se generó un informe que pudiera inducir a error.");
  }

  const observationCount = summary.observations;
  const plantCount = summary.plants;
  const memberCount = summary.members;
  const treatmentCount = summary.treatments;
  assertCount(observationCount, "resumen.observations");
  assertCount(plantCount, "resumen.plants");
  assertCount(memberCount, "resumen.members");
  assertCount(treatmentCount, "resumen.treatments");

  if (
    treatmentCount !== treatments.length ||
    observationCount < plantCount ||
    memberCount > plantCount ||
    treatmentCount > plantCount
  ) {
    throw new Error("Los totales del informe no coinciden con los tratamientos recibidos. Actualiza los datos antes de generar el PDF.");
  }

  const validatedTreatments = treatments.map((raw, index) => {
    if (!isObject(raw)) {
      throw new Error(`El tratamiento ${index + 1} tiene un formato inválido.`);
    }

    const treatment = raw as unknown as ProjectComparisonTreatment;
    if (
      typeof treatment.crop !== "string" ||
      !treatment.crop.trim() ||
      typeof treatment.fertilizer !== "string" ||
      !treatment.fertilizer.trim() ||
      typeof treatment.dose !== "string" ||
      !treatment.dose.trim() ||
      !isObject(treatment.height) ||
      !isObject(treatment.growth) ||
      !isObject(treatment.leaves) ||
      !isObject(treatment.diameter) ||
      !isObject(treatment.health)
    ) {
      throw new Error(`El tratamiento ${index + 1} tiene campos incompletos.`);
    }

    assertCount(treatment.plantCount, `tratamiento ${index + 1}: plantas`);
    assertCount(treatment.memberCount, `tratamiento ${index + 1}: integrantes`);
    assertCount(treatment.height.n, `tratamiento ${index + 1}: n altura`);
    assertCount(treatment.growth.n, `tratamiento ${index + 1}: n crecimiento`);
    assertCount(treatment.leaves.n, `tratamiento ${index + 1}: n hojas`);
    assertCount(treatment.diameter.n, `tratamiento ${index + 1}: n diámetro`);
    assertCount(treatment.health.assessed, `tratamiento ${index + 1}: sanidad evaluada`);
    assertCount(treatment.health.healthy, `tratamiento ${index + 1}: sanas`);

    if (
      treatment.plantCount < 1 ||
      treatment.memberCount < 1 ||
      treatment.memberCount > treatment.plantCount ||
      treatment.height.n > treatment.plantCount ||
      treatment.growth.n > treatment.plantCount ||
      treatment.leaves.n > treatment.plantCount ||
      treatment.diameter.n > treatment.plantCount ||
      treatment.health.assessed > treatment.plantCount ||
      treatment.health.healthy > treatment.health.assessed
    ) {
      throw new Error(`Los tamaños de muestra del tratamiento ${treatment.fertilizer} no son coherentes.`);
    }

    assertNullableNumber(treatment.height.meanCm, "altura");
    assertNullableNumber(treatment.growth.meanCmPerDay, "crecimiento", { allowNegative: true });
    assertNullableNumber(treatment.growth.meanPeriodDays, "periodo de crecimiento");
    assertNullableNumber(treatment.leaves.meanCount, "número de hojas");
    assertNullableNumber(treatment.diameter.meanCm, "diámetro");
    assertNullableNumber(treatment.health.healthyPercent, "porcentaje de plantas sanas");

    const metricPairs = [
      [treatment.height.n, treatment.height.meanCm, "altura"],
      [treatment.growth.n, treatment.growth.meanCmPerDay, "crecimiento"],
      [treatment.leaves.n, treatment.leaves.meanCount, "hojas"],
      [treatment.diameter.n, treatment.diameter.meanCm, "diámetro"],
      [treatment.health.assessed, treatment.health.healthyPercent, "sanidad"],
    ] as const;

    for (const [count, mean, label] of metricPairs) {
      if ((count === 0) !== (mean === null)) {
        throw new Error(`El conteo y el resultado de ${label} no coinciden en ${treatment.fertilizer}.`);
      }
    }

    if (
      (treatment.growth.n === 0) !== (treatment.growth.meanPeriodDays === null) ||
      (treatment.growth.meanPeriodDays !== null && treatment.growth.meanPeriodDays <= 0) ||
      (treatment.health.assessed > 0 &&
        treatment.health.healthyPercent !== null &&
        Math.abs(
          treatment.health.healthyPercent -
          (100 * treatment.health.healthy) / treatment.health.assessed,
        ) > 0.11)
    ) {
      throw new Error(`La respuesta de sanidad o crecimiento no es coherente para ${treatment.fertilizer}.`);
    }

    const ageMin = treatment.ageMinDays;
    const ageMax = treatment.ageMaxDays;
    if (
      ageMin === null ||
      ageMax === null ||
      !Number.isSafeInteger(ageMin) ||
      !Number.isSafeInteger(ageMax) ||
      ageMin < 0 ||
      ageMax < ageMin
    ) {
      throw new Error(`El rango de edad de las plantas no es válido para ${treatment.fertilizer}.`);
    }

    return treatment;
  });

  const sumPlants = validatedTreatments.reduce((sum, treatment) => sum + treatment.plantCount, 0);
  if (sumPlants !== summary.plants) {
    throw new Error("La suma de plantas por tratamiento no coincide con el total del proyecto. No se generó el PDF.");
  }

  for (const key of ["measurements", "growth", "averages", "privacy"] as const) {
    if (typeof methodology[key] !== "string" || !methodology[key].trim()) {
      throw new Error(`Falta la metodología del informe (${key}).`);
    }
  }

  return {
    projectId: input.projectId,
    generatedAt: input.generatedAt,
    summary: {
      observations: observationCount,
      plants: plantCount,
      members: memberCount,
      treatments: treatmentCount,
    },
    treatments: validatedTreatments,
    warnings: input.warnings as string[],
    methodology: {
      measurements: methodology.measurements as string,
      growth: methodology.growth as string,
      averages: methodology.averages as string,
      privacy: methodology.privacy as string,
    },
  };
}

function sampleCount(treatment: ProjectComparisonTreatment, metric: MetricKey): number {
  switch (metric) {
    case "growth": return treatment.growth.n;
    case "height": return treatment.height.n;
    case "diameter": return treatment.diameter.n;
    case "leaves": return treatment.leaves.n;
    case "health": return treatment.health.assessed;
  }
}

function metricValue(treatment: ProjectComparisonTreatment, metric: MetricKey): number | null {
  switch (metric) {
    case "growth": return treatment.growth.meanCmPerDay;
    case "height": return treatment.height.meanCm;
    case "diameter": return treatment.diameter.meanCm;
    case "leaves": return treatment.leaves.meanCount;
    case "health": return treatment.health.healthyPercent;
  }
}

function treatmentLabel(treatment: ProjectComparisonTreatment): string {
  return `${treatment.fertilizer}${treatment.dose ? ` · ${treatment.dose}` : ""}`;
}

function groupByCrop(treatments: ProjectComparisonTreatment[]) {
  const groups = new Map<string, ProjectComparisonTreatment[]>();
  for (const treatment of treatments) {
    const key = treatment.crop.trim();
    const group = groups.get(key) ?? [];
    group.push(treatment);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
}

function comparableTreatments(
  treatments: ProjectComparisonTreatment[],
  metric: MetricKey,
): ProjectComparisonTreatment[] {
  return treatments.filter((treatment) => {
    const value = metricValue(treatment, metric);
    return value !== null && Number.isFinite(value) && sampleCount(treatment, metric) > 0;
  });
}

function metricResultText(
  treatments: ProjectComparisonTreatment[],
  metric: MetricDefinition,
): { treatment: string; result: string; sample: string } {
  const available = comparableTreatments(treatments, metric.key);

  if (available.length === 0) {
    return {
      treatment: "Sin mediciones válidas",
      result: "No disponible",
      sample: `0 de ${treatments.length} tratamientos`,
    };
  }

  if (available.length === 1) {
    const only = available[0];
    return {
      treatment: `Sin comparación; dato de ${treatmentLabel(only)}`,
      result: `${formatNumber(metric.value(only), metric.decimals)} ${metric.unit}`,
      sample: `1 de ${treatments.length} tratamientos; n=${metric.sample(only)}`,
    };
  }

  const highest = Math.max(...available.map((item) => metric.value(item) as number));
  const leaders = available.filter((item) => Math.abs((metric.value(item) as number) - highest) < 0.0000001);
  const label = leaders.length > 1
    ? `Empate: ${leaders.map(treatmentLabel).join(" / ")}`
    : treatmentLabel(leaders[0]);
  const n = leaders.reduce((sum, item) => sum + metric.sample(item), 0);

  return {
    treatment: label,
    result: `${formatNumber(highest, metric.decimals)} ${metric.unit}`,
    sample: `${available.length} tratamientos comparables; n=${n} en el valor destacado`,
  };
}

function addTextBlock(
  doc: import("jspdf").jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  fontSize = 8.5,
  color: [number, number, number] = DARK,
  lineHeight = 4.2,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawPageHeader(
  doc: import("jspdf").jsPDF,
  title: string,
  subtitle?: string,
) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...DARK);
  doc.rect(0, 0, width, 27, "F");
  doc.setTextColor(180, 226, 188);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("TerraNova", 14, 11);
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.text(title, 14, 19);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(subtitle, width - 14, 19, { align: "right" });
  }
}

async function downloadTeamComparisonPdf(rawData: ProjectComparisonData): Promise<void> {
  const data = validateComparisonData(rawData);
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const right = pageWidth - margin;
  const usableWidth = pageWidth - margin * 2;
  const generated = new Date(data.generatedAt);
  const generatedLabel = generated.toLocaleString("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const cropGroups = groupByCrop(data.treatments);
  const allComparableResults = cropGroups.flatMap(([crop, treatments]) =>
    metricDefinitions.flatMap((metric) => {
      const available = comparableTreatments(treatments, metric.key);
      if (available.length < 2) return [];
      const result = metricResultText(treatments, metric);
      return [{ crop, metric, result }];
    }),
  );

  doc.setProperties({
    title: "TerraNova - Informe comparativo del experimento",
    subject: "Análisis descriptivo de tratamientos de cultivo",
    author: "TerraNova - Gestión de Cultivos",
    creator: "TerraNova",
    keywords: "TerraNova, cultivo, fertilizantes, mediciones manuales, informe",
  });

  // PÁGINA 1: portada, trazabilidad y resumen.
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageWidth, 39, "F");
  doc.setTextColor(180, 226, 188);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("TerraNova", margin, 14);
  doc.setTextColor(...WHITE);
  doc.setFontSize(15);
  doc.text("Informe comparativo del experimento", margin, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Análisis descriptivo basado en registros de campo del proyecto", margin, 31);
  doc.setFontSize(7);
  doc.text(`Proyecto: ${data.projectId}  ·  Generado: ${generatedLabel}`, right, 31, { align: "right" });

  let y = 49;
  const cardGap = 5;
  const cardWidth = (usableWidth - cardGap * 3) / 4;
  const cards = [
    { label: "Registros incluidos", value: data.summary.observations },
    { label: "Plantas identificadas", value: data.summary.plants },
    { label: "Cuentas con registros", value: data.summary.members },
    { label: "Tratamientos", value: data.summary.treatments },
  ];

  cards.forEach((card, index) => {
    const x = margin + index * (cardWidth + cardGap);
    doc.setFillColor(...LIGHT_GREEN);
    doc.roundedRect(x, y, cardWidth, 22, 2.5, 2.5, "F");
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(card.label, x + 4, y + 7);
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(String(card.value), x + 4, y + 17);
  });

  y += 32;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resultados por indicador y cultivo", margin, y);
  y += 3;

  const highlightRows: string[][] = [];
  for (const [crop, treatments] of cropGroups) {
    for (const metric of metricDefinitions) {
      const result = metricResultText(treatments, metric);
      highlightRows.push([
        crop,
        metric.label,
        result.treatment,
        result.result,
        result.sample,
      ]);
    }
  }

  if (highlightRows.length === 0) {
    highlightRows.push(["—", "—", "Sin tratamientos", "No disponible", "—"]);
  }

  autoTable(doc, {
    startY: y,
    head: [["Cultivo", "Indicador", "Resultado comparativo", "Valor", "Muestra disponible"]],
    body: highlightRows,
    theme: "striped",
    styles: { fontSize: 7.5, cellPadding: 2.2, overflow: "linebreak", valign: "middle", textColor: DARK },
    headStyles: { fillColor: GREEN, textColor: WHITE, fontSize: 7.2 },
    alternateRowStyles: { fillColor: LIGHT_GREEN },
    columnStyles: {
      0: { cellWidth: 34 },
      1: { cellWidth: 57 },
      2: { cellWidth: 78 },
      3: { cellWidth: 40 },
      4: { cellWidth: 60 },
    },
    margin: { left: margin, right: margin, top: 43, bottom: 16 },
    didDrawPage: (hookData: { pageNumber: number }) => {
      if (hookData.pageNumber > 1) {
        drawPageHeader(doc, "Resultados por indicador", "Continuación del resumen comparativo");
      }
    },
  });

  y = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30) + 6;
  if (y + 18 > pageHeight - 12) {
    doc.addPage();
    drawPageHeader(doc, "Criterio de interpretación");
    y = 39;
  }
  doc.setFillColor(250, 247, 236);
  doc.roundedRect(margin, y, usableWidth, 15, 2, 2, "F");
  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Importante: no se declara un ganador global ni se inventa una puntuación.", margin + 4, y + 5);
  addTextBlock(
    doc,
    "Los fertilizantes solo se comparan dentro del mismo cultivo y cuando al menos dos tratamientos tienen datos válidos para el indicador. Un único tratamiento con mediciones no permite afirmar que sea superior.",
    margin + 4,
    y + 10,
    usableWidth - 8,
    7.2,
    DARK,
    3.5,
  );

  // PÁGINA 2: tabla detallada por tratamiento y ranking limitado a crecimiento.
  doc.addPage();
  drawPageHeader(doc, "Detalle de tratamientos", "Medias calculadas por planta; N indica plantas con medición válida");
  y = 35;

  const treatmentRows: string[][] = [];
  for (const [crop, treatments] of cropGroups) {
    const growthAvailable = comparableTreatments(treatments, "growth");
    const growthRank = new Map<ProjectComparisonTreatment, number>();
    if (growthAvailable.length >= 2) {
      const sortedGrowth = [...growthAvailable].sort(
        (a, b) => (metricValue(b, "growth") ?? -Infinity) - (metricValue(a, "growth") ?? -Infinity),
      );
      let rank = 0;
      let previousValue: number | null = null;
      sortedGrowth.forEach((treatment, index) => {
        const currentValue = metricValue(treatment, "growth") as number;
        if (previousValue === null || Math.abs(currentValue - previousValue) > 0.0000001) {
          rank = index + 1;
        }
        growthRank.set(treatment, rank);
        previousValue = currentValue;
      });
    }

    for (const treatment of treatments) {
      const growthValue = treatment.growth.meanCmPerDay;
      const rank = growthRank.get(treatment);
      treatmentRows.push([
        crop,
        treatment.fertilizer,
        treatment.dose,
        String(treatment.plantCount),
        String(treatment.memberCount),
        `${treatment.height.n} / ${formatNumber(treatment.height.meanCm, 2)}`,
        `${treatment.growth.n} / ${formatNumber(growthValue, 3)}`,
        `${treatment.leaves.n} / ${formatNumber(treatment.leaves.meanCount, 1)}`,
        `${treatment.diameter.n} / ${formatNumber(treatment.diameter.meanCm, 2)}`,
        treatment.health.assessed
          ? `${treatment.health.healthy}/${treatment.health.assessed} (${formatNumber(treatment.health.healthyPercent, 1)}%)`
          : "No evaluado",
        rank ? `${rank}.º` : "Sin puesto",
        treatment.ageMinDays === treatment.ageMaxDays
          ? `${treatment.ageMinDays} días`
          : `${treatment.ageMinDays}-${treatment.ageMaxDays} días`,
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    head: [[
      "Cultivo",
      "Fertilizante",
      "Dosis",
      "Plantas",
      "Integrantes",
      "Altura N/media (cm)",
      "Crecimiento N/media (cm/día)",
      "Hojas N/media",
      "Diámetro N/media (cm)",
      "Sanidad (sanas/evaluadas)",
      "Puesto por crecimiento",
      "Edad registrada",
    ]],
    body: treatmentRows.length ? treatmentRows : [["—", "Sin datos", "—", "0", "0", "—", "—", "—", "—", "—", "—", "—"]],
    theme: "grid",
    styles: { fontSize: 6.2, cellPadding: 1.7, overflow: "linebreak", valign: "middle", textColor: DARK },
    headStyles: { fillColor: GREEN, textColor: WHITE, fontSize: 6.2 },
    alternateRowStyles: { fillColor: [244, 248, 244] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 31 },
      2: { cellWidth: 32 },
      3: { cellWidth: 11 },
      4: { cellWidth: 12 },
      5: { cellWidth: 23 },
      6: { cellWidth: 28 },
      7: { cellWidth: 18 },
      8: { cellWidth: 21 },
      9: { cellWidth: 27 },
      10: { cellWidth: 22 },
      11: { cellWidth: 18 },
    },
    margin: { left: margin, right: margin, top: 33, bottom: 16 },
    didDrawPage: () => drawPageHeader(doc, "Detalle de tratamientos", "N = plantas con medición válida"),
  });

  y = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 7;
  if (y + 13 > pageHeight - 16) {
    doc.addPage();
    drawPageHeader(doc, "Lectura del ranking");
    y = 38;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  addTextBlock(
    doc,
    "El puesto solo se asigna por velocidad media de crecimiento y únicamente si dos o más tratamientos del mismo cultivo tienen mediciones válidas. No es una clasificación global de rendimiento.",
    margin,
    y,
    usableWidth,
    7.5,
    MUTED,
    3.8,
  );

  // PÁGINA 3+: gráficos comparativos. Nunca se grafica como comparación un único tratamiento.
  const charts = cropGroups.flatMap(([crop, treatments]) =>
    metricDefinitions.flatMap((metric) => {
      const available = comparableTreatments(treatments, metric.key);
      return available.length >= 2 ? [{ crop, metric, treatments: available }] : [];
    }),
  );

  doc.addPage();
  drawPageHeader(doc, "Gráficos comparativos", "Solo se muestran indicadores con al menos dos tratamientos comparables");
  let chartY = 37;

  if (charts.length === 0) {
    doc.setFillColor(...LIGHT_GREEN);
    doc.roundedRect(margin, chartY, usableWidth, 35, 3, 3, "F");
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Aún no hay datos suficientes para gráficos comparativos", margin + 7, chartY + 11);
    addTextBlock(
      doc,
      "Para comparar un indicador se necesitan al menos dos tratamientos del mismo cultivo con mediciones válidas. En este informe, un valor disponible para un solo fertilizante se presenta como dato descriptivo, no como ganador.",
      margin + 7,
      chartY + 20,
      usableWidth - 14,
      8.5,
      DARK,
      4.3,
    );
    chartY += 47;
  } else {
    const maxRowsPerChartPage = 12;
    for (const chart of charts) {
      const sortedRows = [...chart.treatments].sort(
        (a, b) => (metricValue(b, chart.metric.key) ?? -Infinity) - (metricValue(a, chart.metric.key) ?? -Infinity),
      );

      for (let offset = 0; offset < sortedRows.length; offset += maxRowsPerChartPage) {
        const rows = sortedRows.slice(offset, offset + maxRowsPerChartPage);
        const isContinuation = offset > 0;
        const blockHeight = 17 + rows.length * 11;
        if (chartY + blockHeight > pageHeight - 18) {
          doc.addPage();
          drawPageHeader(doc, "Gráficos comparativos", chart.crop);
          chartY = 37;
        }

        doc.setTextColor(...DARK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(
          `${chart.crop} · ${chart.metric.label} (${chart.metric.unit})${isContinuation ? " · continuación" : ""}`,
          margin,
          chartY,
        );
        chartY += 6;

        const labelWidth = 66;
        const valueWidth = 35;
        const barX = margin + labelWidth;
        const barWidth = usableWidth - labelWidth - valueWidth - 3;
        const values = rows.map((row) => metricValue(row, chart.metric.key) as number);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const hasNegative = minValue < 0;
        const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue), 0.000001);
        const zeroX = hasNegative ? barX + barWidth / 2 : barX;

        rows.forEach((treatment) => {
          const value = metricValue(treatment, chart.metric.key) as number;
          const label = treatmentLabel(treatment);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.8);
          doc.setTextColor(...DARK);
          doc.text(doc.splitTextToSize(label, labelWidth - 3).slice(0, 2), margin, chartY + 4);

          doc.setFillColor(238, 243, 238);
          doc.roundedRect(barX, chartY - 1, barWidth, 6, 1.5, 1.5, "F");
          if (hasNegative) {
            doc.setDrawColor(160, 170, 160);
            doc.setLineWidth(0.25);
            doc.line(zeroX, chartY - 2, zeroX, chartY + 6);
            const length = (Math.abs(value) / maxAbs) * (barWidth / 2);
            doc.setFillColor(...(value >= 0 ? GREEN : ORANGE));
            if (length > 0) {
              doc.roundedRect(value >= 0 ? zeroX : zeroX - length, chartY - 1, length, 6, 1.2, 1.2, "F");
            }
          } else {
            const length = (value / Math.max(maxValue, 0.000001)) * barWidth;
            doc.setFillColor(...GREEN);
            if (length > 0) doc.roundedRect(barX, chartY - 1, length, 6, 1.2, 1.2, "F");
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.8);
          doc.setTextColor(...DARK);
          doc.text(
            `${formatNumber(value, chart.metric.decimals)} · n=${chart.metric.sample(treatment)}`,
            right,
            chartY + 4,
            { align: "right" },
          );
          chartY += 10;
        });
        chartY += 7;
      }
    }
  }

  // PÁGINA FINAL: método, advertencias y conclusión prudente.
  doc.addPage();
  drawPageHeader(doc, "Metodología, límites y conclusión");
  let finalY = 37;

  const methodologyRows = [
    ["Fuente de datos", "Consulta nueva a la función segura de Supabase al pulsar el botón. Se excluyen los registros de demostración."],
    ["Criterios de inclusión", "Registros del proyecto con cultivo, identificador de planta, fertilizante, dosis y fechas válidas; la observación no puede ser anterior a la siembra."],
    ["Mediciones", data.methodology.measurements],
    ["Velocidad de crecimiento", data.methodology.growth.replace(/−/g, "menos") + " Se requiere más de una fecha de medición por planta."],
    ["Promedios", data.methodology.averages],
    ["Estado sanitario", "Se calcula con los estados registrados como Sano o Enfermo. Indeterminado/no evaluado queda fuera del denominador. Es una observación de campo, no un diagnóstico."],
    ["Comparabilidad", "Los tratamientos se comparan dentro del mismo cultivo. Un indicador requiere al menos dos tratamientos con datos válidos; no se mezclan cultivos distintos."],
    ["Privacidad", data.methodology.privacy],
  ];

  autoTable(doc, {
    startY: finalY,
    head: [["Aspecto", "Criterio aplicado"]],
    body: methodologyRows,
    theme: "grid",
    styles: { fontSize: 7.4, cellPadding: 2.4, overflow: "linebreak", valign: "top", textColor: DARK },
    headStyles: { fillColor: GREEN, textColor: WHITE },
    columnStyles: { 0: { cellWidth: 43 } },
    margin: { left: margin, right: margin, top: 32, bottom: 16 },
    didDrawPage: () => drawPageHeader(doc, "Metodología, límites y conclusión"),
  });

  finalY = ((doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY + 70) + 7;

  const warnings = [...data.warnings];
  if (data.summary.observations === 0) {
    warnings.push("No hay registros elegibles para analizar en este proyecto.");
  }
  if (data.summary.treatments === 0) {
    warnings.push("No se identificaron tratamientos para comparar.");
  }
  if (data.summary.treatments > 0 && data.treatments.some((treatment) => treatment.plantCount < 2)) {
    warnings.push("Hay tratamientos representados por una sola planta. Sus resultados son descriptivos y no permiten estimar variabilidad entre plantas.");
  }
  if (cropGroups.length > 1) {
    warnings.push("Se identificaron varios cultivos. Los resultados se presentan por cultivo y no se comparan especies distintas entre sí.");
  }
  if (allComparableResults.length === 0 && data.treatments.length > 0) {
    warnings.push("Ningún indicador cuenta con al menos dos tratamientos del mismo cultivo con datos válidos; todavía no se puede establecer una comparación.");
  }
  warnings.push("El formulario actual no registra peso de raíz o peso de cosecha; ese indicador no se puede calcular.");
  warnings.push("Las medidas manuales dependen de la correcta toma e ingreso por parte de los integrantes. El sistema no verifica físicamente cada medición.");
  warnings.push("No se calcula un puntaje global ni se declara un fertilizante ganador absoluto: no existe una ponderación experimental predefinida para combinar indicadores diferentes.");
  const uniqueWarnings = [...new Set(warnings)];

  if (finalY + 20 > pageHeight - 18) {
    doc.addPage();
    drawPageHeader(doc, "Advertencias y conclusión");
    finalY = 37;
  }

  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Advertencias y límites", margin, finalY);
  finalY += 6;

  for (const warning of uniqueWarnings) {
    const lines = doc.splitTextToSize(`• ${warning}`, usableWidth - 2) as string[];
    if (finalY + lines.length * 3.8 > pageHeight - 32) {
      doc.addPage();
      drawPageHeader(doc, "Advertencias y conclusión");
      finalY = 37;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...DARK);
    doc.text(lines, margin + 1, finalY);
    finalY += lines.length * 3.8 + 2;
  }

  if (finalY + 25 > pageHeight - 16) {
    doc.addPage();
    drawPageHeader(doc, "Conclusión del análisis");
    finalY = 40;
  }

  let conclusion: string;
  if (allComparableResults.length === 0) {
    conclusion = "Con los datos disponibles no es posible determinar qué fertilizante obtuvo mejores resultados. Algunos indicadores pueden tener valores registrados para un solo tratamiento, pero eso no constituye una comparación. Se necesitan mediciones válidas en al menos dos tratamientos del mismo cultivo para comparar cada indicador.";
  } else {
    const statements = allComparableResults.slice(0, 5).map(({ crop, metric, result }) =>
      `${crop}: mayor valor numérico observado en ${metric.label.toLowerCase()} para ${result.treatment} (${result.result}).`,
    );
    conclusion = `${statements.join(" ")} Estos resultados son descriptivos y se interpretan por indicador. No se declara un ganador absoluto porque un mayor valor en una variable no implica necesariamente mejor rendimiento agronómico y no se definió una ponderación validada entre indicadores.`;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  const conclusionLines = doc.splitTextToSize(conclusion, usableWidth - 10) as string[];
  const conclusionBoxHeight = 14 + conclusionLines.length * 3.7 + 4;
  if (finalY + conclusionBoxHeight > pageHeight - 14) {
    doc.addPage();
    drawPageHeader(doc, "Conclusión del análisis");
    finalY = 40;
  }
  doc.setFillColor(...LIGHT_GREEN);
  doc.roundedRect(margin, finalY, usableWidth, conclusionBoxHeight, 2.5, 2.5, "F");
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Conclusión", margin + 5, finalY + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...DARK);
  doc.text(conclusionLines, margin + 5, finalY + 13);

  // Pie de página uniforme, con numeración final.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...MUTED);
    doc.text(
      `TerraNova · Informe comparativo · ${data.projectId} · Página ${page} de ${pageCount}`,
      pageWidth - margin,
      pageHeight - 5,
      { align: "right" },
    );
  }

  doc.save("TerraNova_informe_comparativo.pdf");
}

export default function TeamComparison(_props: { records: FieldRecord[] }) {
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
      // Esta RPC consulta Supabase en el momento del clic; no usa los registros
      // personales cargados en pantalla ni una copia local/caché del informe.
      const latestData = await readProjectComparisonPreview();
      await downloadTeamComparisonPdf(latestData);
      setMessage("Informe generado y descargado correctamente con los datos consultados en Supabase.");
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setGenerating(false);
    }
  }

  if (checkingAccess) {
    return (
      <div className="team-comparison">
        <section className="panel" style={{ padding: 24, textAlign: "center" }}>
          <RefreshCw size={20} className="auth-spinner" />
          <p className="table-note">Verificando permisos…</p>
        </section>
      </div>
    );
  }

  return (
    <div className="team-comparison">
      <section className="panel" style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <div className="section-heading" style={{ alignItems: "flex-start" }}>
          <div>
            <h2>Informe comparativo del experimento</h2>
            <p>
              Genera un PDF con los datos agrupados de Supabase. Solo se comparan
              tratamientos del mismo cultivo y con mediciones válidas.
            </p>
          </div>
          <FileDown size={28} />
        </div>

        {isAdmin ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: 13, borderRadius: 10, background: "var(--surface-secondary, rgba(35, 120, 70, .08))", margin: "18px 0" }}>
              <ShieldCheck size={19} />
              <span className="table-note">
                Acceso de administrador. Los datos se consultan nuevamente en Supabase cada vez que generas el PDF.
              </span>
            </div>
            <button
              className="button primary"
              type="button"
              onClick={() => void generateReport()}
              disabled={generating}
              style={{ width: "100%", minHeight: 48, justifyContent: "center" }}
            >
              {generating ? <RefreshCw size={18} className="auth-spinner" /> : <FileDown size={18} />}
              {generating ? "Validando datos y generando PDF…" : "Generar informe PDF"}
            </button>
            <p className="table-note" style={{ marginTop: 12, textAlign: "center" }}>
              El informe se descarga en tu dispositivo. No muestra datos personales ni registros individuales.
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

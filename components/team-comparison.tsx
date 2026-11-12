"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  RefreshCw,
  Send,
  Sprout,
  Trophy,
  Users,
} from "lucide-react";
import {
  isProjectComparisonAdmin,
  publishProjectComparison,
  readProjectComparisonPreview,
  readPublishedProjectComparison,
} from "@/lib/cloud";
import type {
  ProjectComparisonData,
  ProjectComparisonTreatment,
  PublishedProjectComparison,
} from "@/lib/cloud";
import type { FieldRecord } from "@/lib/types";
import Comparison from "./comparison";

type RankingMetric = "growth" | "height" | "diameter" | "leaves" | "health";

const rankingOptions: { value: RankingMetric; label: string; unit: string }[] = [
  { value: "growth", label: "Velocidad de crecimiento", unit: "cm/día" },
  { value: "height", label: "Altura media", unit: "cm" },
  { value: "diameter", label: "Diámetro medio", unit: "cm" },
  { value: "leaves", label: "Número medio de hojas", unit: "hojas" },
  { value: "health", label: "Porcentaje de plantas sanas", unit: "%" },
];

function metricValue(
  treatment: ProjectComparisonTreatment,
  metric: RankingMetric,
): number | null {
  switch (metric) {
    case "growth": return treatment.growth.meanCmPerDay;
    case "height": return treatment.height.meanCm;
    case "diameter": return treatment.diameter.meanCm;
    case "leaves": return treatment.leaves.meanCount;
    case "health": return treatment.health.healthyPercent;
  }
}

function metricSample(
  treatment: ProjectComparisonTreatment,
  metric: RankingMetric,
): number {
  switch (metric) {
    case "growth": return treatment.growth.n;
    case "height": return treatment.height.n;
    case "diameter": return treatment.diameter.n;
    case "leaves": return treatment.leaves.n;
    case "health": return treatment.health.assessed;
  }
}

function formatNumber(value: number | null, decimals = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function ageRange(treatment: ProjectComparisonTreatment): string {
  const { ageMinDays, ageMaxDays } = treatment;
  if (ageMinDays === null || ageMaxDays === null) return "Sin edad";
  if (ageMinDays === ageMaxDays) return `${ageMinDays} días`;
  return `${ageMinDays}–${ageMaxDays} días`;
}

function dateTimeLabel(value: string | null): string {
  if (!value) return "Sin publicar todavía";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo cargar la comparativa. Inténtalo nuevamente.";
}

export default function TeamComparison({ records }: { records: FieldRecord[] }) {
  const [tab, setTab] = useState<"team" | "personal">("team");
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<ProjectComparisonData | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("growth");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const admin = await isProjectComparisonAdmin();
      setIsAdmin(admin);

      if (admin) {
        // La vista previa se carga primero porque también registra como miembros
        // a las cuentas que ya aportaron observaciones al proyecto.
        const preview = await readProjectComparisonPreview();
        const published = await readPublishedProjectComparison();
        setData(preview);
        setPublishedAt(published?.publishedAt ?? null);
      } else {
        const published = await readPublishedProjectComparison();
        setData(published?.payload ?? null);
        setPublishedAt(published?.publishedAt ?? null);
      }
    } catch (reason) {
      setError(getErrorMessage(reason));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ranked = useMemo(() => {
    if (!data) return [];
    return [...data.treatments].sort((a, b) => {
      const aValue = metricValue(a, rankingMetric);
      const bValue = metricValue(b, rankingMetric);
      if (aValue === null && bValue === null) {
        return a.fertilizer.localeCompare(b.fertilizer, "es");
      }
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return bValue - aValue || a.fertilizer.localeCompare(b.fertilizer, "es");
    });
  }, [data, rankingMetric]);

  const rankedWithValues = ranked.filter(
    (item) => metricValue(item, rankingMetric) !== null,
  );
  const winner = rankedWithValues[0] ?? null;
  const rankingDefinition = rankingOptions.find(
    (option) => option.value === rankingMetric,
  )!;

  async function publish() {
    if (!isAdmin || publishing || !data?.treatments.length) return;

    setPublishing(true);
    setError("");
    setMessage("");
    try {
      const result: PublishedProjectComparison = await publishProjectComparison();
      setData(result.payload);
      setPublishedAt(result.publishedAt);
      setMessage("Comparativa publicada. Los integrantes del proyecto ya pueden consultarla.");
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setPublishing(false);
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
        Comparativa del equipo
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

  if (loading) {
    return (
      <div className="team-comparison">
        {tabControls}
        <div className="panel" style={{ padding: 24, textAlign: "center" }}>
          <RefreshCw size={20} className="auth-spinner" />
          <p className="table-note">Preparando la comparativa del equipo…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="team-comparison">
        {tabControls}
        <section className="panel" style={{ padding: 22 }}>
        <div className="section-heading">
          <div>
            <h2>Comparativa experimental del equipo</h2>
            <p>No se pudo consultar el resumen compartido.</p>
          </div>
          <button className="button secondary" type="button" onClick={() => void load()}>
            <RefreshCw size={16} /> Reintentar
          </button>
        </div>
          <p className="form-error" role="alert">{error}</p>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="team-comparison">
        {tabControls}
        <section className="panel" style={{ padding: 22 }}>
        <div className="section-heading">
          <div>
            <h2>Comparativa experimental del equipo</h2>
            <p>Los resultados se mostrarán cuando el administrador publique el primer informe.</p>
          </div>
          <BarChart3 size={25} />
        </div>
        <div className="table-note">
          <p><strong>Aún no hay una comparativa publicada.</strong></p>
          <p>El administrador debe generar la vista previa y publicar los resultados del proyecto.</p>
        </div>
        </section>
      </div>
    );
  }

  return (
    <div className="team-comparison">
      {tabControls}

      <div className="section-heading">
        <div>
          <h2>Comparativa experimental del equipo</h2>
          <p>
            Análisis conjunto de los tratamientos registrados por los integrantes,
            sin mostrar sus observaciones ni fotografías privadas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge">
            {isAdmin ? "Vista previa de administrador" : "Resultados publicados"}
          </span>
          <button
            className="button secondary"
            type="button"
            onClick={() => void load()}
            disabled={loading || publishing}
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <div>
              <strong>Control de publicación</strong>
              <p className="table-note" style={{ margin: "4px 0 0" }}>
                Esta vista previa solo la ves tú. Al publicar, los integrantes podrán consultar el resumen agregado.
              </p>
              <small className="table-note">Última publicación: {dateTimeLabel(publishedAt)}</small>
            </div>
            <button
              className="button primary"
              type="button"
              onClick={() => void publish()}
              disabled={publishing || data.treatments.length === 0}
            >
              {publishing ? <RefreshCw size={16} className="auth-spinner" /> : <Send size={16} />}
              {publishing ? "Publicando…" : "Publicar resultados"}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="auth-message" role="status">
          <CheckCircle2 size={16} /> {message}
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="stats-grid" style={{ marginBottom: 18 }}>
        <article className="stat-card">
          <div className="stat-top"><span>Integrantes con registros</span><span className="stat-icon"><Users size={18} /></span></div>
          <div className="stat-value">{data.summary.members}</div>
          <p>Contribuyeron al análisis</p>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Plantas evaluadas</span><span className="stat-icon"><Sprout size={18} /></span></div>
          <div className="stat-value">{data.summary.plants}</div>
          <p>Plantas identificadas</p>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Tratamientos</span><span className="stat-icon"><BarChart3 size={18} /></span></div>
          <div className="stat-value">{data.summary.treatments}</div>
          <p>Fertilizante y dosis</p>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span>Observaciones válidas</span><span className="stat-icon"><CheckCircle2 size={18} /></span></div>
          <div className="stat-value">{data.summary.observations}</div>
          <p>Sin registros de demostración</p>
        </article>
      </div>

      {data.treatments.length === 0 ? (
        <div className="panel" style={{ padding: 20 }}>
          <p><strong>Aún no hay datos suficientes para comparar.</strong></p>
          <p className="table-note">Cada integrante debe registrar plantas reales con identificador, fecha de siembra, fertilizante, dosis y observaciones.</p>
        </div>
      ) : (
        <>
          <div className="panel" style={{ padding: 18, marginBottom: 18 }}>
            <div className="section-heading">
              <div>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Trophy size={19} /> Tratamiento destacado por indicador
                </h3>
                <p>Selecciona qué resultado quieres priorizar. No se inventa un ganador general con criterios arbitrarios.</p>
              </div>
              <label style={{ minWidth: 230 }}>
                Clasificar según
                <select
                  value={rankingMetric}
                  onChange={(event) => setRankingMetric(event.target.value as RankingMetric)}
                >
                  {rankingOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {winner ? (
              <div className="stat-card" style={{ padding: 18 }}>
                <div className="stat-top"><span>Mejor resultado observado</span><span className="stat-icon"><Trophy size={20} /></span></div>
                <div className="stat-value" style={{ fontSize: 25 }}>{winner.fertilizer}</div>
                <p>{winner.dose}</p>
                <strong style={{ fontSize: 20 }}>
                  {formatNumber(metricValue(winner, rankingMetric), rankingMetric === "health" || rankingMetric === "leaves" ? 1 : 3)} {rankingDefinition.unit}
                </strong>
                <small className="table-note">
                  Basado en {metricSample(winner, rankingMetric)} planta(s) con datos válidos para este indicador.
                </small>
              </div>
            ) : (
              <p className="table-note">No hay mediciones válidas para clasificar este indicador.</p>
            )}

            {rankedWithValues.length > 1 && (
              <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                {(() => {
                  const maxMagnitude = Math.max(
                    ...rankedWithValues.map((item) => Math.abs(metricValue(item, rankingMetric) ?? 0)),
                    0.0001,
                  );
                  return rankedWithValues.map((item) => {
                    const value = metricValue(item, rankingMetric)!;
                    const width = Math.max(3, (Math.abs(value) / maxMagnitude) * 100);
                    return (
                      <div key={`${item.crop}-${item.fertilizer}-${item.dose}`}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
                          <strong>{item.fertilizer}</strong>
                          <span>{formatNumber(value, rankingMetric === "health" || rankingMetric === "leaves" ? 1 : 3)} {rankingDefinition.unit}</span>
                        </div>
                        <div style={{ height: 10, borderRadius: 99, overflow: "hidden", background: "var(--border)" }}>
                          <div style={{ width: `${width}%`, height: "100%", borderRadius: 99, background: value < 0 ? "#bd6666" : "var(--green-text, #66b87a)" }} />
                        </div>
                        <small className="table-note">{item.dose} · n = {metricSample(item, rankingMetric)}</small>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          <div className="panel table-panel" style={{ marginBottom: 18 }}>
            <div className="section-heading" style={{ padding: 16 }}>
              <div>
                <h3>Ranking de tratamientos</h3>
                <p>Ordenado según {rankingDefinition.label.toLowerCase()}.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Puesto</th>
                    <th>Fertilizante</th>
                    <th>Dosis / frecuencia</th>
                    <th>Integrantes</th>
                    <th>Plantas</th>
                    <th>Altura media</th>
                    <th>Crecimiento</th>
                    <th>Hojas medias</th>
                    <th>Diámetro medio</th>
                    <th>Plantas sanas</th>
                    <th>Edad actual</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((item, index) => (
                    <tr key={`${item.crop}-${item.fertilizer}-${item.dose}`}>
                      <td><strong>{index + 1}.º</strong></td>
                      <td><strong>{item.fertilizer}</strong><br /><small>{item.crop}</small></td>
                      <td>{item.dose}</td>
                      <td>{item.memberCount}</td>
                      <td>{item.plantCount}</td>
                      <td>{formatNumber(item.height.meanCm)} cm <small>(n={item.height.n})</small></td>
                      <td>{formatNumber(item.growth.meanCmPerDay, 3)} cm/día <small>(n={item.growth.n})</small></td>
                      <td>{formatNumber(item.leaves.meanCount, 1)} <small>(n={item.leaves.n})</small></td>
                      <td>{formatNumber(item.diameter.meanCm)} cm <small>(n={item.diameter.n})</small></td>
                      <td>{formatNumber(item.health.healthyPercent, 1)} % <small>(n={item.health.assessed})</small></td>
                      <td>{ageRange(item)}</td>
                    </tr>
                  ))}
                  {!ranked.length && (
                    <tr><td colSpan={11}>Todavía no hay tratamientos registrados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-note" style={{ padding: 16 }}>
              <p>n indica cuántas plantas aportaron una medición válida a ese indicador. Los datos faltantes no se cuentan como cero.</p>
              <p>La velocidad se calcula con la primera y la última altura manual de cada planta. Una planta con una sola medición no aporta velocidad de crecimiento.</p>
            </div>
          </div>
        </>
      )}

      {data.warnings.length > 0 && (
        <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={18} /> Consideraciones del análisis
          </h3>
          <ul style={{ margin: "10px 0 0", paddingLeft: 22 }}>
            {data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="panel" style={{ padding: 16 }}>
        <h3>Cómo se calcula</h3>
        <ul style={{ margin: "10px 0 0", paddingLeft: 22 }}>
          <li>Solo se utilizan observaciones reales y mediciones marcadas como manuales; se excluyen los ejemplos y las estimaciones de IA.</li>
          <li>Las plantas se identifican por propietario, cultivo, lote, código de planta y fecha de siembra para no mezclar códigos repetidos entre integrantes.</li>
          <li>Los tratamientos se agrupan por cultivo, fertilizante y dosis.</li>
          <li>Las fotografías, los nombres, las notas y los informes individuales permanecen privados.</li>
          <li>El formulario actual no registra peso de cosecha; por eso no se muestra un ranking de peso.</li>
        </ul>
        <p className="table-note" style={{ marginTop: 12 }}>
          Estos resultados son descriptivos. Si cada fertilizante se prueba en condiciones distintas o con pocas plantas, no demuestran por sí solos que el fertilizante haya causado la diferencia.
        </p>
        <small className="table-note">Datos calculados: {dateTimeLabel(data.generatedAt)} · Última publicación: {dateTimeLabel(publishedAt)}</small>
      </div>
    </div>
  );
}

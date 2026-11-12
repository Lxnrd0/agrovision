"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Users,
} from "lucide-react";
import { readPublishedProjectComparison } from "@/lib/cloud";
import type { PublishedProjectComparison } from "@/lib/cloud";

function number(value: number | null | undefined, decimals = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("es-PE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Fecha no disponible"
    : parsed.toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export default function PublishedTeamComparison() {
  const [result, setResult] = useState<PublishedProjectComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await readPublishedProjectComparison());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo consultar la comparativa publicada.",
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="tn-summary tn-summary-state" aria-live="polite">
        <RefreshCw className="tn-spin" size={22} />
        <p>Consultando los resultados publicados por el administrador…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="tn-summary tn-summary-state">
        <ShieldCheck size={30} />
        <h2>Resumen del equipo</h2>
        <p>{error}</p>
        <button className="tn-publish-action" type="button" onClick={() => void load()}>
          <RefreshCw size={16} /> Volver a intentar
        </button>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="tn-summary tn-summary-state">
        <BarChart3 size={30} />
        <h2>Aún no hay resultados publicados</h2>
        <p>Cuando el administrador publique el resumen general, podrás consultar aquí los promedios y la comparación de tratamientos.</p>
        <button className="tn-publish-action" type="button" onClick={() => void load()}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </section>
    );
  }

  const data = result.payload;

  return (
    <section className="tn-summary">
      <header className="tn-summary-header">
        <div className="tn-summary-title">
          <span className="tn-summary-mark"><Sprout size={28} /></span>
          <div>
            <p className="tn-summary-eyebrow">TERRANOVA · RESULTADOS DEL EQUIPO</p>
            <h1>Resumen general publicado</h1>
            <p>Consulta de resultados agrupados y aprobados por el administrador.</p>
          </div>
        </div>
        <div className="tn-summary-actions-top">
          <span className="tn-admin-pill"><ShieldCheck size={15} /> Publicación oficial</span>
          <button className="tn-icon-action" type="button" onClick={() => void load()} aria-label="Actualizar resultados publicados" title="Actualizar resultados publicados">
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      <div className="tn-stats-card tn-published-stats">
        <div className="tn-stats-grid">
          <div className="tn-stat"><Users size={24} /><strong>{data.summary.members}</strong><span>Integrantes con registros</span></div>
          <div className="tn-stat"><Sprout size={24} /><strong>{data.summary.plants}</strong><span>Plantas evaluadas</span></div>
          <div className="tn-stat"><FlaskConical size={24} /><strong>{data.summary.treatments}</strong><span>Tratamientos</span></div>
          <div className="tn-stat"><CalendarDays size={24} /><strong>{data.summary.observations}</strong><span>Observaciones válidas</span></div>
        </div>
        <div className="tn-data-updated"><CheckCircle2 size={15} /> Publicado el {date(result.publishedAt)}</div>
      </div>

      <article className="tn-treatment-table-card tn-published-table">
        <div className="tn-card-heading"><FlaskConical size={21} /><h2>Resultados por tratamiento</h2></div>
        {data.treatments.length ? (
          <div className="tn-treatment-table-scroll">
            <table className="tn-treatment-table">
              <thead>
                <tr>
                  <th scope="col">Cultivo</th>
                  <th scope="col">Tratamiento / dosis</th>
                  <th scope="col">Plantas</th>
                  <th scope="col">Altura media</th>
                  <th scope="col">Crecimiento</th>
                  <th scope="col">Hojas</th>
                  <th scope="col">Diámetro</th>
                  <th scope="col">Plantas sanas</th>
                </tr>
              </thead>
              <tbody>
                {data.treatments.map((item) => (
                  <tr key={`${item.crop}-${item.fertilizer}-${item.dose}`}>
                    <td>{item.crop || "—"}</td>
                    <td><strong>{item.fertilizer}</strong><small>{item.dose || "Dosis no especificada"}</small></td>
                    <td>{item.plantCount}</td>
                    <td>{typeof item.height.meanCm === "number" ? `${number(item.height.meanCm)} cm` : "—"}<small>n={item.height.n}</small></td>
                    <td>{typeof item.growth.meanCmPerDay === "number" ? `${number(item.growth.meanCmPerDay, 3)} cm/día` : "—"}<small>n={item.growth.n}</small></td>
                    <td>{typeof item.leaves.meanCount === "number" ? number(item.leaves.meanCount, 1) : "—"}<small>n={item.leaves.n}</small></td>
                    <td>{typeof item.diameter.meanCm === "number" ? `${number(item.diameter.meanCm)} cm` : "—"}<small>n={item.diameter.n}</small></td>
                    <td>{typeof item.health.healthyPercent === "number" ? `${number(item.health.healthyPercent, 1)} %` : "—"}<small>{item.health.healthy}/{item.health.assessed} evaluadas</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tn-empty-chart"><FlaskConical size={27} /><strong>Sin tratamientos publicados</strong><span>El administrador aún no tiene datos suficientes para comparar.</span></div>
        )}
        <p className="tn-table-note">Los valores n indican el número de plantas con mediciones válidas para cada indicador. Los datos faltantes no se convierten en cero.</p>
      </article>

      {data.warnings.length > 0 && (
        <details className="tn-summary-warnings">
          <summary><AlertTriangle size={16} /> Consideraciones del análisis ({data.warnings.length})</summary>
          <ul>{data.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul>
        </details>
      )}

      <footer className="tn-summary-footer"><ShieldCheck size={14} /> Vista de solo lectura · Se muestran resultados agregados, sin nombres ni fotografías.</footer>
    </section>
  );
}

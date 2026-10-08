"use client";
import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  FlaskConical,
  Trophy,
  Info,
} from "lucide-react";
import { compare } from "@/lib/metrics";
import { FieldRecord } from "@/lib/types";
import { Badge } from "./ui";
export default function Comparison({ records }: { records: FieldRecord[] }) {
  const [zone, setZone] = useState("Todos");
  const [origin, setOrigin] = useState("Todos");
  const [sort, setSort] = useState("index");
  const [desc, setDesc] = useState(true);
  const [crop, setCrop] = useState("Todos");
  const selected = records.filter(
    (r) =>
      (zone === "Todos" || r.zone === zone) &&
      (crop === "Todos" || r.crop === crop) &&
      (origin === "Todos" ||
        (origin === "Reales" ? r.source !== "demo" : r.source === "demo")),
  );
  const rows = useMemo(
    () =>
      compare(selected).sort((a, b) => {
        const av = a[sort as keyof typeof a],
          bv = b[sort as keyof typeof b];
        if (av === null) return bv === null ? 0 : 1;
        if (bv === null) return -1;
        const result =
          typeof av === "string"
            ? av.localeCompare(String(bv))
            : Number(av) - Number(bv);
        return desc ? -result : result;
      }),
    [selected, sort, desc],
  );
  function sortBy(key: string) {
    setDesc(key === sort ? !desc : true);
    setSort(key);
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Cada tratamiento cuenta una historia.</h2>
          <p>Compara el desarrollo observado de tus muestras.</p>
        </div>
        <Badge tone="gray">
          <FlaskConical size={14} />
          {rows.length} tratamientos
        </Badge>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Comparar por lote"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          <option value="Todos">Todos los lotes</option>
          {[...new Set(records.map((r) => r.zone))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Comparar por cultivo"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        >
          <option value="Todos">Todos los cultivos</option>
          {[...new Set(records.map((r) => r.crop))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Comparar por origen"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
        >
          <option>Todos</option>
          <option>Reales</option>
          <option>Ejemplos</option>
        </select>
        <span className="flex-spacer" />
        <button
          className="button secondary"
          onClick={() => {
            setSort("index");
            setDesc(true);
          }}
        >
          <ArrowDownWideNarrow size={16} />
          Orden inteligente
        </button>
      </div>
      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  ["name", "Fertilizante / Abono"],
                  ["count", "Muestras"],
                  ["diameter", "Diámetro medio"],
                  ["leaves", "Hojas / muestra"],
                  ["health", "Salud"],
                  ["index", "Índice visual"],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    aria-sort={
                      sort === key
                        ? desc
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button onClick={() => sortBy(key)}>
                      {label}
                      <ArrowUpDown size={13} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name}>
                  <td>
                    <span
                      className={`rank ${i === 0 && sort === "index" && desc ? "first" : ""}`}
                    >
                      {i === 0 && sort === "index" && desc ? (
                        <Trophy size={15} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <strong>{r.name}</strong>
                  </td>
                  <td>
                    {r.count}
                    <small> muestras</small>
                  </td>
                  <td>
                    {r.measured ? r.diameter.toFixed(2) : "—"} <small>cm</small>
                  </td>
                  <td>{r.leaves.toFixed(1)}</td>
                  <td>
                    <span
                      className={`health-value ${r.health < 80 ? "orange-text" : ""}`}
                    >
                      {r.assessed ? r.health.toFixed(0) + "%" : "—"}
                    </span>
                  </td>
                  <td>
                    <div className="table-score">
                      <span>{r.index ?? "—"}</span>
                      <div className="meter">
                        <i style={{ width: `${r.index ?? 0}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="empty-state">
              Aún no hay muestras para comparar.
            </div>
          )}
        </div>
        <div className="table-note">
          <Info size={17} />
          <p>
            <strong>Cómo se calcula:</strong> 60% del diámetro medio normalizado
            respecto al mayor diámetro del conjunto filtrado + 40% de la
            proporción de plantas sanas. Las muestras sin escala no aportan
            diámetro; los estados indeterminados no entran en salud. Sin medidas
            o estados evaluables, el índice no se calcula. Es un índice
            descriptivo, no rendimiento de cosecha ni evidencia causal del
            efecto del abono.
          </p>
        </div>
      </div>
      <div className="comparison-bars panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">DESARROLLO DEL CULTIVO</span>
            <h2>Diámetro medio por tratamiento</h2>
          </div>
          <span className="muted">cm</span>
        </div>
        {rows.map((r) => (
          <div className="bar-row" key={r.name}>
            <span>{r.name}</span>
            <div>
              <i
                style={{
                  width: `${Math.max(0, (r.diameter / Math.max(...rows.map((x) => x.diameter), 1)) * 100)}%`,
                }}
              />
            </div>
            <strong>{r.measured ? r.diameter.toFixed(2) : "—"}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { compare } from "@/lib/metrics";
import {
  age,
  calibration,
  eligible,
  growth,
  origin,
  value,
} from "@/lib/tracking";
import type { FieldRecord } from "@/lib/types";
import type { Metric } from "@/lib/tracking";

function format(
  number: number | null | undefined,
  decimals = 2,
) {
  return number == null ? "—" : number.toFixed(decimals);
}

const metrics: {
  key: Metric;
  label: string;
  unit: string;
}[] = [
  { key: "diameterCm", label: "Diámetro", unit: "cm" },
  { key: "heightCm", label: "Altura", unit: "cm" },
  { key: "leafCount", label: "Hojas", unit: "hojas" },
];

function originLabel(
  record: FieldRecord,
  metric: Metric,
) {
  const source = origin(record, metric);

  if (source === "manual") return "Manual";
  if (source === "ia") return "Estimación IA";

  return "Sin verificar";
}

export default function Comparison({
  records,
}: {
  records: FieldRecord[];
}) {
  const [zone, setZone] = useState("Todos");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");

  const [measureOrigin, setMeasureOrigin] = useState<
    "manual" | "ia"
  >("manual");

  const real = records.filter(
    (record) => record.source !== "demo",
  );

  const zones = [...new Set(real.map((record) => record.zone))];

  const selected = real.filter(
    (record) => zone === "Todos" || record.zone === zone,
  );

  const minimum =
    minAge === "" ? undefined : Number(minAge);

  const maximum =
    maxAge === "" ? undefined : Number(maxAge);

  const invalidRange =
    (minimum !== undefined &&
      (!Number.isInteger(minimum) || minimum < 0)) ||
    (maximum !== undefined &&
      (!Number.isInteger(maximum) || maximum < 0)) ||
    (minimum !== undefined &&
      maximum !== undefined &&
      minimum > maximum);

  const rows = invalidRange
    ? []
    : compare(selected, {
        minAge: minimum,
        maxAge: maximum,
        origin: measureOrigin,
      }).sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.dose.localeCompare(b.dose),
      );

  const observations = invalidRange
    ? []
    : selected
        .filter(
          (record) =>
            eligible(record) &&
            age(record)! >= (minimum ?? 0) &&
            age(record)! <= (maximum ?? Infinity),
        )
        .sort((a, b) => b.date.localeCompare(a.date));

  const incomplete = selected.filter(
    (record) => !eligible(record),
  ).length;

  const examples = records.filter(
    (record) => record.source === "demo",
  ).length;

  const errors = calibration(observations);

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Seguimiento real del rabanito</h2>
          <p>
            Compara plantas de edad semejante por tratamiento
            y dosis.
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <label>
          Lote
          <select
            value={zone}
            onChange={(event) => setZone(event.target.value)}
          >
            <option value="Todos">Todos los lotes</option>
            {zones.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label>
          Edad mínima (días)
          <input
            type="number"
            min="0"
            step="1"
            value={minAge}
            placeholder="Sin mínimo"
            onChange={(event) =>
              setMinAge(event.target.value)
            }
          />
        </label>

        <label>
          Edad máxima (días)
          <input
            type="number"
            min="0"
            step="1"
            value={maxAge}
            placeholder="Sin máximo"
            onChange={(event) =>
              setMaxAge(event.target.value)
            }
          />
        </label>

        <label>
          Origen de las medidas
          <select
            value={measureOrigin}
            onChange={(event) =>
              setMeasureOrigin(
                event.target.value as "manual" | "ia",
              )
            }
          >
            <option value="manual">
              Manual: regla, calibre o conteo
            </option>
            <option value="ia">
              Estimación IA sin validar
            </option>
          </select>
        </label>
      </div>

      {invalidRange && (
        <p role="alert">
          Las edades deben ser días enteros, positivos o cero.
          El mínimo no puede superar el máximo.
        </p>
      )}

      <div className="table-note">
        <p>
          {incomplete} registros sin identificación, fecha de
          siembra o dosis quedan fuera de esta comparación.
          {" "}
          {examples} ejemplos excluidos. Los registros antiguos
          se conservan en la bitácora.
        </p>
      </div>

      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Tratamiento</th>
                <th>Dosis</th>
                <th>Plantas distintas</th>
                <th>Edad (días)</th>
                <th>Diámetro medio (cm)</th>
                <th>Altura media (cm)</th>
                <th>Hojas medias</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.dose}</td>
                  <td>{row.count}</td>
                  <td>
                    {row.minAge}–{row.maxAge}
                  </td>
                  <td>
                    {format(row.diameter)}
                    <small> · n={row.measured}</small>
                  </td>
                  <td>
                    {format(row.height)}
                    <small> · n={row.heightN}</small>
                  </td>
                  <td>
                    {format(row.leaves, 1)}
                    <small> · n={row.leavesN}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!rows.length && (
            <div className="empty-state">
              No hay plantas con datos suficientes en este
              rango.
            </div>
          )}
        </div>

        <div className="table-note">
          <p>
            Se usa una observación por planta: la última
            dentro del rango de edad. Cada promedio incluye
            solamente medidas válidas del origen seleccionado.
            “n” indica cuántas medidas lo sustentan. Una medida
            ausente no cuenta como cero.
          </p>
        </div>

        <div className="table-note">
          <p>
            Estos resultados son descriptivos. Las diferencias
            pueden depender de la edad, el suelo, el riego y
            las condiciones del ensayo. La tabla no demuestra
            que un fertilizante sea mejor.
          </p>
        </div>
      </div>

      <div
        className="section-heading"
        style={{ marginTop: 24 }}
      >
        <div>
          <h2>Observaciones y crecimiento</h2>
          <p>
            Cambio desde la medida válida anterior de la misma
            planta, tratamiento y origen. Esa visita puede
            estar fuera del filtro de edad.
          </p>
        </div>
      </div>

      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Planta / lote</th>
                <th>Siembra / observación</th>
                <th>Edad</th>
                <th>Tratamiento / dosis</th>
                <th>Medidas y origen</th>
                <th>Cambio desde medida previa</th>
                <th>Síntomas / fotografía</th>
              </tr>
            </thead>

            <tbody>
              {observations.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{record.plantId}</strong>
                    <br />
                    {record.zone}
                  </td>

                  <td>
                    Siembra: {record.sowingDate}
                    <br />
                    Observación: {record.date}
                  </td>

                  <td>{age(record)} días</td>

                  <td>
                    {record.fertilizer}
                    <br />
                    {record.dose}
                  </td>

                  <td>
                    {metrics.map((metric) => (
                      <div key={metric.key}>
                        {metric.label}:{" "}
                        {format(
                          value(record, metric.key),
                          metric.key === "leafCount" ? 0 : 2,
                        )}{" "}
                        {metric.unit}
                        {" · "}
                        {originLabel(record, metric.key)}
                      </div>
                    ))}
                  </td>

                  <td>
                    {metrics.map((metric) => {
                      const change = growth(
                        record,
                        records,
                        metric.key,
                      );

                      return (
                        <div key={metric.key}>
                          {metric.label}:{" "}
                          {change ? (
                            <>
                              {change.delta >= 0 ? "+" : ""}
                              {format(change.delta)}{" "}
                              {metric.unit} en {change.days} días
                              <br />
                              {format(change.perDay)}{" "}
                              {metric.unit}/día
                              <br />
                              Desde {change.previousDate}
                              {" · "}
                              {originLabel(record, metric.key)}
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      );
                    })}
                  </td>

                  <td>
                    {record.observations.join(" · ") ||
                      "Sin observaciones"}

                    {record.image && (
                      <details>
                        <summary>Ver fotografía</summary>
                        <img
                          src={record.image}
                          alt={`Rabanito ${record.plantId}, ${record.date}`}
                          loading="lazy"
                          style={{
                            width: 140,
                            maxWidth: "100%",
                          }}
                        />
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!observations.length && (
            <div className="empty-state">
              Registra una planta con su identificación,
              fecha de siembra y dosis.
            </div>
          )}
        </div>
      </div>

      <div
        className="panel"
        style={{ padding: 24, marginTop: 24 }}
      >
        <h2>Comprobación de estimaciones de diámetro</h2>

        <p>
          Se compara la estimación original de una foto con
          el diámetro manual del mismo registro. Estos errores
          describen los pares guardados; no corrigen nuevas
          fotos ni validan la confianza del modelo.
        </p>

        <p>
          <strong>{errors.n} pares de medidas</strong>
        </p>

        <p>
          Error absoluto medio: {format(errors.mae)} cm
          <br />
          Sesgo (IA menos manual): {format(errors.bias)} cm
          <br />
          Error porcentual absoluto medio:{" "}
          {format(errors.mape, 1)}%
        </p>

        {errors.n === 0 && (
          <p>
            Aún no hay pares. Analiza una foto con escala y,
            al registrarla, introduce el diámetro medido
            con regla o calibre.
          </p>
        )}
      </div>
    </>
  );
}

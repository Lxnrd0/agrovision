"use client";

import { useState } from "react";
import type { FieldRecord } from "@/lib/types";
import type { Metric } from "@/lib/tracking";
import {
  age,
  eligible,
  origin,
  plantKey,
  value,
} from "@/lib/tracking";

const metrics: {
  key: Metric;
  label: string;
  unit: string;
}[] = [
  { key: "heightCm", label: "Altura", unit: "cm" },
  { key: "leafCount", label: "Número de hojas", unit: "hojas" },
  { key: "diameterCm", label: "Diámetro del bulbo", unit: "cm" },
];

export default function PlantGrowth({
  records,
}: {
  records: FieldRecord[];
}) {
  const [selectedKey, setSelectedKey] = useState("");
  const [metricKey, setMetricKey] = useState<Metric>("heightCm");

  const validRecords = records
    .filter(eligible)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const plants = [
    ...new Map(
      validRecords.map((record) => [plantKey(record), record]),
    ).values(),
  ].sort((a, b) =>
    (a.plantId ?? "").localeCompare(
      b.plantId ?? "",
      "es",
      { numeric: true },
    ),
  );

  const activeKey = plants.some(
    (plant) => plantKey(plant) === selectedKey,
  )
    ? selectedKey
    : plants[0]
      ? plantKey(plants[0])
      : "";

  const plant = plants.find(
    (record) => plantKey(record) === activeKey,
  );

  const metric =
    metrics.find((item) => item.key === metricKey) ?? metrics[0];

  const visits = validRecords.filter(
    (record) => plantKey(record) === activeKey,
  );

  const readings = visits.map((record) => ({
    record,
    day: age(record) ?? 0,
    measured:
      origin(record, metricKey) === "manual"
        ? value(record, metricKey)
        : null,
  }));

  const points = readings.flatMap((reading) =>
    reading.measured === null
      ? []
      : [{
          ...reading,
          measured: reading.measured,
        }],
  );

  const width = 720;
  const height = 300;
  const left = 65;
  const right = 25;
  const top = 25;
  const bottom = 60;

  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const maxDay = Math.max(
    1,
    ...readings.map((reading) => reading.day),
  );

  const maxValue = Math.max(
    1,
    ...points.map((point) => point.measured),
  ) * 1.1;

  function x(day: number) {
    return left + (day / maxDay) * chartWidth;
  }

  function y(measured: number) {
    return top + chartHeight - (measured / maxValue) * chartHeight;
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <section
      className="panel"
      style={{ padding: 20, marginBottom: 28 }}
    >
      <h2>Crecimiento por planta</h2>

      <p
        style={{
          color: "var(--muted)",
          margin: "8px 0 18px",
        }}
      >
        Mediciones manuales según los días desde la siembra.
      </p>

      <div className="form-grid" style={{ marginBottom: 18 }}>
        <label>
          Planta
          <select
            value={activeKey}
            disabled={!plants.length}
            onChange={(event) => setSelectedKey(event.target.value)}
          >
            {!plants.length && (
              <option value="">Sin plantas registradas</option>
            )}

            {plants.map((item) => (
              <option
                key={plantKey(item)}
                value={plantKey(item)}
              >
                {item.plantId} · {item.zone} · {item.fertilizer}
              </option>
            ))}
          </select>
        </label>

        <label>
          Variable
          <select
            value={metricKey}
            onChange={(event) =>
              setMetricKey(event.target.value as Metric)
            }
          >
            {metrics.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} ({item.unit})
              </option>
            ))}
          </select>
        </label>
      </div>

      {plant && (
        <p style={{ marginBottom: 16, color: "var(--muted)" }}>
          <strong>{plant.plantId}</strong>
          {" · "}Siembra: {plant.sowingDate}
          <br />
          {plant.fertilizer} · {plant.dose}
          <br />
          {visits.length} observaciones · {points.length} medidas
          manuales válidas de {metric.label.toLowerCase()}
        </p>
      )}

      {points.length > 0 ? (
        <>
          <div className="table-scroll">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${metric.label} de la planta ${plant?.plantId} según los días desde la siembra. Datos detallados en la tabla inferior.`}
              style={{
                display: "block",
                width: "100%",
                minWidth: 450,
                color: "var(--muted)",
              }}
            >
              {[0, 1, 2, 3, 4].map((tick) => {
                const tickValue = (maxValue / 4) * tick;
                const position = y(tickValue);

                return (
                  <g key={`y-${tick}`}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={position}
                      y2={position}
                      stroke="var(--border)"
                    />

                    <text
                      x={left - 10}
                      y={position + 4}
                      textAnchor="end"
                      fill="currentColor"
                      fontSize="12"
                    >
                      {tickValue.toFixed(1)}
                    </text>
                  </g>
                );
              })}

              {[0, 1, 2, 3, 4].map((tick) => {
                const day = (maxDay / 4) * tick;

                return (
                  <text
                    key={`x-${tick}`}
                    x={x(day)}
                    y={height - bottom + 22}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="12"
                  >
                    {Number(day.toFixed(1))}
                  </text>
                );
              })}

              <text
                x={left}
                y={14}
                fill="currentColor"
                fontSize="12"
              >
                {metric.label} ({metric.unit})
              </text>

              <text
                x={left + chartWidth / 2}
                y={height - 10}
                textAnchor="middle"
                fill="currentColor"
                fontSize="12"
              >
                Días desde la siembra
              </text>

              {readings.map((reading, index) => {
                const previous = readings[index - 1];

                // No conecta a través de una visita sin medición.
                if (
                  reading.measured === null ||
                  !previous ||
                  previous.measured === null
                ) {
                  return null;
                }

                return (
                  <line
                    key={`line-${reading.record.id}`}
                    x1={x(previous.day)}
                    y1={y(previous.measured)}
                    x2={x(reading.day)}
                    y2={y(reading.measured)}
                    stroke="var(--green-text)"
                    strokeWidth="2.5"
                  />
                );
              })}

              {points.map((point) => (
                <circle
                  key={point.record.id}
                  cx={x(point.day)}
                  cy={y(point.measured)}
                  r="5"
                  fill="var(--green-text)"
                  stroke="var(--panel)"
                  strokeWidth="2"
                >
                  <title>
                    {point.record.date}: {point.measured} {metric.unit}
                  </title>
                </circle>
              ))}
            </svg>
          </div>

          {points.length === 1 && (
            <p style={{ color: "var(--muted)", margin: "8px 0" }}>
              Solo hay una medición. Registra otra fecha para ver el cambio.
            </p>
          )}

          {first && last && points.length >= 2 && (
            <p style={{ margin: "12px 0" }}>
              Cambio entre la primera y la última medición:{" "}
              <strong>
                {last.measured - first.measured > 0 ? "+" : ""}
                {(last.measured - first.measured).toFixed(
                  metricKey === "leafCount" ? 0 : 2,
                )}{" "}
                {metric.unit}
              </strong>{" "}
              en {last.day - first.day} días.
            </p>
          )}
        </>
      ) : (
        <p style={{ margin: "16px 0", color: "var(--muted)" }}>
          {plant
            ? "No hay mediciones manuales de esta variable para la planta seleccionada."
            : "Registra una planta para ver su crecimiento."}
        </p>
      )}

      {readings.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Observación</th>
                <th>Edad</th>
                <th>{metric.label} ({metric.unit})</th>
                <th>Responsable</th>
              </tr>
            </thead>

            <tbody>
              {readings.map((reading) => (
                <tr key={reading.record.id}>
                  <td>{reading.record.date}</td>
                  <td>{reading.day} días</td>
                  <td>
                    {reading.measured === null
                      ? "Sin medición manual"
                      : reading.measured.toFixed(
                          metricKey === "leafCount" ? 0 : 2,
                        )}
                  </td>
                  <td>{reading.record.collaborator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p
        style={{
          color: "var(--muted)",
          fontSize: 12,
          marginTop: 14,
        }}
      >
        Cada punto representa una medición registrada. Los datos
        faltantes no se convierten en cero. La gráfica describe
        el crecimiento de esta planta; no identifica por sí sola
        el efecto del fertilizante.
      </p>
    </section>
  );
}

"use client";

import { useState } from "react";
import PlantGrowth from "./plant-growth";
import { compare } from "@/lib/metrics";
import {
  age,
  eligible,
  growth,
  origin,
  plantKey,
  value,
} from "@/lib/tracking";
import type { FieldRecord } from "@/lib/types";
import type { Metric } from "@/lib/tracking";

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
    ? "—"
    : number.toFixed(decimals);
}

function dateLabel(date: string | undefined) {
  if (!date) return "—";

  const parts = date.split("-");

  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : date;
}

function manualValue(record: FieldRecord, metric: Metric) {
  return origin(record, metric) === "manual"
    ? value(record, metric)
    : null;
}

function pairedErrors(records: FieldRecord[], metric: Metric) {
  const pairs: {
    record: FieldRecord;
    manual: number;
    estimate: number;
    error: number;
  }[] = [];

  for (const record of records) {
    const manual = manualValue(record, metric);

    const estimate =
      metric === "diameterCm"
        ? record.estimatedDiameterCm
        : metric === "leafCount"
          ? record.estimatedLeafCount
          : null;

    if (
      manual === null ||
      typeof estimate !== "number" ||
      !Number.isFinite(estimate) ||
      estimate < 0 ||
      (metric === "diameterCm" && estimate === 0) ||
      (metric === "leafCount" && !Number.isInteger(estimate))
    ) {
      continue;
    }

    pairs.push({
      record,
      manual,
      estimate,
      error: estimate - manual,
    });
  }

  const n = pairs.length;
  const percentagePairs = pairs.filter((pair) => pair.manual > 0);

  return {
    pairs,
    n,
    mae: n
      ? pairs.reduce((sum, pair) => sum + Math.abs(pair.error), 0) / n
      : null,
    bias: n
      ? pairs.reduce((sum, pair) => sum + pair.error, 0) / n
      : null,
    mape: percentagePairs.length
      ? (
          percentagePairs.reduce(
            (sum, pair) => sum + Math.abs(pair.error) / pair.manual,
            0,
          ) / percentagePairs.length
        ) * 100
      : null,
    percentageN: percentagePairs.length,
    plants: new Set(pairs.map((pair) => plantKey(pair.record))).size,
  };
}

export default function Comparison({
  records,
}: {
  records: FieldRecord[];
}) {
  const [zone, setZone] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [selectedPlant, setSelectedPlant] = useState("");

  const real = records.filter((record) => record.source !== "demo");

  const zones = [...new Set(real.map((record) => record.zone))]
    .sort((a, b) => a.localeCompare(b));

  const selected = real.filter(
    (record) => !zone || record.zone === zone,
  );

  const minimum = minAge === "" ? undefined : Number(minAge);
  const maximum = maxAge === "" ? undefined : Number(maxAge);

  const invalidRange =
    (minimum !== undefined &&
      (!Number.isInteger(minimum) || minimum < 0)) ||
    (maximum !== undefined &&
      (!Number.isInteger(maximum) || maximum < 0)) ||
    (minimum !== undefined &&
      maximum !== undefined &&
      minimum > maximum);

  const observations = invalidRange
    ? []
    : selected
        .filter((record) => {
          const plantAge = age(record);

          return (
            eligible(record) &&
            plantAge !== null &&
            plantAge >= (minimum ?? 0) &&
            plantAge <= (maximum ?? Infinity)
          );
        })
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.createdAt.localeCompare(a.createdAt),
        );

  const rows = invalidRange
    ? []
    : [...new Set(selected.map((record) => record.zone))]
        .flatMap((lot) =>
          compare(
            selected.filter((record) => record.zone === lot),
            {
              minAge: minimum,
              maxAge: maximum,
              origin: "manual",
            },
          ).map((row) => ({
            ...row,
            zone: lot,
            tableKey: JSON.stringify([lot, row.key]),
          })),
        )
        .sort(
          (a, b) =>
            a.zone.localeCompare(b.zone) ||
            a.name.localeCompare(b.name) ||
            a.dose.localeCompare(b.dose),
        );

  const plants = [
    ...new Map(
      observations.map((record) => [plantKey(record), record]),
    ).values(),
  ].sort((a, b) =>
    (a.plantId ?? "").localeCompare(
      b.plantId ?? "",
      "es",
      { numeric: true },
    ),
  );

  const activePlant = plants.some(
    (plant) => plantKey(plant) === selectedPlant,
  )
    ? selectedPlant
    : "";

  const visibleObservations = observations.filter(
    (record) => !activePlant || plantKey(record) === activePlant,
  );

  const incomplete = selected.filter(
    (record) => !eligible(record),
  ).length;

  const examples = records.filter(
    (record) => record.source === "demo",
  ).length;

  const measuredObservations = observations.filter((record) =>
    metrics.some((metric) => manualValue(record, metric.key) !== null),
  ).length;

  const checks = [
    {
      label: "Diámetro",
      unit: "cm",
      result: pairedErrors(observations, "diameterCm"),
    },
    {
      label: "Número de hojas",
      unit: "hojas",
      result: pairedErrors(observations, "leafCount"),
    },
  ];

  return (
    <>
      <PlantGrowth records={records} />

      <div className="section-heading">
        <div>
          <h2>Comparación del crecimiento</h2>
          <p>
            Resultados por lote, tratamiento y dosis.
            Los promedios usan mediciones manuales.
            Los filtros siguientes se aplican a las tablas;
            la gráfica superior muestra el seguimiento completo
            de la planta que selecciones en ella.
          </p>
        </div>
      </div>

      <div
        className="filter-bar"
        style={{
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        <label style={{ flex: "1 1 180px" }}>
          Lote
          <select
            value={zone}
            onChange={(event) => {
              setZone(event.target.value);
              setSelectedPlant("");
            }}
          >
            <option value="">Todos los lotes, por separado</option>
            {zones.map((item) => (
              <option key={item} value={item}>
                {item || "Sin lote"}
              </option>
            ))}
          </select>
        </label>

        <label style={{ flex: "1 1 140px" }}>
          Edad mínima (días)
          <input
            type="number"
            min="0"
            step="1"
            value={minAge}
            placeholder="Sin mínimo"
            onChange={(event) => {
              setMinAge(event.target.value);
              setSelectedPlant("");
            }}
          />
        </label>

        <label style={{ flex: "1 1 140px" }}>
          Edad máxima (días)
          <input
            type="number"
            min="0"
            step="1"
            value={maxAge}
            placeholder="Sin máximo"
            onChange={(event) => {
              setMaxAge(event.target.value);
              setSelectedPlant("");
            }}
          />
        </label>

        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setZone("");
            setMinAge("");
            setMaxAge("");
            setSelectedPlant("");
          }}
        >
          Limpiar filtros
        </button>
      </div>

      {invalidRange && (
        <p role="alert" style={{ margin: "12px 0" }}>
          Usa edades enteras de cero o más días.
          La edad mínima no puede superar la máxima.
        </p>
      )}

      <div className="table-note">
        <p>
          En los filtros actuales: <strong>{plants.length}</strong>{" "}
          plantas distintas y <strong>{observations.length}</strong>{" "}
          observaciones; {measuredObservations} tienen al menos
          una medida manual válida.
        </p>
        <p>
          Se excluyen {incomplete} registros incompletos de los
          lotes seleccionados y {examples} ejemplos de la aplicación.
          Los registros se conservan en la bitácora.
        </p>
      </div>

      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <caption
              style={{
                textAlign: "left",
                padding: 16,
                color: "var(--muted)",
              }}
            >
              Última observación de cada planta dentro del rango de edad
            </caption>

            <thead>
              <tr>
                <th>Lote</th>
                <th>Tratamiento</th>
                <th>Dosis / frecuencia</th>
                <th>Plantas distintas</th>
                <th>Edad (días)</th>
                <th>Altura media (cm)</th>
                <th>Hojas medias</th>
                <th>Diámetro medio (cm)</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.tableKey}>
                  <td>{row.zone}</td>
                  <td><strong>{row.name}</strong></td>
                  <td>{row.dose}</td>
                  <td>{row.count}</td>
                  <td>
                    {row.minAge === row.maxAge
                      ? row.minAge
                      : `${row.minAge}–${row.maxAge}`}
                  </td>
                  <td>
                    {format(row.height)}
                    <br />
                    <small>n = {row.heightN}</small>
                  </td>
                  <td>
                    {format(row.leaves, 1)}
                    <br />
                    <small>n = {row.leavesN}</small>
                  </td>
                  <td>
                    {format(row.diameter)}
                    <br />
                    <small>n = {row.measured}</small>
                  </td>
                </tr>
              ))}

              {!rows.length && (
                <tr>
                  <td colSpan={8}>
                    {invalidRange
                      ? "Corrige el rango de edad."
                      : "No hay plantas con identificación, siembra y dosis en este rango."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-note">
          <p>
            n es la cantidad de mediciones manuales válidas
            del promedio. “—” indica que no hay mediciones
            válidas para calcularlo. Los datos faltantes
            no cuentan como cero.
          </p>
          <p>
            Una planta puede aparecer aunque todavía no tenga
            mediciones. Su observación más reciente no se sustituye
            por una medida antigua para completar un promedio.
          </p>
          <p>
            Para comparar edades semejantes, elige un rango estrecho.
            Con una sola planta por tratamiento, el resultado describe
            esa planta. Por sí solo no demuestra el efecto del abono.
          </p>
        </div>
      </div>

      <div className="section-heading" style={{ marginTop: 28 }}>
        <div>
          <h2>Seguimiento de cada planta</h2>
          <p>
            Mediciones y cambio desde la medida manual válida anterior.
          </p>
        </div>
      </div>

      <label style={{ maxWidth: 480, marginBottom: 16 }}>
        Planta que deseas revisar
        <select
          value={activePlant}
          onChange={(event) => setSelectedPlant(event.target.value)}
        >
          <option value="">Todas las plantas del rango</option>
          {plants.map((plant) => (
            <option key={plantKey(plant)} value={plantKey(plant)}>
              {plant.plantId} · {plant.zone} · Siembra{" "}
              {dateLabel(plant.sowingDate)}
            </option>
          ))}
        </select>
      </label>

      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Planta / lote</th>
                <th>Siembra / observación</th>
                <th>Edad</th>
                <th>Tratamiento / dosis</th>
                <th>Medidas manuales</th>
                <th>Cambio desde medida anterior</th>
                <th>Estado / síntomas / fotografía</th>
              </tr>
            </thead>

            <tbody>
              {visibleObservations.map((record) => (
                <tr key={record.id}>
                  <td>
                    <strong>{record.plantId}</strong>
                    <br />
                    {record.zone}
                  </td>

                  <td>
                    Siembra: {dateLabel(record.sowingDate)}
                    <br />
                    Observación: {dateLabel(record.date)}
                    <br />
                    <small>{record.collaborator}</small>
                  </td>

                  <td>{age(record)} días</td>

                  <td>
                    {record.fertilizer}
                    <br />
                    <small>{record.dose}</small>
                  </td>

                  <td>
                    {metrics.map((metric) => {
                      const measurement = manualValue(
                        record,
                        metric.key,
                      );

                      return (
                        <div key={metric.key} style={{ marginBottom: 8 }}>
                          {metric.label}:{" "}
                          {measurement === null
                            ? "No medido"
                            : `${format(
                                measurement,
                                metric.key === "leafCount" ? 0 : 2,
                              )} ${metric.unit}`}
                        </div>
                      );
                    })}
                  </td>

                  <td>
                    {metrics.map((metric) => {
                      const measured = manualValue(record, metric.key);

                      const change = measured === null
                        ? null
                        : growth(record, records, metric.key);

                      return (
                        <div key={metric.key} style={{ marginBottom: 12 }}>
                          <strong>{metric.label}: </strong>

                          {change ? (
                            <>
                              {change.delta > 0 ? "+" : ""}
                              {format(
                                change.delta,
                                metric.key === "leafCount" ? 0 : 2,
                              )}{" "}
                              {metric.unit} en {change.days} días
                              <br />
                              <small>
                                {format(change.perDay)} {metric.unit}/día
                                <br />
                                Desde {dateLabel(change.previousDate)}
                              </small>
                            </>
                          ) : measured === null ? (
                            "Sin medida manual actual"
                          ) : (
                            "Sin medida manual anterior"
                          )}
                        </div>
                      );
                    })}
                  </td>

                  <td>
                    <strong>{record.health}</strong>
                    <p>
                      {record.observations.join(" · ") ||
                        "Sin observaciones escritas"}
                    </p>

                    {record.image && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer" }}>
                          Ver fotografía
                        </summary>
                        <img
                          src={record.image}
                          alt={`Rabanito ${record.plantId}, ${record.date}`}
                          loading="lazy"
                          style={{
                            display: "block",
                            width: 200,
                            maxWidth: "100%",
                            marginTop: 8,
                            borderRadius: 8,
                          }}
                        />
                      </details>
                    )}
                  </td>
                </tr>
              ))}

              {!visibleObservations.length && (
                <tr>
                  <td colSpan={7}>
                    No hay observaciones para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="table-note">
          <p>
            El cambio compara la misma planta y tratamiento.
            La medida anterior puede estar fuera del filtro de edad.
            Un cambio negativo indica una disminución registrada;
            revisa las notas y el criterio de medición.
          </p>
        </div>
      </div>

      <div className="section-heading" style={{ marginTop: 28 }}>
        <div>
          <h2>Comprobación de las estimaciones de IA</h2>
          <p>
            Estimación original frente a medición manual del mismo
            registro. Se aplican los filtros de lote y edad,
            independientemente de la planta seleccionada en la
            tabla de seguimiento.
          </p>
        </div>
      </div>

      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Medida</th>
                <th>Pares válidos</th>
                <th>Plantas distintas</th>
                <th>Error absoluto medio</th>
                <th>Sesgo: IA − manual</th>
                <th>Error porcentual absoluto medio</th>
              </tr>
            </thead>

            <tbody>
              {checks.map(({ label, unit, result }) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{result.n}</td>
                  <td>{result.plants}</td>
                  <td>
                    {result.mae === null
                      ? "—"
                      : `${format(result.mae)} ${unit}`}
                  </td>
                  <td>
                    {result.bias === null
                      ? "—"
                      : `${format(result.bias)} ${unit}`}
                  </td>
                  <td>
                    {result.mape === null
                      ? "—"
                      : `${format(result.mape, 1)} %`}
                    <br />
                    <small>n = {result.percentageN}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-note">
          <p>
            El error absoluto medio muestra cuánto se aleja la IA
            de la medición manual. Un sesgo positivo indica
            sobreestimación; uno negativo, subestimación.
          </p>
          <p>
            El error porcentual excluye referencias manuales iguales
            a cero. Varias observaciones de una misma planta cuentan
            como varios pares, pero no como plantas independientes.
          </p>
          <p>
            Estos cálculos comprueban los registros disponibles.
            No corrigen automáticamente nuevas estimaciones ni
            equivalen al porcentaje de confianza de Gemini.
          </p>
        </div>

        <details style={{ padding: 16 }}>
          <summary style={{ cursor: "pointer" }}>
            Revisar los pares utilizados
          </summary>

          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Planta / lote</th>
                  <th>Observación</th>
                  <th>Medida</th>
                  <th>Manual</th>
                  <th>Estimación IA</th>
                  <th>Diferencia</th>
                </tr>
              </thead>

              <tbody>
                {checks.flatMap(({ label, unit, result }) =>
                  result.pairs.map((pair) => (
                    <tr key={`${label}-${pair.record.id}`}>
                      <td>
                        {pair.record.plantId} · {pair.record.zone}
                      </td>
                      <td>{dateLabel(pair.record.date)}</td>
                      <td>{label}</td>
                      <td>{format(pair.manual)} {unit}</td>
                      <td>{format(pair.estimate)} {unit}</td>
                      <td>
                        {pair.error > 0 ? "+" : ""}
                        {format(pair.error)} {unit}
                      </td>
                    </tr>
                  )),
                )}

                {checks.every((check) => check.result.n === 0) && (
                  <tr>
                    <td colSpan={6}>
                      Aún no hay pares. Guarda un análisis de IA
                      junto con una medición manual de la misma planta
                      y de la misma observación.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </>
  );
}

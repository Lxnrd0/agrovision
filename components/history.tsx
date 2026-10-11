"use client";

import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Trash2,
  ArrowUpRight,
  Leaf,
  CalendarDays,
  MapPin,
  Ruler,
  NotebookPen,
} from "lucide-react";

import type { FieldRecord } from "@/lib/types";
import type { Metric } from "@/lib/tracking";
import { age, origin, value } from "@/lib/tracking";
import { Badge, Modal } from "./ui";

function sourceLabel(record: FieldRecord, metric: Metric) {
  const source = origin(record, metric);

  if (source === "manual") return "Manual";
  if (source === "ia") return "Estimación IA";

  return "Sin verificar";
}

function measurement(
  record: FieldRecord,
  metric: Metric,
  unit: string,
) {
  const measure = value(record, metric);

  if (measure === null) return "Sin medida";

  return `${measure} ${unit} · ${sourceLabel(record, metric)}`;
}

export default function History({
  records,
  onDelete,
  onNew,
}: {
  records: FieldRecord[];
  onDelete: (record: FieldRecord) => void;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState("Todos");
  const [zone, setZone] = useState("Todos");
  const [recordOrigin, setRecordOrigin] = useState("Todos");
  const [details, setDetails] = useState<FieldRecord | null>(null);

  const filtered = records
    .filter(
      (record) =>
        (health === "Todos" || record.health === health) &&
        (zone === "Todos" || record.zone === zone) &&
        (recordOrigin === "Todos" ||
          (recordOrigin === "Reales"
            ? record.source !== "demo"
            : record.source === "demo")) &&
        [
          record.plantId || "",
          record.dose || "",
          record.collaborator,
          record.fertilizer,
          record.crop,
          record.zone,
          record.date,
          record.sowingDate || "",
          ...record.observations,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Lo que crece, queda registrado.</h2>
          <p>Revisa las visitas y mediciones de cada rabanito.</p>
        </div>
        <Badge tone="gray">{filtered.length} registros</Badge>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar en bitácora"
            placeholder="Buscar planta, colaborador, abono o dosis…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <SlidersHorizontal size={18} />

        <select
          aria-label="Filtrar por lote"
          value={zone}
          onChange={(event) => setZone(event.target.value)}
        >
          <option value="Todos">Todos los lotes</option>
          {[...new Set(records.map((record) => record.zone))].map(
            (item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ),
          )}
        </select>

        <select
          aria-label="Filtrar por estado"
          value={health}
          onChange={(event) => setHealth(event.target.value)}
        >
          <option value="Todos">Todos los estados</option>
          <option value="Sano">Sano</option>
          <option value="Enfermo">Enfermo</option>
          <option value="Indeterminado">Indeterminado</option>
        </select>

        <select
          aria-label="Filtrar registros reales o ejemplos"
          value={recordOrigin}
          onChange={(event) => setRecordOrigin(event.target.value)}
        >
          <option value="Todos">Todos los registros</option>
          <option value="Reales">Registros reales</option>
          <option value="Ejemplos">Ejemplos</option>
        </select>
      </div>

      {filtered.length ? (
        <div className="record-grid">
          {filtered.map((record) => {
            const plantAge = age(record);

            return (
              <article key={record.id} className="record-card">
                <div className="record-image">
                  {record.image ? (
                    <img
                      src={record.image}
                      loading="lazy"
                      alt={`Rabanito ${record.plantId || "sin identificar"} en ${record.zone}`}
                    />
                  ) : (
                    <Leaf size={52} />
                  )}

                  <Badge
                    tone={record.health === "Sano" ? "green" : "orange"}
                  >
                    {record.health}
                  </Badge>

                  <button
                    type="button"
                    className="record-image-delete"
                    title="Eliminar registro"
                    aria-label={`Eliminar observación de ${record.plantId || record.zone} del ${record.date}`}
                    onClick={() => onDelete(record)}
                  >
                    <Trash2 size={16} />
                  </button>

                  {record.source === "demo" && (
                    <span className="demo-label">EJEMPLO</span>
                  )}
                </div>

                <div className="record-body">
                  <div className="record-meta">
                    <span>
                      <CalendarDays size={13} />
                      {new Date(
                        `${record.date}T12:00:00`,
                      ).toLocaleDateString("es-PE", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>

                    <span>
                      <MapPin size={13} />
                      {record.zone}
                    </span>
                  </div>

                  <h3>
                    {record.plantId || "Planta sin identificar"}
                    {" · "}
                    {record.crop.split(" · ")[0]}
                  </h3>

                  <p>
                    {record.fertilizer}
                    {" · "}
                    {record.dose || "Dosis pendiente"}
                  </p>

                  <p>
                    {plantAge === null
                      ? "Fecha de siembra pendiente o inválida"
                      : `${plantAge} días desde la siembra`}
                  </p>

                  <div className="record-values">
                    <span>
                      <Ruler size={16} />
                      <strong>
                        {value(record, "diameterCm") ?? "—"}
                      </strong>
                      {" "}cm
                    </span>

                    <span>
                      <Leaf size={16} />
                      <strong>
                        {value(record, "leafCount") ?? "—"}
                      </strong>
                      {" "}hojas
                    </span>
                  </div>

                  <p className="muted">
                    Diámetro: {sourceLabel(record, "diameterCm")}
                    <br />
                    Hojas: {sourceLabel(record, "leafCount")}
                  </p>

                  <div className="record-foot">
                    <span className="person-avatar">
                      {record.collaborator
                        .trim()
                        .split(/\s+/)
                        .map((word) => word[0] || "")
                        .slice(0, 2)
                        .join("")}
                    </span>

                    <span>{record.collaborator}</span>

                    <button
                      type="button"
                      className="icon-button"
                      title="Ver registro completo"
                      aria-label={`Ver observación de ${record.plantId || record.zone} del ${record.date}`}
                      onClick={() => setDetails(record)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <NotebookPen size={38} />
          <h3>No hay registros con estos filtros</h3>
          <p>Prueba otra búsqueda o añade una observación.</p>

          <button
            type="button"
            className="button primary"
            onClick={onNew}
          >
            Nuevo registro
          </button>
        </div>
      )}

      {details && (
        <Modal
          title={`${details.plantId || "Planta sin identificar"} · ${details.zone}`}
          onClose={() => setDetails(null)}
        >
          <p className="modal-subtitle">
            {details.date} · {details.collaborator}
          </p>

          {details.image && (
            <img
              className="detail-image"
              src={details.image}
              alt={`Fotografía del rabanito ${details.plantId || "sin identificar"}`}
            />
          )}

          <div className="detail-tags">
            <Badge>{details.health}</Badge>

            <Badge tone="gray">
              {details.source === "demo"
                ? "Ejemplo: excluido de comparación"
                : details.source === "gemini"
                  ? "Análisis Gemini"
                  : details.source === "openai"
                    ? "Análisis OpenAI"
                    : "Registro manual"}
            </Badge>
          </div>

          <dl className="detail-list">
            {[
              ["Planta", details.plantId || "Sin identificar"],
              ["Cultivo", details.crop],
              ["Siembra", details.sowingDate || "Pendiente"],
              ["Observación", details.date],
              [
                "Edad",
                age(details) === null
                  ? "Sin calcular"
                  : `${age(details)} días`,
              ],
              ["Tratamiento", details.fertilizer],
              ["Dosis", details.dose || "Pendiente"],
              [
                "Altura",
                measurement(details, "heightCm", "cm"),
              ],
              [
                "Diámetro",
                measurement(details, "diameterCm", "cm"),
              ],
              [
                "Hojas",
                measurement(details, "leafCount", "hojas"),
              ],
              ["Color del bulbo", details.bulbColor || "Sin registrar"],
              ["Color de hojas", details.leafColor || "Sin registrar"],
              [
                "Diámetro original IA",
                details.estimatedDiameterCm == null
                  ? "Sin estimación"
                  : `${details.estimatedDiameterCm} cm`,
              ],
              [
                "Hojas originales IA",
                details.estimatedLeafCount == null
                  ? "Sin estimación"
                  : `${details.estimatedLeafCount} hojas`,
              ],
              [
                "Confianza del modelo",
                details.source === "manual"
                  ? "No aplica"
                  : details.source === "demo"
                    ? `${details.confidence}% · valor simulado`
                    : `${details.confidence}% · no calibrada`,
              ],
            ].map(([label, content]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{content}</dd>
              </div>
            ))}
          </dl>

          <h3>Síntomas y observaciones</h3>

          {details.observations.length ? (
            details.observations.map((observation, index) => (
              <p className="detail-copy" key={index}>
                {observation}
              </p>
            ))
          ) : (
            <p className="detail-copy">Sin observaciones.</p>
          )}

          <h3>Recomendaciones y limitaciones</h3>

          {[...details.recommendations, ...details.limitations].map(
            (item, index) => (
              <p className="detail-copy" key={index}>
                {item}
              </p>
            ),
          )}
        </Modal>
      )}
    </>
  );
}

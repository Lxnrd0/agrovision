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
  Pencil,
} from "lucide-react";

import type { FieldRecord } from "@/lib/types";
import type { Metric } from "@/lib/tracking";
import { age, origin, value } from "@/lib/tracking";
import { Badge, Modal } from "./ui";

type HistoryProps = {
  records: FieldRecord[];
  onDelete: (record: FieldRecord) => void;
  onNew: () => void;
  onEdit?: (record: FieldRecord) => void;
};

function sourceLabel(record: FieldRecord, metric: Metric) {
  if (value(record, metric) === null) return "Sin medida";

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

function dateLabel(date: string | undefined) {
  if (!date) return "Sin registrar";

  const parts = date.split("-");

  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : date;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((word) => word[0] || "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default function History({
  records,
  onDelete,
  onNew,
  onEdit,
}: HistoryProps) {
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState("Todos");
  const [zone, setZone] = useState("");
  const [recordOrigin, setRecordOrigin] = useState("Todos");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const details = records.find(
    (record) => record.id === detailsId,
  );

  const zones = [
    ...new Set(records.map((record) => record.zone)),
  ].sort((a, b) => a.localeCompare(b));

  const filtered = records
    .filter(
      (record) =>
        (health === "Todos" || record.health === health) &&
        (!zone || record.zone === zone) &&
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
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.createdAt.localeCompare(a.createdAt),
    );

  function editRecord(record: FieldRecord) {
    if (!onEdit) return;

    setDetailsId(null);
    onEdit(record);
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Registro de observaciones</h2>
          <p>
            Consulta las medidas, fotografías y notas de cada visita.
          </p>
        </div>

        <Badge tone="gray">
          {filtered.length} observaciones
        </Badge>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar en bitácora"
            placeholder="Buscar planta, responsable o fertilizante…"
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
          <option value="">Todos los lotes</option>

          {zones.map((item) => (
            <option key={item} value={item}>
              {item || "Sin lote"}
            </option>
          ))}
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
          onChange={(event) =>
            setRecordOrigin(event.target.value)
          }
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
                    tone={
                      record.health === "Sano"
                        ? "green"
                        : record.health === "Enfermo"
                          ? "orange"
                          : "gray"
                    }
                  >
                    {record.health}
                  </Badge>

                  <button
                    type="button"
                    className="record-image-delete"
                    title="Eliminar observación"
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
                      {dateLabel(record.date)}
                    </span>

                    <span>
                      <MapPin size={13} />
                      {record.zone}
                    </span>
                  </div>

                  <h3>
                    {record.plantId || "Planta sin identificar"}
                    {" · "}
                    Rabanito
                  </h3>

                  <p>
                    {record.fertilizer}
                    {" · "}
                    {record.dose || "Dosis no registrada"}
                  </p>

                  <p>
                    {plantAge === null
                      ? "Fecha de siembra no válida"
                      : `${plantAge} días desde la siembra`}
                  </p>

                  <div
                    className="record-values"
                    style={{ flexWrap: "wrap", gap: 12 }}
                  >
                    <span>
                      <Ruler size={16} />
                      <strong>
                        {value(record, "heightCm") ?? "—"}
                      </strong>
                      {" "}cm de altura
                    </span>

                    <span>
                      <Leaf size={16} />
                      <strong>
                        {value(record, "leafCount") ?? "—"}
                      </strong>
                      {" "}hojas
                    </span>

                    <span>
                      <Ruler size={16} />
                      <strong>
                        {value(record, "diameterCm") ?? "—"}
                      </strong>
                      {" "}cm de diámetro
                    </span>
                  </div>

                  <p className="muted">
                    Altura: {sourceLabel(record, "heightCm")}
                    <br />
                    Hojas: {sourceLabel(record, "leafCount")}
                    <br />
                    Diámetro: {sourceLabel(record, "diameterCm")}
                  </p>

                  <div className="record-foot">
                    <span className="person-avatar">
                      {initials(record.collaborator)}
                    </span>

                    <span>{record.collaborator}</span>

                    <button
                      type="button"
                      className="icon-button"
                      title="Ver observación completa"
                      aria-label={`Ver observación de ${record.plantId || record.zone} del ${record.date}`}
                      onClick={() => setDetailsId(record.id)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>

                  {onEdit && (
                    <button
                      type="button"
                      className="button secondary"
                      style={{ width: "100%", marginTop: 12 }}
                      onClick={() => editRecord(record)}
                    >
                      <Pencil size={16} />
                      Editar observación
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <NotebookPen size={38} />

          <h3>No se encontraron observaciones</h3>

          <p>
            Cambia los filtros o registra una observación.
          </p>

          <button
            type="button"
            className="button primary"
            onClick={onNew}
          >
            Nueva observación
          </button>
        </div>
      )}

      {details && (
        <Modal
          title={`${details.plantId || "Planta sin identificar"} · ${details.zone}`}
          onClose={() => setDetailsId(null)}
        >
          <p className="modal-subtitle">
            {dateLabel(details.date)} · {details.collaborator}
          </p>

          {details.image && (
            <img
              className="detail-image"
              src={details.image}
              alt={`Fotografía del rabanito ${details.plantId || "sin identificar"}`}
              style={{ objectFit: "contain" }}
            />
          )}

          <div
            className="detail-tags"
            style={{ flexWrap: "wrap" }}
          >
            <Badge
              tone={
                details.health === "Sano"
                  ? "green"
                  : details.health === "Enfermo"
                    ? "orange"
                    : "gray"
              }
            >
              {details.health}
            </Badge>

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
              ["Lote", details.zone],
              ["Siembra", dateLabel(details.sowingDate)],
              ["Observación", dateLabel(details.date)],
              [
                "Edad",
                age(details) === null
                  ? "Sin calcular"
                  : `${age(details)} días`,
              ],
              ["Responsable", details.collaborator],
              ["Tratamiento", details.fertilizer],
              ["Dosis", details.dose || "Pendiente"],
              [
                "Altura",
                measurement(details, "heightCm", "cm"),
              ],
              [
                "Hojas",
                measurement(details, "leafCount", "hojas"),
              ],
              [
                "Diámetro",
                measurement(details, "diameterCm", "cm"),
              ],
              [
                "Color del bulbo",
                details.bulbColor || "Sin registrar",
              ],
              [
                "Color de las hojas",
                details.leafColor || "Sin registrar",
              ],
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
                    : `${details.confidence}% · precisión no comprobada`,
              ],
            ].map(([label, content]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd
                  style={{
                    margin: 0,
                    overflowWrap: "anywhere",
                  }}
                >
                  {content}
                </dd>
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
            <p className="detail-copy">
              Sin observaciones registradas.
            </p>
          )}

          <h3>Observaciones de IA</h3>

          {(details.aiObservations ?? []).length ? (
            details.aiObservations!.map((item, index) => (
              <p className="detail-copy" key={index}>
                {item}
              </p>
            ))
          ) : (
            <p className="detail-copy">
              Sin observaciones de IA.
            </p>
          )}

          <h3>Recomendaciones</h3>

          {details.recommendations.length ? (
            details.recommendations.map((item, index) => (
              <p className="detail-copy" key={index}>
                {item}
              </p>
            ))
          ) : (
            <p className="detail-copy">
              Sin recomendaciones registradas.
            </p>
          )}

          <h3>Limitaciones</h3>

          {details.limitations.length ? (
            details.limitations.map((item, index) => (
              <p className="detail-copy" key={index}>
                {item}
              </p>
            ))
          ) : (
            <p className="detail-copy">
              Sin limitaciones registradas.
            </p>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setDetailsId(null)}
            >
              Cerrar
            </button>

            {onEdit && (
              <button
                type="button"
                className="button primary"
                onClick={() => editRecord(details)}
              >
                <Pencil size={16} />
                Editar observación
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

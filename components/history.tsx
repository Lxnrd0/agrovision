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
import { FieldRecord } from "@/lib/types";
import { Badge, Modal } from "./ui";

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
  const [origin, setOrigin] = useState("Todos");
  const [details, setDetails] = useState<FieldRecord | null>(null);

  const filtered = records.filter(
    (record) =>
      (health === "Todos" || record.health === health) &&
      (zone === "Todos" || record.zone === zone) &&
      (origin === "Todos" ||
        (origin === "Reales"
          ? record.source !== "demo"
          : record.source === "demo")) &&
      [
        record.collaborator,
        record.fertilizer,
        record.crop,
        record.zone,
        ...record.observations,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Lo que crece, queda registrado.</h2>
          <p>Observaciones y decisiones de cada jornada en campo.</p>
        </div>
        <Badge tone="gray">{filtered.length} registros</Badge>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar en bitácora"
            placeholder="Buscar cultivo, colaborador, fertilizante…"
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
          {[...new Set(records.map((record) => record.zone))].map((item) => (
            <option key={item} value={item}>
              {item}
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
          aria-label="Filtrar por origen"
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
        >
          <option value="Todos">Todos</option>
          <option value="Reales">Reales</option>
          <option value="Ejemplos">Ejemplos</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="record-grid">
          {filtered.map((record) => (
            <article key={record.id} className="record-card">
              <div className="record-image">
                {record.image ? (
                  <img
                    src={record.image}
                    alt={`Muestra de ${record.crop} en ${record.zone}`}
                  />
                ) : (
                  <Leaf size={52} />
                )}

                <Badge tone={record.health === "Sano" ? "green" : "orange"}>
                  {record.health}
                </Badge>

                <button
                  type="button"
                  className="record-image-delete"
                  title="Eliminar registro"
                  aria-label={`Eliminar registro ${record.crop} en ${record.zone}`}
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
                    {new Date(`${record.date}T12:00:00`).toLocaleDateString(
                      "es-PE",
                      { day: "numeric", month: "short" },
                    )}
                  </span>
                  <span>
                    <MapPin size={13} />
                    {record.zone}
                  </span>
                </div>

                <h3>{record.crop.split(" · ")[0]}</h3>
                <p>{record.fertilizer}</p>

                <div className="record-values">
                  <span>
                    <Ruler size={16} />
                    <strong>{record.diameterCm ?? "—"}</strong> cm
                  </span>
                  <span>
                    <Leaf size={16} />
                    <strong>{record.leafCount ?? "—"}</strong> hojas
                  </span>
                </div>

                <div className="record-foot">
                  <span className="person-avatar">
                    {record.collaborator
                      .split(" ")
                      .map((word) => word[0])
                      .slice(0, 2)
                      .join("")}
                  </span>

                  <span>{record.collaborator}</span>

                  <button
                    type="button"
                    className="icon-button"
                    title="Ver registro"
                    aria-label={`Ver registro ${record.zone} ${record.date}`}
                    onClick={() => setDetails(record)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <NotebookPen size={38} />
          <h3>No hay registros con estos filtros</h3>
          <p>Prueba otra búsqueda o añade tu primera observación.</p>
          <button type="button" className="button primary" onClick={onNew}>
            Nuevo registro
          </button>
        </div>
      )}

      {details && (
        <Modal
          title={`${details.crop} · ${details.zone}`}
          onClose={() => setDetails(null)}
        >
          <p className="modal-subtitle">
            {details.date} · {details.collaborator}
          </p>

          {details.image && (
            <img
              className="detail-image"
              src={details.image}
              alt="Fotografía del registro"
            />
          )}

          <div className="detail-tags">
            <Badge>{details.health}</Badge>
            <Badge tone="gray">
              {details.source === "demo"
                ? "Datos de ejemplo"
                : details.source === "gemini"
                  ? "Gemini · Visión"
                  : details.source === "openai"
                    ? "OpenAI · Visión"
                    : "Registro manual"}
            </Badge>
          </div>

          <dl className="detail-list">
            {[
              ["Fertilizante", details.fertilizer],
              ["Color del bulbo", details.bulbColor],
              ["Color de hojas", details.leafColor],
              ["Hojas", details.leafCount ?? "Sin estimar"],
              [
                "Diámetro",
                details.diameterCm === null
                  ? "Sin escala"
                  : `${details.diameterCm} cm`,
              ],
              [
                "Confianza",
                details.source === "manual"
                  ? "No aplica"
                  : `${details.confidence}% · no calibrada`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          <h3>Observaciones</h3>
          {details.observations.map((observation, index) => (
            <p className="detail-copy" key={index}>
              {observation}
            </p>
          ))}

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
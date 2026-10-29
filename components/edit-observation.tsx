"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { FieldRecord, PlantHealth } from "@/lib/types";
import type { Metric } from "@/lib/tracking";
import { origin, validateRecord, value } from "@/lib/tracking";
import { Modal, Loading } from "./ui";
import { Save } from "lucide-react";

type Props = {
  record: FieldRecord;
  records: FieldRecord[];
  onClose: () => void;
  onSave: (record: FieldRecord) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};

const fields: {
  key: Metric;
  label: string;
  step: string;
  min: number;
}[] = [
  {
    key: "heightCm",
    label: "Altura (cm)",
    step: "0.01",
    min: 0,
  },
  {
    key: "leafCount",
    label: "Número de hojas",
    step: "1",
    min: 0,
  },
  {
    key: "diameterCm",
    label: "Diámetro del bulbo (cm)",
    step: "0.01",
    min: 0.01,
  },
];

function localDate() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function EditObservation({
  record,
  records,
  onClose,
  onSave,
  notify,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setFormError("");

    const data = new FormData(event.currentTarget);

    const text = (name: string) =>
      String(data.get(name) ?? "").trim();

    setSaving(true);

    try {
      const updated: FieldRecord = {
        ...record,
        date: text("date"),
        collaborator: text("collaborator"),
        health: text("health") as PlantHealth,
        bulbColor: text("bulbColor"),
        leafColor: text("leafColor"),
        observations: text("observations")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        measurementSources: {
          ...record.measurementSources,
        },
      };

      for (const field of fields) {
        const input = text(field.key);
        const next = input === "" ? null : Number(input);
        const previous = value(record, field.key);

        updated[field.key] = next;

        if (next !== previous) {
          updated.measurementSources![field.key] =
            next === null ? "unknown" : "manual";
        }
      }

      if (!updated.collaborator) {
        throw new Error("Escribe el nombre del responsable.");
      }

      if (updated.date > localDate()) {
        throw new Error(
          "La observación no puede tener una fecha futura.",
        );
      }

      validateRecord(updated, records, { allowLegacy: true });
      await onSave(updated);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo guardar la corrección.";

      setFormError(message);
      notify(message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Editar observación · ${record.plantId || record.zone}`}
      wide
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form className="tracking-form" onSubmit={submit}>
        <p className="modal-subtitle">
          Planta: {record.plantId || "Sin identificar"}
          {" · "}{record.zone}
          <br />
          Siembra: {record.sowingDate || "Sin registrar"}
          <br />
          {record.fertilizer}
          {" · "}{record.dose || "Sin dosis"}
          <br />
          La corrección conserva la planta, el tratamiento,
          la fotografía y las estimaciones originales de IA.
        </p>

        <fieldset
          disabled={saving}
          style={{
            border: 0,
            margin: 0,
            padding: 0,
            minWidth: 0,
          }}
        >
          <div className="form-grid">
            <label>
              Fecha de observación *
              <input
                name="date"
                type="date"
                required
                min={record.sowingDate || undefined}
                max={localDate()}
                defaultValue={record.date}
              />
            </label>

            <label>
              Responsable *
              <input
                name="collaborator"
                required
                maxLength={80}
                defaultValue={record.collaborator}
              />
            </label>

            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  name={field.key}
                  type="number"
                  min={field.min}
                  step={field.step}
                  defaultValue={value(record, field.key) ?? ""}
                />
                <small>
                  Origen actual:{" "}
                  {value(record, field.key) === null
                    ? "Sin medida"
                    : origin(record, field.key) === "manual"
                      ? "Manual"
                      : origin(record, field.key) === "ia"
                        ? "Estimación IA"
                        : "Sin verificar"}
                  .
                </small>
              </label>
            ))}

            <label>
              Estado observado
              <select name="health" defaultValue={record.health}>
                <option value="Indeterminado">Indeterminado</option>
                <option value="Sano">Sano</option>
                <option value="Enfermo">Enfermo</option>
              </select>
            </label>

            <label>
              Color de las hojas
              <input
                name="leafColor"
                maxLength={100}
                defaultValue={record.leafColor}
              />
            </label>

            <label>
              Color del bulbo
              <input
                name="bulbColor"
                maxLength={100}
                defaultValue={record.bulbColor}
              />
            </label>

            <label className="span-2">
              Síntomas y observaciones
              <textarea
                name="observations"
                rows={4}
                maxLength={5000}
                defaultValue={record.observations.join("\n")}
              />
            </label>
          </div>

          <p className="detail-copy">
            Introduce correcciones medidas en campo.
            Al cambiar un valor, su origen pasa a Manual.
            Vacío significa que no hay medida; cero es un valor real.
          </p>
        </fieldset>

        {formError && (
          <div className="form-error" role="alert">
            <strong>No se pudo guardar</strong>
            <p>{formError}</p>
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="button primary"
            disabled={saving}
          >
            {saving ? <Loading /> : <Save size={17} />}
            {" "}
            {saving ? "Guardando…" : "Guardar corrección"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

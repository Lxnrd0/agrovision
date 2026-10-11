"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type {
  Diagnosis,
  FieldRecord,
  PlantHealth,
} from "@/lib/types";
import { readImage } from "@/lib/storage";
import { plantKey, validateRecord } from "@/lib/tracking";
import { Modal, Loading } from "./ui";
import { Save, Upload } from "lucide-react";

type ReportFormProps = {
  records: FieldRecord[];
  diagnosis: Diagnosis | null;
  image: string;
  source: FieldRecord["source"];
  onClose: () => void;
  onSave: (record: FieldRecord) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};

function localDate() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function ReportForm({
  records,
  diagnosis,
  image,
  source,
  onClose,
  onSave,
  notify,
}: ReportFormProps) {
  const [photo, setPhoto] = useState(image);
  const [saving, setSaving] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [today] = useState(localDate);

  const busy = saving || loadingPhoto;

  const plants = [
    ...new Map(
      [...records]
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter(
          (record) =>
            record.source !== "demo" &&
            record.plantId &&
            record.sowingDate &&
            record.dose,
        )
        .map((record) => [plantKey(record), record]),
    ).values(),
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    const data = new FormData(event.currentTarget);

    function text(name: string) {
      return String(data.get(name) ?? "").trim();
    }

    function number(name: string) {
      const input = text(name);
      return input === "" ? null : Number(input);
    }

    const manualDiameter = number("diameterCm");
    const manualLeaves = number("leafCount");
    const manualHeight = number("heightCm");

    const estimate =
      photo === image ? diagnosis : null;

    setSaving(true);

    try {
      const record: FieldRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),

        plantId: text("plantId"),
        sowingDate: text("sowingDate"),
        dose: text("dose"),

        collaborator: text("collaborator"),
        date: text("date"),
        zone: text("zone"),
        fertilizer: text("fertilizer"),
        crop: "Rabanito",

        bulbColor: text("bulbColor"),
        leafColor: text("leafColor"),

        heightCm: manualHeight,

        diameterCm:
          manualDiameter ?? estimate?.diameterCm ?? null,

        leafCount:
          manualLeaves ?? estimate?.leafCount ?? null,

        measurementSources: {
          diameterCm:
            manualDiameter !== null
              ? "manual"
              : estimate?.diameterCm != null
                ? "ia"
                : "unknown",

          leafCount:
            manualLeaves !== null
              ? "manual"
              : estimate?.leafCount != null
                ? "ia"
                : "unknown",

          heightCm:
            manualHeight !== null ? "manual" : "unknown",
        },

        estimatedDiameterCm:
          estimate?.diameterCm ?? null,

        estimatedLeafCount:
          estimate?.leafCount ?? null,

        health: text("health") as PlantHealth,
        confidence: estimate?.confidence ?? 0,

        observations: text("observations")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),

        recommendations: estimate?.recommendations ?? [],

        limitations: estimate?.limitations ?? [
          "Registro manual de campo, sin análisis por IA.",
        ],

        image: photo,
        source,
      };

      validateRecord(record, records);
      await onSave(record);
      onClose();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el registro.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={
        diagnosis
          ? "Registrar observación analizada"
          : "Nuevo registro de rabanito"
      }
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <p className="modal-subtitle">
          Sigue la misma planta usando su etiqueta, lote
          y fecha de siembra.
          {source === "demo" &&
            " Este registro es un ejemplo y no entrará en la comparación real."}
        </p>

        <div className="form-grid">
          <label className="span-2">
            Continuar una planta registrada
            <select
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                const record = records.find(
                  (item) => item.id === event.target.value,
                );

                const form = event.currentTarget.form;

                if (!record || !form) return;

                const names = [
                  "plantId",
                  "sowingDate",
                  "zone",
                  "fertilizer",
                  "dose",
                ] as const;

                for (const name of names) {
                  const input = form.elements.namedItem(
                    name,
                  ) as HTMLInputElement | null;

                  if (input) {
                    input.value = record[name] || "";
                  }
                }
              }}
            >
              <option value="">
                Nueva planta / elegir una existente
              </option>

              {plants.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.plantId} · {record.zone} · Siembra{" "}
                  {record.sowingDate}
                </option>
              ))}
            </select>
          </label>

          <label>
            Identificador de planta
            <input
              name="plantId"
              required
              disabled={busy}
              maxLength={80}
              placeholder="Ej. R-001"
            />
          </label>

          <label>
            Fecha de siembra
            <input
              name="sowingDate"
              type="date"
              required
              disabled={busy}
              max={today}
            />
          </label>

          <label>
            Fecha de observación
            <input
              name="date"
              type="date"
              required
              disabled={busy}
              defaultValue={today}
              max={today}
            />
          </label>

          <label>
            Colaborador
            <input
              name="collaborator"
              required
              disabled={busy}
              maxLength={80}
              placeholder="Nombre y apellido"
            />
          </label>

          <label>
            Lote o zona
            <input
              name="zone"
              required
              disabled={busy}
              maxLength={80}
              placeholder="Ej. Lote A"
            />
          </label>

          <label>
            Tratamiento o abono
            <input
              name="fertilizer"
              required
              disabled={busy}
              maxLength={100}
              placeholder="Ej. Humus de lombriz"
              list="fertilizers"
            />
            <datalist id="fertilizers">
              <option value="Humus de lombriz" />
              <option value="Compost orgánico" />
              <option value="NPK 20-20-20" />
              <option value="Sin fertilizante" />
            </datalist>
          </label>

          <label className="span-2">
            Dosis, unidad y frecuencia
            <input
              name="dose"
              required
              disabled={busy}
              maxLength={100}
              placeholder="Ej. 10 g/planta por aplicación; sin abono: 0 g/planta"
            />
          </label>

          <label>
            Cultivo
            <input value="Rabanito" readOnly />
          </label>

          <label>
            Estado observado
            <select
              name="health"
              disabled={busy}
              defaultValue={
                diagnosis?.health ?? "Indeterminado"
              }
            >
              <option value="Sano">Sano</option>
              <option value="Enfermo">Enfermo</option>
              <option value="Indeterminado">
                Indeterminado
              </option>
            </select>
          </label>

          <label>
            Altura manual (cm)
            <input
              name="heightCm"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              disabled={busy}
              placeholder="Del suelo al punto más alto"
            />
          </label>

          <label>
            Hojas contadas manualmente
            <input
              name="leafCount"
              type="number"
              min="0"
              max="10000"
              step="1"
              disabled={busy}
              placeholder="Vacío si no las contaste"
            />
          </label>

          <label>
            Diámetro manual del bulbo (cm)
            <input
              name="diameterCm"
              type="number"
              min="0.01"
              max="1000"
              step="0.01"
              disabled={busy}
              placeholder="Medido con regla o calibre"
            />
          </label>

          <label>
            Color del bulbo
            <input
              name="bulbColor"
              disabled={busy}
              maxLength={100}
              defaultValue={diagnosis?.bulbColor ?? ""}
              placeholder="No visible, si corresponde"
            />
          </label>

          <label>
            Color de las hojas
            <input
              name="leafColor"
              disabled={busy}
              maxLength={100}
              defaultValue={diagnosis?.leafColor ?? ""}
            />
          </label>

          <p className="span-2">
            Introduce solo medidas verificadas en campo.
            Si no puedes medir el bulbo, deja el diámetro
            vacío. Mantén el mismo tratamiento y dosis
            durante el seguimiento de esta planta.
          </p>

          {diagnosis && (
            <p className="span-2">
              Estimación de la foto: diámetro{" "}
              {diagnosis.diameterCm == null
                ? "sin estimar"
                : `${diagnosis.diameterCm} cm`}
              ; hojas {diagnosis.leafCount ?? "sin estimar"}.
              Si dejas una medida manual vacía, su estimación
              se guardará con origen IA. La confianza del
              modelo no comprueba su precisión.
            </p>
          )}

          <label className="span-2">
            Síntomas y observaciones
            <textarea
              name="observations"
              required
              disabled={busy}
              maxLength={5000}
              rows={3}
              defaultValue={
                diagnosis?.observations.join("\n") ?? ""
              }
              placeholder="Describe hojas, lesiones, desarrollo, riego o cambios visibles."
            />
          </label>
        </div>

        <label className="attachment">
          <Upload size={19} />

          <span>
            {loadingPhoto
              ? "Cargando fotografía…"
              : diagnosis
                ? "Fotografía analizada. Para cambiarla, vuelve al análisis."
                : photo
                  ? "Fotografía adjunta · Cambiar"
                  : "Adjuntar fotografía (opcional)"}
          </span>

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy || !!diagnosis}
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];

              input.value = "";

              if (!file || busy) return;

              setLoadingPhoto(true);

              try {
                setPhoto(await readImage(file));
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "No se pudo cargar la fotografía.",
                  true,
                );
              } finally {
                setLoadingPhoto(false);
              }
            }}
          />
        </label>

        {photo && (
          <img
            className="form-photo"
            src={photo}
            alt="Rabanito observado"
          />
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="button primary"
            disabled={busy}
          >
            {busy ? <Loading /> : <Save size={17} />}
            {" "}
            {saving
              ? "Guardando…"
              : loadingPhoto
                ? "Cargando fotografía…"
                : "Guardar registro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

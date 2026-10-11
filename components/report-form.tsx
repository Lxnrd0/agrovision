"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Diagnosis, FieldRecord, PlantHealth } from "@/lib/types";
import { readImage } from "@/lib/storage";
import { Modal, Loading } from "./ui";
import { Save, Upload } from "lucide-react";

type ReportFormProps = {
  diagnosis: Diagnosis | null;
  image: string;
  source: FieldRecord["source"];
  onClose: () => void;
  onSave: (record: FieldRecord) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};

const CROP = "Rabanito";

function getLocalDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function ReportForm({
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
  const [defaultDate] = useState(getLocalDate);

  const busy = saving || loadingPhoto;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const data = new FormData(e.currentTarget);

    const str = (name: string) =>
      String(data.get(name) ?? "").trim();

    const number = (name: string) => {
      const value = str(name);
      return value === "" ? null : Number(value);
    };

    setSaving(true);

    try {
      await onSave({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        collaborator: str("collaborator"),
        date: str("date"),
        zone: str("zone"),
        fertilizer: str("fertilizer"),
        crop: CROP,
        bulbColor: str("bulbColor"),
        leafColor: str("leafColor"),
        leafCount: number("leafCount"),
        diameterCm: number("diameterCm"),
        health: str("health") as PlantHealth,
        confidence: diagnosis?.confidence ?? 0,
        observations: str("observations")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        recommendations: diagnosis?.recommendations ?? [],
        limitations: diagnosis?.limitations ?? [
          "Registro manual; observación de campo sin validación de IA.",
        ],
        image: photo,
        source,
      });

      onClose();
    } catch {
      notify(
        "No se pudo guardar. Revisa el espacio disponible de tu navegador.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={diagnosis ? "Registrar diagnóstico" : "Nuevo registro de campo"}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <p className="modal-subtitle">
          Documenta esta observación en tu bitácora.{" "}
          {source === "demo" &&
            "Este registro conservará la etiqueta de demostración."}
        </p>

        <div className="form-grid">
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
            Fecha
            <input
              name="date"
              type="date"
              required
              disabled={busy}
              defaultValue={defaultDate}
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
              list="zones"
            />
            <datalist id="zones">
              <option value="Lote A" />
              <option value="Lote B" />
              <option value="Lote C" />
            </datalist>
          </label>

          <label>
            Fertilizante o abono
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

          <label>
            Cultivo
            <input
              name="crop"
              type="text"
              value={CROP}
              readOnly
              aria-readonly="true"
            />
          </label>

          <label>
            Estado
            <select
              name="health"
              disabled={busy}
              defaultValue={diagnosis?.health ?? "Indeterminado"}
            >
              <option value="Sano">Sano</option>
              <option value="Enfermo">Enfermo</option>
              <option value="Indeterminado">Indeterminado</option>
            </select>
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
            Color de hojas
            <input
              name="leafColor"
              disabled={busy}
              maxLength={100}
              defaultValue={diagnosis?.leafColor ?? ""}
            />
          </label>

          <label>
            Número de hojas
            <input
              name="leafCount"
              type="number"
              disabled={busy}
              min="0"
              max="10000"
              step="1"
              defaultValue={diagnosis?.leafCount ?? ""}
              placeholder="Sin estimar"
            />
          </label>

          <label>
            Diámetro aproximado (cm)
            <input
              name="diameterCm"
              type="number"
              disabled={busy}
              min="0.01"
              max="1000"
              step="0.01"
              defaultValue={diagnosis?.diameterCm ?? ""}
              placeholder="Solo con referencia métrica"
            />
          </label>

          <label className="span-2">
            Observaciones
            <textarea
              name="observations"
              required
              disabled={busy}
              maxLength={5000}
              rows={3}
              defaultValue={diagnosis?.observations.join("\n") ?? ""}
              placeholder="Describe el desarrollo, signos visibles y condiciones de la muestra."
            />
          </label>
        </div>

        <label className="attachment">
          <Upload size={19} />
          <span>
            {loadingPhoto
              ? "Cargando fotografía…"
              : photo
                ? "Fotografía adjunta · Cambiar imagen"
                : "Adjuntar fotografía (opcional)"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={async (e) => {
              const input = e.currentTarget;
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
            alt="Imagen adjunta al reporte de rabanito"
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
            {busy ? <Loading /> : <Save size={17} />}{" "}
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

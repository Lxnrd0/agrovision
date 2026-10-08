"use client";
import { useState } from "react";
import { Diagnosis, FieldRecord, PlantHealth } from "@/lib/types";
import { readImage } from "@/lib/storage";
import { Modal, Loading } from "./ui";
import { Save, Upload } from "lucide-react";
export default function ReportForm({
  diagnosis,
  image,
  source,
  onClose,
  onSave,
  notify,
}: {
  diagnosis: Diagnosis | null;
  image: string;
  source: FieldRecord["source"];
  onClose: () => void;
  onSave: (record: FieldRecord) => Promise<void>;
  notify: (s: string, e?: boolean) => void;
}) {
  const [photo, setPhoto] = useState(image);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const data = new FormData(e.currentTarget);
    const str = (name: string) => String(data.get(name) || "").trim();
    const number = (name: string) =>
      str(name) === "" ? null : Number(str(name));
    try {
      await onSave({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        collaborator: str("collaborator"),
        date: str("date"),
        zone: str("zone"),
        fertilizer: str("fertilizer"),
        crop: str("crop"),
        bulbColor: str("bulbColor"),
        leafColor: str("leafColor"),
        leafCount: number("leafCount"),
        diameterCm: number("diameterCm"),
        health: str("health") as PlantHealth,
        confidence: diagnosis?.confidence || 0,
        observations: str("observations").split("\n").filter(Boolean),
        recommendations: diagnosis?.recommendations || [],
        limitations: diagnosis?.limitations || [
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
      onClose={onClose}
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
              defaultValue={new Date().toLocaleDateString("en-CA")}
            />
          </label>
          <label>
            Lote o zona
            <input
              name="zone"
              required
              maxLength={80}
              placeholder="Ej. Lote A"
              list="zones"
            />
            <datalist id="zones">
              <option>Lote A</option>
              <option>Lote B</option>
              <option>Lote C</option>
            </datalist>
          </label>
          <label>
            Fertilizante o abono
            <input
              name="fertilizer"
              required
              maxLength={100}
              placeholder="Ej. Humus de lombriz"
              list="fertilizers"
            />
            <datalist id="fertilizers">
              <option>Humus de lombriz</option>
              <option>Compost orgánico</option>
              <option>NPK 20-20-20</option>
              <option>Sin fertilizante</option>
            </datalist>
          </label>
          <label>
            Cultivo
            <input
              name="crop"
              required
              defaultValue={diagnosis?.crop || "Rábano"}
              maxLength={100}
            />
          </label>
          <label>
            Estado
            <select
              name="health"
              defaultValue={diagnosis?.health || "Indeterminado"}
            >
              <option>Sano</option>
              <option>Enfermo</option>
              <option>Indeterminado</option>
            </select>
          </label>
          <label>
            Color del bulbo
            <input
              name="bulbColor"
              maxLength={100}
              defaultValue={diagnosis?.bulbColor || ""}
              placeholder="No visible, si corresponde"
            />
          </label>
          <label>
            Color de hojas
            <input
              name="leafColor"
              maxLength={100}
              defaultValue={diagnosis?.leafColor || ""}
            />
          </label>
          <label>
            Número de hojas
            <input
              name="leafCount"
              type="number"
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
              maxLength={5000}
              rows={3}
              defaultValue={diagnosis?.observations.join("\n") || ""}
              placeholder="Describe el desarrollo, signos visibles y condiciones de la muestra."
            />
          </label>
        </div>
        <label className="attachment">
          <Upload size={19} />
          <span>
            {photo
              ? "Fotografía adjunta · Cambiar imagen"
              : "Adjuntar fotografía (opcional)"}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              if (e.target.files?.[0])
                try {
                  setPhoto(await readImage(e.target.files[0]));
                } catch (err) {
                  notify((err as Error).message, true);
                }
            }}
          />
        </label>
        {photo && (
          <img
            className="form-photo"
            src={photo}
            alt="Imagen adjunta al reporte"
          />
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
          <button className="button primary" disabled={saving}>
            {saving ? <Loading /> : <Save size={17} />}Guardar registro
          </button>
        </div>
      </form>
    </Modal>
  );
}

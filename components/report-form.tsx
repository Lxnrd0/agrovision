"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type {
  Diagnosis,
  FieldRecord,
  PlantHealth,
} from "@/lib/types";
import { readImage } from "@/lib/storage";
import { daysBetween, plantKey, validateRecord } from "@/lib/tracking";
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

const sectionStyle: CSSProperties = {
  minWidth: 0,
  margin: "0 0 20px",
  padding: "16px",
  border: "1px solid var(--border)",
  borderRadius: "10px",
};

const legendStyle: CSSProperties = {
  padding: "0 8px",
  color: "var(--text)",
  fontSize: "15px",
  fontWeight: 600,
};

const noteStyle: CSSProperties = {
  margin: "0 0 14px",
  color: "var(--muted)",
  fontSize: "13px",
  lineHeight: 1.6,
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
  const [today] = useState(localDate);
  const [photo, setPhoto] = useState(image);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  const [selectedId, setSelectedId] = useState("");
  const [plantId, setPlantId] = useState("");
  const [sowingDate, setSowingDate] = useState("");
  const [zone, setZone] = useState("");
  const [fertilizer, setFertilizer] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] = useState("g/planta");
  const [doseFrequency, setDoseFrequency] = useState("");
  const [observationDate, setObservationDate] = useState(today);
  const [watering, setWatering] = useState("no-registrado");
  const [waterAmount, setWaterAmount] = useState("");
  const [soilMoisture, setSoilMoisture] = useState("no-evaluada");
  const [airTemperature, setAirTemperature] = useState("");

  const busy = saving || loadingPhoto;
  const isExisting = selectedId !== "";
  const calculatedAge = sowingDate && observationDate
    ? daysBetween(sowingDate, observationDate)
    : NaN;
  const validAge = Number.isInteger(calculatedAge) && calculatedAge >= 0
    ? calculatedAge
    : null;

  const plants = useMemo(() => {
    const latest = new Map<string, FieldRecord>();

    const sorted = [...records].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt),
    );

    for (const record of sorted) {
      if (
        record.source !== "demo" &&
        record.plantId?.trim() &&
        record.sowingDate &&
        record.dose?.trim()
      ) {
        latest.set(plantKey(record), record);
      }
    }

    return [...latest.values()].sort((a, b) =>
      (a.plantId ?? "").localeCompare(
        b.plantId ?? "",
        "es",
        { numeric: true },
      ),
    );
  }, [records]);

  const selectedPlant = plants.find(
    (record) => record.id === selectedId,
  );

  const isControl = fertilizer === "Sin fertilizante";

  function selectPlant(id: string) {
    setSelectedId(id);

    const plant = plants.find((record) => record.id === id);

    setPlantId(plant?.plantId ?? "");
    setSowingDate(plant?.sowingDate ?? "");
    setZone(plant?.zone ?? "");
    setFertilizer(plant?.fertilizer ?? "");

    setDoseAmount("");
    setDoseUnit("g/planta");
    setDoseFrequency("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    setFormError("");

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
    const irrigationAmount = waterAmount.trim() === "" ? null : Number(waterAmount);
    const temperature = airTemperature.trim() === "" ? null : Number(airTemperature);

    const estimate = photo === image ? diagnosis : null;

    setSaving(true);

    try {
      if (isExisting && !selectedPlant) {
        throw new Error(
          "Selecciona nuevamente la planta que deseas observar.",
        );
      }

      if (
        !plantId.trim() ||
        !sowingDate ||
        !zone.trim() ||
        !fertilizer.trim()
      ) {
        throw new Error(
          "Completa el identificador, la siembra, el lote y el tratamiento.",
        );
      }

      if (
        observationDate > today ||
        sowingDate > today ||
        observationDate < sowingDate
      ) {
        throw new Error(
          "La observación debe estar entre la fecha de siembra y hoy.",
        );
      }

      if (!text("collaborator")) {
        throw new Error("Escribe el nombre del responsable.");
      }

      let dose: string;

      if (selectedPlant) {
        dose = selectedPlant.dose ?? "";
      } else if (isControl) {
        dose = "0 g/planta; sin aplicación";
      } else {
        const amount = Number(doseAmount);

        if (
          doseAmount.trim() === "" ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          throw new Error(
            "La cantidad de abono debe ser mayor que cero. Para el control, elige Sin fertilizante.",
          );
        }

        if (!doseUnit || !doseFrequency) {
          throw new Error(
            "Selecciona la unidad y la frecuencia de aplicación.",
          );
        }

        dose = `${amount} ${doseUnit}; ${doseFrequency}`;
      }

      if (
        (irrigationAmount !== null &&
          (!Number.isFinite(irrigationAmount) || irrigationAmount <= 0)) ||
        (watering !== "si" && irrigationAmount !== null)
      ) {
        throw new Error(
          "El volumen de riego debe ser positivo y solo se registra si hubo riego.",
        );
      }

      if (
        temperature !== null &&
        (!Number.isFinite(temperature) || temperature < -20 || temperature > 60)
      ) {
        throw new Error("Revisa la temperatura ambiental ingresada (°C).");
      }

      // Por compatibilidad con el historial actual, estas condiciones
      // se guardan como notas, NO como variables numéricas para gráficas.
      const fieldConditions: string[] = [];
      if (watering === "si") {
        fieldConditions.push(
          `Riego realizado${irrigationAmount === null ? " (volumen no medido)" : `: ${irrigationAmount} mL por planta`}`,
        );
      } else if (watering === "no") {
        fieldConditions.push("No se realizó riego en esta observación");
      }
      if (soilMoisture !== "no-evaluada") {
        const moistureLabels: Record<string, string> = {
          seca: "Seca al tacto",
          intermedia: "Intermedia al tacto",
          humeda: "Húmeda al tacto",
        };
        const moistureLabel = moistureLabels[soilMoisture];
        if (moistureLabel) fieldConditions.push(`Humedad aparente del suelo: ${moistureLabel}`);
      }
      if (temperature !== null) {
        fieldConditions.push(`Temperatura ambiental medida: ${temperature} °C`);
      }

      const record: FieldRecord = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),

        plantId: plantId.trim(),
        sowingDate,
        zone: zone.trim(),
        fertilizer: fertilizer.trim(),
        dose,

        collaborator: text("collaborator"),
        date: observationDate,
        crop: "Rabanito",

        bulbColor: text("bulbColor") || "No observado",
        leafColor: text("leafColor") || "No observado",

        heightCm: manualHeight,
        diameterCm: manualDiameter,
        leafCount: manualLeaves,

        measurementSources: {
          heightCm:
            manualHeight === null ? "unknown" : "manual",
          diameterCm:
            manualDiameter === null ? "unknown" : "manual",
          leafCount:
            manualLeaves === null ? "unknown" : "manual",
        },

        estimatedDiameterCm: estimate?.diameterCm ?? null,
        estimatedLeafCount: estimate?.leafCount ?? null,

        health: text("health") as PlantHealth,
        confidence: estimate?.confidence ?? 0,

        observations: [
          ...text("observations")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          ...fieldConditions,
        ],

        aiObservations: estimate?.observations ?? [],
        recommendations: estimate?.recommendations ?? [],

        limitations: estimate?.limitations ?? [
          "Observación de campo sin análisis por IA.",
        ],

        image: photo,

        source:
          source === "demo"
            ? "demo"
            : estimate
              ? source
              : "manual",
      };

      validateRecord(record, records);
      await onSave(record);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo guardar el registro.";

      setFormError(message);
      notify(message, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nueva observación"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="tracking-form" onSubmit={submit}>
        <p style={noteStyle}>
          Selecciona una planta y registra sus medidas.
        </p>

        {source === "demo" && (
          <p style={noteStyle} role="note">
            Registro de ejemplo. No se incluye en las comparaciones reales.
          </p>
        )}

        <fieldset style={sectionStyle} disabled={busy}>
          <legend style={legendStyle}>
            1. Identificación de la planta
          </legend>

          <div className="form-grid">
            <label className="span-2">
              Planta
              <select
                value={selectedId}
                onChange={(event) =>
                  selectPlant(event.target.value)
                }
              >
                <option value="">Registrar una planta nueva</option>
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.plantId} · {plant.zone} ·{" "}
                    {plant.fertilizer} · Siembra {plant.sowingDate}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Identificador de planta *
              <input
                name="plantId"
                required
                maxLength={80}
                value={plantId}
                readOnly={isExisting}
                onChange={(event) => setPlantId(event.target.value)}
                placeholder="Ej. R-001"
              />
              <small>
                Usa el mismo código en cada observación.
              </small>
            </label>

            <label>
              Fecha de siembra *
              <input
                name="sowingDate"
                type="date"
                required
                max={today}
                value={sowingDate}
                readOnly={isExisting}
                onChange={(event) =>
                  setSowingDate(event.target.value)
                }
              />
            </label>

            <label className="span-2">
              Lote o zona *
              <input
                name="zone"
                required
                maxLength={80}
                value={zone}
                readOnly={isExisting}
                onChange={(event) => setZone(event.target.value)}
                placeholder="Ej. Lote A"
              />
            </label>
          </div>
        </fieldset>

        <fieldset style={sectionStyle} disabled={busy}>
          <legend style={legendStyle}>
            2. Tratamiento de la planta
          </legend>

          <p style={noteStyle}>
            {isExisting
              ? "Se conserva el tratamiento registrado para esta planta."
              : "Indica el fertilizante utilizado en el experimento."}
          </p>

          <div className="form-grid">
            <label className="span-2">
              Tratamiento o abono *
              <input
                name="fertilizer"
                required
                maxLength={100}
                value={fertilizer}
                readOnly={isExisting}
                list="tracking-fertilizers"
                onChange={(event) =>
                  setFertilizer(event.target.value)
                }
                placeholder="Selecciona o escribe el abono"
              />
              <datalist id="tracking-fertilizers">
                <option value="Humus de lombriz" />
                <option value="Compost orgánico" />
                <option value="NPK 20-20-20" />
                <option value="Sin fertilizante" />
              </datalist>
            </label>

            {!isExisting && (
              <button
                type="button"
                className="button secondary span-2"
                onClick={() => {
                  setFertilizer("Sin fertilizante");
                  setDoseAmount("");
                  setDoseFrequency("");
                }}
              >
                Seleccionar control sin fertilizante
              </button>
            )}

            {isExisting ? (
              <label className="span-2">
                Dosis registrada
                <input
                  value={selectedPlant?.dose ?? ""}
                  readOnly
                />
              </label>
            ) : isControl ? (
              <p className="span-2" style={noteStyle}>
                Control: 0 g/planta, sin aplicación de abono.
              </p>
            ) : (
              <>
                <label>
                  Cantidad por aplicación *
                  <input
                    name="doseAmount"
                    type="number"
                    required
                    min="0.000001"
                    step="any"
                    value={doseAmount}
                    onChange={(event) =>
                      setDoseAmount(event.target.value)
                    }
                    placeholder="Ej. 10"
                  />
                </label>

                <label>
                  Unidad y base de la dosis *
                  <select
                    name="doseUnit"
                    required
                    value={doseUnit}
                    onChange={(event) =>
                      setDoseUnit(event.target.value)
                    }
                  >
                    <option value="g/planta">g por planta</option>
                    <option value="g/maceta">g por maceta</option>
                    <option value="mL/planta">mL por planta</option>
                    <option value="mL/maceta">mL por maceta</option>
                    <option value="g/L de agua">
                      g por litro de agua
                    </option>
                    <option value="mL/L de agua">
                      mL por litro de agua
                    </option>
                  </select>
                </label>

                <label className="span-2">
                  Frecuencia programada *
                  <select
                    name="doseFrequency"
                    required
                    value={doseFrequency}
                    onChange={(event) =>
                      setDoseFrequency(event.target.value)
                    }
                  >
                    <option value="">Seleccionar frecuencia</option>
                    <option value="una sola aplicación">
                      Una sola aplicación
                    </option>
                    <option value="cada día">Cada día</option>
                    <option value="cada 3 días">Cada 3 días</option>
                    <option value="cada 7 días">Cada 7 días</option>
                    <option value="cada 14 días">Cada 14 días</option>
                  </select>
                </label>
              </>
            )}
          </div>

          <p style={{ ...noteStyle, margin: "14px 0 0" }}>
            La dosis indica el tratamiento previsto. Anota en observaciones
            cuándo apliques fertilizante.
          </p>
        </fieldset>

        <fieldset style={sectionStyle} disabled={busy}>
          <legend style={legendStyle}>
            3. Mediciones de la planta
          </legend>

          <div className="form-grid">
            <label>
              Fecha de observación *
              <input
                name="date"
                type="date"
                required
                min={sowingDate || undefined}
                max={today}
                value={observationDate}
                onChange={(event) =>
                  setObservationDate(event.target.value)
                }
              />
            </label>

            <div className="span-2" role="status" style={noteStyle}>
              Edad de la planta: <strong>
                {validAge === null ? "Selecciona fechas válidas" : `${validAge} días desde la siembra`}
              </strong>
            </div>

            <label>
              Responsable *
              <input
                name="collaborator"
                required
                maxLength={80}
                placeholder="Nombre y apellido"
              />
            </label>

            <label>
              Altura medida (cm)
              <input
                name="heightCm"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 8.5"
              />
              <small>
                Mide desde el suelo hasta el punto más alto, siempre del mismo modo.
              </small>
            </label>

            <label>
              Número de hojas
              <input
                name="leafCount"
                type="number"
                min="0"
                step="1"
                placeholder="Ej. 5"
              />
              <small>
                Cuenta las hojas del mismo modo en cada visita. Si no las contaste, deja vacío.
              </small>
            </label>

            <label className="span-2">
              Diámetro medido del bulbo (cm)
              <input
                name="diameterCm"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Opcional · Ej. 2.4"
              />
              <small>
                Solo si puedes medir el bulbo. Si está enterrado, deja vacío.
              </small>
            </label>
          </div>

          <p style={{ ...noteStyle, margin: "14px 0 0" }}>
            Si no mediste una variable, deja el campo vacío. No pongas cero.
          </p>
        </fieldset>

        <fieldset style={sectionStyle} disabled={busy}>
          <legend style={legendStyle}>
            4. Riego y condiciones (opcional)
          </legend>
          <p style={noteStyle}>
            Registra solo datos observados o medidos. Se guardan como notas,
            no se usan en las gráficas.
          </p>
          <div className="form-grid">
            <label>
              ¿Regaste la planta?
              <select value={watering} onChange={(event) => {
                setWatering(event.target.value);
                if (event.target.value !== "si") setWaterAmount("");
              }}>
                <option value="no-registrado">No registrado</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              Agua aplicada (mL por planta)
              <input
                type="number"
                min="0.01"
                step="any"
                value={waterAmount}
                disabled={watering !== "si"}
                onChange={(event) => setWaterAmount(event.target.value)}
                placeholder="Solo si mediste el volumen"
              />
            </label>
            <label>
              Humedad aparente del suelo
              <select value={soilMoisture} onChange={(event) => setSoilMoisture(event.target.value)}>
                <option value="no-evaluada">No evaluada</option>
                <option value="seca">Seca al tacto</option>
                <option value="intermedia">Intermedia al tacto</option>
                <option value="humeda">Húmeda al tacto</option>
              </select>
            </label>
            <label>
              Temperatura ambiental (°C)
              <input
                type="number"
                min="-20"
                max="60"
                step="0.1"
                value={airTemperature}
                onChange={(event) => setAirTemperature(event.target.value)}
                placeholder="Opcional, medida con termómetro"
              />
            </label>
          </div>
        </fieldset>

        <fieldset style={sectionStyle} disabled={busy}>
          <legend style={legendStyle}>
            5. Estado y fotografía
          </legend>

          <div className="form-grid">
            <label className="span-2">
              Estado observado
              <select name="health" defaultValue="Indeterminado">
                <option value="Indeterminado">
                  Indeterminado / no evaluado
                </option>
                <option value="Sano">Sano</option>
                <option value="Enfermo">Enfermo</option>
              </select>
              <small>
                Si observas síntomas, descríbelos abajo.
              </small>
            </label>

            <label>
              Color de las hojas
              <input
                name="leafColor"
                maxLength={100}
                placeholder="Ej. Verde, amarillento"
              />
            </label>

            <label>
              Color del bulbo
              <input
                name="bulbColor"
                maxLength={100}
                placeholder="Vacío si no es visible"
              />
            </label>

            <label className="span-2">
              Síntomas y observaciones
              <textarea
                name="observations"
                maxLength={5000}
                rows={4}
                placeholder="Ej. Sin síntomas visibles. Se regó hoy. Se observan dos hojas nuevas."
              />
            </label>
          </div>

          <label className="attachment">
            <Upload size={19} />
            <span>
              {loadingPhoto
                ? "Cargando fotografía…"
                : diagnosis
                  ? "Fotografía utilizada en el análisis"
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
              alt="Fotografía de la planta observada"
              style={{
                display: "block",
                width: "100%",
                height: "220px",
                objectFit: "contain",
                margin: "12px 0",
                background: "var(--input)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            />
          )}

          {photo && !diagnosis && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setPhoto("")}
            >
              Quitar fotografía
            </button>
          )}

          <p style={{ ...noteStyle, margin: "14px 0 0" }}>
            Fotografía la misma planta desde una posición similar en cada visita.
          </p>

          {diagnosis && (
            <details style={{ marginTop: "16px" }}>
              <summary
                style={{
                  cursor: "pointer",
                  color: "var(--green-text)",
                }}
              >
                Ver análisis de la fotografía
              </summary>

              <div style={{ marginTop: "12px" }}>
                <p style={noteStyle}>
                  Diámetro estimado:{" "}
                  {diagnosis.diameterCm == null
                    ? "Sin estimar"
                    : `${diagnosis.diameterCm} cm`}
                  . Hojas estimadas:{" "}
                  {diagnosis.leafCount ?? "Sin estimar"}.
                </p>

                <p style={noteStyle}>
                  Estado sugerido por el modelo: {diagnosis.health}.
                  Comprueba el estado de la planta antes de registrarlo.
                </p>

                {diagnosis.observations.length > 0 && (
                  <ul
                    style={{
                      color: "var(--muted)",
                      paddingLeft: "20px",
                      fontSize: "13px",
                    }}
                  >
                    {diagnosis.observations.map((observation, i) => (
                      <li key={i}>{observation}</li>
                    ))}
                  </ul>
                )}

                <p style={noteStyle}>
                  Las estimaciones de IA se guardan aparte y no reemplazan
                  las mediciones manuales. Su confianza no garantiza precisión.
                </p>
              </div>
            </details>
          )}
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
                : "Guardar observación"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useRef, useState } from "react";
import {
  Upload,
  ScanLine,
  ArrowUpRight,
  Sparkles,
  Leaf,
  Ruler,
  CircleDot,
  Layers3,
  Check,
  ImagePlus,
  Info,
} from "lucide-react";

import type { Diagnosis } from "@/lib/types";
import { Badge, Loading } from "./ui";

type AnalysisPanelProps = {
  image: string;
  imageName: string;
  diagnosis: Diagnosis | null;
  source: string;
  requiresToken?: boolean;
  busy: boolean;
  mode: "demo" | "real";
  setMode: (value: "demo" | "real") => void;
  onFile: (file: File) => void;
  onAnalyze: (
    crop: string,
    scale: string,
    accessToken?: string,
  ) => void;
  onDemo: () => void;
  onReport: (confirmedCrop: string) => void;
};

const UNKNOWN_CROP = "Cultivo no identificado";

export default function AnalysisPanel({
  image,
  imageName,
  diagnosis,
  source,
  requiresToken = false,
  busy,
  mode,
  setMode,
  onFile,
  onAnalyze,
  onDemo,
  onReport,
}: AnalysisPanelProps) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [scale, setScale] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [cropMode, setCropMode] = useState<"auto" | "manual">("auto");
  const [manualCrop, setManualCrop] = useState("");
  const [confirmedCrop, setConfirmedCrop] = useState("");
  const proposedCrop = diagnosis?.crop?.trim() || UNKNOWN_CROP;
  const cropForRecord = cropMode === "manual" ? manualCrop.trim() : confirmedCrop.trim();

  return (
    <div className="analysis-grid">
      <section className="panel optical">
        <div className="panel-title">
          <div>
            <span className="eyebrow">FOTOGRAFÍA DEL CULTIVO</span>
            <h2>Análisis de imagen</h2>
          </div>
          <ScanLine size={22} />
        </div>

        <div
          className={`image-stage ${drag ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDrag(false);

            const file = event.dataTransfer.files[0];
            if (!busy && file) onFile(file);
          }}
        >
          {image ? (
            <img
              src={image}
              alt="Fotografía del cultivo"
            />
          ) : (
            <div className="image-empty">
              <ImagePlus size={42} />
              <h3>Carga una fotografía</h3>
              <p>Arrastra aquí una imagen de tu planta.</p>
            </div>
          )}

          <div className="image-shade" />

          <div className="image-top">
            <span className="image-chip">
              <span className="status-dot" />
              {busy
                ? "PROCESANDO IMAGEN"
                : source === "demo"
                  ? "MUESTRA DE EJEMPLO"
                  : "IMAGEN CARGADA"}
            </span>
            <span className="image-chip">{source === "demo" ? "EJEMPLO" : diagnosis ? proposedCrop.toUpperCase() : "CULTIVO POR IDENTIFICAR"}</span>
          </div>

          {busy && <div className="scan-beam" />}

          <div className="scan-frame">
            <i />
            <i />
            <i />
            <i />
          </div>

          <div className="image-bottom">
            <div>
              <span className="eyebrow">
                {source === "demo"
                  ? "RAPHANUS SATIVUS"
                  : "FOTOGRAFÍA DE CAMPO"}
              </span>
              <h3>
                {source === "demo"
                  ? "Imagen de ejemplo"
                  : imageName || "Fotografía cargada"}
              </h3>
            </div>
          </div>
        </div>

        <input
          type="file"
          ref={input}
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          disabled={busy}
          aria-label="Cargar imagen de cultivo"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (!busy && file) onFile(file);

            event.target.value = "";
          }}
        />

        <button
          type="button"
          className="upload-strip"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <span className="upload-icon">
            <Upload size={20} />
          </span>
          <span>
            <strong>Selecciona o arrastra una fotografía</strong>
            <small>JPG, PNG, WEBP o HEIC · Hasta 12 MB</small>
          </span>
          <span className="small-button">Explorar</span>
        </button>

        <div className="analysis-controls">
          <label>
            Identificación de cultivo
            <select disabled={busy} value={cropMode} onChange={(event) => {
              setCropMode(event.target.value as "auto" | "manual");
              setConfirmedCrop("");
            }}>
              <option value="auto">Detectar automáticamente con IA</option>
              <option value="manual">Indicar cultivo manualmente</option>
            </select>
          </label>

          <label>
            Tipo de análisis
            <select
              value={mode}
              disabled={busy}
              onChange={(event) =>
                setMode(event.target.value as "demo" | "real")
              }
            >
              <option value="demo">Demostración</option>
              <option value="real">Gemini (IA)</option>
            </select>
          </label>
        </div>

        {cropMode === "manual" && (
          <label className="scale-input">
            Cultivo declarado
            <input disabled={busy} value={manualCrop} maxLength={100}
              onChange={(event) => setManualCrop(event.target.value)}
              placeholder="Ej. tomate, lechuga, rabanito" />
          </label>
        )}

        {mode === "real" && (
          <label className="scale-input">
            Referencia visible (opcional)
            <input
              value={scale}
              disabled={busy}
              onChange={(event) => setScale(event.target.value)}
              maxLength={250}
              placeholder="Ej. regla de 10 cm junto al bulbo"
            />
          </label>
        )}

        {mode === "real" && requiresToken && (
          <label className="scale-input">
            Código de acceso al análisis
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              disabled={busy}
              onChange={(event) =>
                setAccessToken(event.target.value)
              }
              placeholder="Código configurado por el responsable del sitio"
            />
          </label>
        )}

        <div className="analyze-footer">
          <span>
            <Info size={14} />
            {mode === "demo"
              ? "La demostración utiliza datos simulados."
              : "Se analizará la fotografía que cargaste."}
          </span>

          <button
            type="button"
            className="button primary"
            disabled={busy || !image || (mode === "real" && cropMode === "manual" && !manualCrop.trim())}
            onClick={() =>
              mode === "demo"
                ? onDemo()
                : onAnalyze(cropMode === "auto" ? "" : manualCrop.trim(), scale, accessToken)
            }
          >
            {busy ? <Loading /> : <Sparkles size={17} />}
            {" "}
            {busy
              ? "Analizando…"
              : mode === "demo"
                ? "Probar análisis"
                : "Analizar cultivo"}
          </button>
        </div>
      </section>

      <section className="panel diagnosis">
        <div className="panel-title">
          <div>
            <span className="eyebrow">RESULTADOS DEL ANÁLISIS</span>
            <h2>Diagnóstico visual</h2>
          </div>
          <span className="tiny-icon">
            <Sparkles size={18} />
          </span>
        </div>

        {diagnosis ? (
          <>
            {source !== "demo" && (
              <div style={{ margin: "0 20px 18px", padding: 14, border: "1px solid var(--border)", borderRadius: 8 }}>
                <label style={{ display: "grid", gap: 8 }}>
                  Cultivo identificado por la IA (confirma o corrige antes de registrar)
                  <input maxLength={100} value={cropMode === "manual" ? manualCrop : confirmedCrop}
                    onChange={(event) => cropMode === "manual" ? setManualCrop(event.target.value) : setConfirmedCrop(event.target.value)}
                    placeholder={proposedCrop === UNKNOWN_CROP ? "Escribe el cultivo confirmado" : proposedCrop} />
                </label>
                <button className="button secondary" type="button" style={{ marginTop: 10 }}
                  onClick={() => cropMode === "manual" ? setManualCrop(proposedCrop === UNKNOWN_CROP ? "" : proposedCrop) : setConfirmedCrop(proposedCrop === UNKNOWN_CROP ? "" : proposedCrop)}>
                  Usar identificación sugerida: {proposedCrop}
                </button>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
                  La IA puede equivocarse. Comprueba la planta antes de registrar el cultivo.
                </p>
              </div>
            )}
            <div className="health-card">
              <div className="health-ring">
                <Leaf size={26} />
              </div>

              <div>
                <span>Estado de la planta</span>
                <h3>
                  {diagnosis.health === "Sano"
                    ? "Aspecto saludable"
                    : diagnosis.health === "Enfermo"
                      ? "Requiere revisión"
                      : "Sin determinar"}
                </h3>

                <Badge
                  tone={
                    diagnosis.health === "Sano"
                      ? "green"
                      : "orange"
                  }
                >
                  {source === "demo"
                    ? "Resultado de ejemplo"
                    : diagnosis.health}
                </Badge>
              </div>

              <span className="health-check">
                {diagnosis.health === "Sano" ? (
                  <Check size={15} />
                ) : (
                  <Info size={15} />
                )}
              </span>
            </div>

            <div className="confidence">
              <div>
                <span>Confianza indicada por la IA</span>
                <strong>
                  {diagnosis.confidence}
                  <small>%</small>
                </strong>
              </div>

              <div className="meter">
                <i
                  style={{
                    width: `${diagnosis.confidence}%`,
                  }}
                />
              </div>

              <small>
                {source === "demo"
                  ? "Valor simulado"
                  : "Autoestimación no calibrada"}
              </small>
            </div>

            <div className="diagnostic-metrics">
              {[
                [CircleDot, "Color del bulbo", diagnosis.bulbColor],
                [Leaf, "Color de hojas", diagnosis.leafColor],
                [
                  Layers3,
                  "Hojas visibles",
                  diagnosis.leafCount === null
                    ? "No estimable"
                    : `${diagnosis.leafCount} hojas`,
                ],
                [
                  Ruler,
                  "Diámetro aproximado",
                  diagnosis.diameterCm === null
                    ? "Sin escala"
                    : `${diagnosis.diameterCm} cm`,
                ],
              ].map(([Icon, label, measure]) => {
                const MetricIcon = Icon as typeof Leaf;

                return (
                  <div key={String(label)}>
                    <MetricIcon size={17} />
                    <span>{String(label)}</span>
                    <strong>{String(measure)}</strong>
                  </div>
                );
              })}
            </div>

            <div className="observations">
              <h3>Observaciones del análisis</h3>

              {diagnosis.observations.map((observation, index) => (
                <p key={index}>
                  <span>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {observation}
                </p>
              ))}
            </div>

            <details className="limitations">
              <summary>
                Recomendaciones y limitaciones
              </summary>

              {[
                ...diagnosis.recommendations,
                ...diagnosis.limitations,
              ].map((text, index) => (
                <p key={index}>{text}</p>
              ))}
            </details>

            <button
              type="button"
              className="button report-button"
              disabled={busy || (source !== "demo" && (!cropForRecord || cropForRecord === UNKNOWN_CROP))}
              onClick={() => onReport(source === "demo" ? "Rabanito" : cropForRecord)}
            >
              Registrar diagnóstico
              <ArrowUpRight size={18} />
            </button>
          </>
        ) : (
          <div className="no-diagnosis">
            <ScanLine size={42} />
            <h3>
              {busy
                ? "Analizando imagen…"
                : "Sin análisis realizado"}
            </h3>
            <p>
              {busy
                ? "Revisando características visibles."
                : "Carga una fotografía y selecciona el tipo de análisis."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

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
  onReport: () => void;
};

const CROP = "Rabanito";

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

  return (
    <div className="analysis-grid">
      <section className="panel optical">
        <div className="panel-title">
          <div>
            <span className="eyebrow">ENTRADA ÓPTICA</span>
            <h2>Una imagen. Más información.</h2>
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
              alt="Fotografía de la muestra de rabanito"
            />
          ) : (
            <div className="image-empty">
              <ImagePlus size={42} />
              <h3>Tu próxima observación empieza aquí</h3>
              <p>Arrastra una fotografía del rabanito.</p>
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
            <span className="image-chip">VISIÓN / 01</span>
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
                  ? "Una mirada más cerca."
                  : imageName || "Nueva muestra"}
              </h3>
            </div>
          </div>
        </div>

        <input
          type="file"
          ref={input}
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={busy}
          aria-label="Cargar imagen de rabanito"
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
            <strong>Sube o arrastra tu fotografía</strong>
            <small>JPG, PNG o WEBP · Hasta 8 MB</small>
          </span>
          <span className="small-button">Explorar</span>
        </button>

        <div className="analysis-controls">
          <label>
            Cultivo
            <input
              type="text"
              value={CROP}
              readOnly
              aria-readonly="true"
            />
          </label>

          <label>
            Motor de análisis
            <select
              value={mode}
              disabled={busy}
              onChange={(event) =>
                setMode(event.target.value as "demo" | "real")
              }
            >
              <option value="demo">Demostración</option>
              <option value="real">Gemini · Visión IA</option>
            </select>
          </label>
        </div>

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
              : "La foto se analizará con el motor configurado en el servidor."}
          </span>

          <button
            type="button"
            className="button primary"
            disabled={busy || !image}
            onClick={() =>
              mode === "demo"
                ? onDemo()
                : onAnalyze(CROP, scale, accessToken)
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
            <span className="eyebrow">INTELIGENCIA APLICADA</span>
            <h2>Diagnóstico visual</h2>
          </div>
          <span className="tiny-icon">
            <Sparkles size={18} />
          </span>
        </div>

        {diagnosis ? (
          <>
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
                <span>Confianza estimada de la IA</span>
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
              <h3>Observaciones técnicas</h3>

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
                Recomendaciones y límites del análisis
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
              disabled={busy}
              onClick={onReport}
            >
              Usar diagnóstico en un reporte
              <ArrowUpRight size={18} />
            </button>
          </>
        ) : (
          <div className="no-diagnosis">
            <ScanLine size={42} />
            <h3>
              {busy
                ? "Observando tu cultivo…"
                : "Todo listo para analizar"}
            </h3>
            <p>
              {busy
                ? "Identificando características visibles."
                : "Carga una imagen y selecciona el motor para obtener tus observaciones."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

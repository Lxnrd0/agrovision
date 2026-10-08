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
import { Diagnosis } from "@/lib/types";
import { Badge, Loading } from "./ui";
export default function AnalysisPanel({
  image,
  imageName,
  diagnosis,
  source,
  busy,
  mode,
  setMode,
  onFile,
  onAnalyze,
  onDemo,
  onReport,
}: {
  image: string;
  imageName: string;
  diagnosis: Diagnosis | null;
  source: string;
  busy: boolean;
  mode: "demo" | "real";
  setMode: (v: "demo" | "real") => void;
  onFile: (f: File) => void;
  onAnalyze: (crop: string, scale: string) => void;
  onDemo: () => void;
  onReport: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [crop, setCrop] = useState("Rábano");
  const [scale, setScale] = useState("");
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
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            if (!busy && e.dataTransfer.files[0])
              onFile(e.dataTransfer.files[0]);
          }}
        >
          {image ? (
            <img src={image} alt="Fotografía de la muestra de cultivo" />
          ) : (
            <div className="image-empty">
              <ImagePlus size={42} />
              <h3>Tu próxima observación empieza aquí</h3>
              <p>Arrastra una fotografía del cultivo.</p>
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
                {source === "demo" ? "RAPHANUS SATIVUS" : "FOTOGRAFÍA DE CAMPO"}
              </span>
              <h3>
                {source === "demo"
                  ? "Una mirada más cerca."
                  : imageName || "Nueva muestra"}
              </h3>
            </div>
            <button
              className="image-change"
              onClick={() => input.current?.click()}
              disabled={busy}
              aria-label="Cambiar fotografía"
            >
              <ImagePlus size={20} />
            </button>
          </div>
        </div>
        <input
          type="file"
          ref={input}
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Cargar imagen de cultivo"
          onChange={(e) => {
            if (e.target.files?.[0]) onFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <button
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
            <select value={crop} onChange={(e) => setCrop(e.target.value)}>
              <option>Rábano</option>
              <option>Lechuga</option>
              <option>Zanahoria</option>
              <option>Otra hortaliza</option>
            </select>
          </label>
          <label>
            Motor de análisis
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as "demo" | "real")}
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
              onChange={(e) => setScale(e.target.value)}
              maxLength={250}
              placeholder="Ej. regla de 10 cm junto al bulbo"
            />
          </label>
        )}
        <div className="analyze-footer">
          <span>
            <Info size={14} />
            {mode === "demo"
              ? "La demostración utiliza datos simulados."
              : "La foto se analizará en el servidor con Gemini."}
          </span>
          <button
            className="button primary"
            disabled={busy || !image}
            onClick={() =>
              mode === "demo" ? onDemo() : onAnalyze(crop, scale)
            }
          >
            {busy ? <Loading /> : <Sparkles size={17} />}{" "}
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
                <Badge tone={diagnosis.health === "Sano" ? "green" : "orange"}>
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
                <i style={{ width: `${diagnosis.confidence}%` }} />
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
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof Leaf;
                return (
                  <div key={String(label)}>
                    <I size={17} />
                    <span>{String(label)}</span>
                    <strong>{String(value)}</strong>
                  </div>
                );
              })}
            </div>
            <div className="observations">
              <h3>Observaciones técnicas</h3>
              {diagnosis.observations.map((v, i) => (
                <p key={i}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {v}
                </p>
              ))}
            </div>
            <details className="limitations">
              <summary>Recomendaciones y límites del análisis</summary>
              {[...diagnosis.recommendations, ...diagnosis.limitations].map(
                (v, i) => (
                  <p key={i}>{v}</p>
                ),
              )}
            </details>
            <button
              className="button report-button"
              disabled={busy}
              onClick={onReport}
            >
              Usar diagnóstico en un reporte <ArrowUpRight size={18} />
            </button>
          </>
        ) : (
          <div className="no-diagnosis">
            <ScanLine size={42} />
            <h3>
              {busy ? "Observando tu cultivo…" : "Todo listo para analizar"}
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

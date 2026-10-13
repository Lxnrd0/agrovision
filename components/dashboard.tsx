"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Cloud,
  FlaskConical,
  Grid2X2,
  Leaf,
  Menu,
  Moon,
  Plus,
  Ruler,
  ScanLine,
  ShieldCheck,
  Sprout,
  Sun,
  WifiOff,
  FileText,
  FileSpreadsheet,
  HardDrive,
  CircleHelp,
} from "lucide-react";

import { demoDiagnosis, demoRecords } from "@/lib/demo";
import type { Diagnosis, FieldRecord, View } from "@/lib/types";
import {
  readImage,
  readRecords,
  writeRecords,
  mutateRecords,
} from "@/lib/storage";
import { summary } from "@/lib/metrics";
import { exportSimpleCsv, exportPdf } from "@/lib/exports";
import { validateRecord } from "@/lib/tracking";

import AnalysisPanel from "./analysis-panel";
import History from "./history";
import Comparison from "./comparison";
import Protocols from "./protocols";
import ReportForm from "./report-form";
import EditObservation from "./edit-observation";
import BackupControls from "./backup-controls";
import { Badge, Modal, Toast } from "./ui";

const sections: {
  id: View;
  label: string;
  icon: typeof ScanLine;
  short: string;
}[] = [
  {
    id: "analysis",
    label: "Análisis de cultivo",
    icon: ScanLine,
    short: "Análisis visual",
  },
  {
    id: "history",
    label: "Bitácora de campo",
    icon: BookOpen,
    short: "Bitácora de campo",
  },
  {
    id: "comparison",
    label: "Comparativa",
    icon: BarChart3,
    short: "Comparativa",
  },
  {
    id: "protocols",
    label: "Buenas prácticas",
    icon: Sprout,
    short: "Protocolos",
  },
];

function currentTime() {
  return new Date().toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const [view, setView] = useState<View>("analysis");
  const [records, setRecords] = useState<FieldRecord[]>([]);
  const [ready, setReady] = useState(false);

  const [image, setImage] = useState("/radish-sample.jpg");
  const [imageName, setImageName] = useState("Muestra de rabanito");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [source, setSource] = useState<FieldRecord["source"]>("demo");
  const [mode, setMode] = useState<"demo" | "real">("real");

  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState("");

  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);

  const [form, setForm] = useState<"new" | "diagnosis" | null>(null);
  const [editing, setEditing] = useState<FieldRecord | null>(null);
  const [remove, setRemove] = useState<FieldRecord | null>(null);

  const [dark, setDark] = useState(true);
  const [menu, setMenu] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [requiresToken, setRequiresToken] = useState(false);

  const channel = useRef<BroadcastChannel | null>(null);
  const abort = useRef<AbortController | null>(null);
  const version = useRef(0);
  const mounted = useRef(true);

  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
  }, []);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  const refreshEngine = useCallback(async () => {
    try {
      const response = await fetch("/api/analyze-crop", {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setConfigured(Boolean(data.configured));
        setRequiresToken(Boolean(data.requiresToken));
      } else {
        setConfigured(false);
      }
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    readRecords()
      .then(async (saved) => {
        const initial = saved === undefined ? demoRecords : saved;

        if (saved === undefined) {
          await writeRecords(initial);
        }

        if (mounted.current) {
          setRecords(initial);
          setReady(true);
          setLastSync(currentTime());
        }
      })
      .catch(() => {
        if (!mounted.current) return;

        setReady(false);
        notify(
          "No se pudo abrir el almacenamiento local. Revisa los permisos del navegador.",
          true,
        );
      });

    try {
      if (localStorage.getItem("agrovision-theme") === "light") {
        setDark(false);
      }
    } catch {}

    setOnline(navigator.onLine);

    const updateConnection = () => {
      setOnline(navigator.onLine);

      if (navigator.onLine) {
        void refreshEngine();
      }
    };

    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("agrovision-records");

      channel.current.onmessage = () => {
        readRecords()
          .then((saved) => {
            if (mounted.current && saved) {
              setRecords(saved);
              setLastSync(currentTime());
            }
          })
          .catch(() => {});
      };
    }

    void refreshEngine();

    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      mounted.current = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      channel.current?.close();
      abort.current?.abort();
    };
  }, [notify, refreshEngine]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);

    try {
      localStorage.setItem("agrovision-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);

  async function save(record: FieldRecord) {
    const next = await mutateRecords((rows) => {
      validateRecord(record, rows);
      return [record, ...rows];
    });

    setRecords(next);
    setLastSync(currentTime());
    channel.current?.postMessage("changed");
    setView("history");
    notify("Observación guardada en tu bitácora.");
  }

  async function saveEdit(record: FieldRecord) {
    const next = await mutateRecords((rows) => {
      if (!rows.some((item) => item.id === record.id)) {
        throw new Error(
          "La observación ya no existe. Actualiza la bitácora.",
        );
      }

      validateRecord(record, rows);

      return rows.map((item) =>
        item.id === record.id ? record : item,
      );
    });

    setRecords(next);
    setLastSync(currentTime());
    channel.current?.postMessage("changed");
    setView("history");
    notify(
      "Observación corregida. La gráfica y las tablas se actualizaron.",
    );
  }

  async function deleteRecord() {
    if (!remove) return;

    try {
      const next = await mutateRecords((rows) =>
        rows.filter((record) => record.id !== remove.id),
      );

      setRecords(next);
      setLastSync(currentTime());
      channel.current?.postMessage("changed");
      setRemove(null);
      notify("Observación eliminada. La comparativa se actualizó.");
    } catch {
      notify("No se pudo eliminar la observación.", true);
    }
  }

  async function upload(file: File) {
    try {
      const currentVersion = ++version.current;
      const result = await readImage(file);

      if (currentVersion !== version.current || !mounted.current) {
        return;
      }

      setImage(result);
      setImageName(file.name);
      setDiagnosis(null);
      setSource("manual");
      notify("Fotografía lista para analizar.");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la fotografía.",
        true,
      );
    }
  }

  async function demo() {
    if (busy) return;

    setBusy(true);
    setDiagnosis(null);

    await new Promise((resolve) => setTimeout(resolve, 1700));

    if (mounted.current) {
      setDiagnosis(demoDiagnosis);
      setSource("demo");
      setBusy(false);
      notify("Demostración completada: resultados simulados.");
    }
  }

  async function analyze(
    crop: string,
    scaleReference: string,
    accessToken = "",
  ) {
    if (busy) return;

    if (!online) {
      notify(
        "El análisis real requiere conexión. Puedes seguir registrando observaciones.",
        true,
      );
      return;
    }

    if (image === "/radish-sample.jpg") {
      notify(
        "Carga una fotografía de tu propia planta antes del análisis real.",
        true,
      );
      return;
    }

    setBusy(true);
    setDiagnosis(null);

    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 65000);

    try {
      let dataImage = image;

      if (!image.startsWith("data:")) {
        const response = await fetch(image, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            "No se pudo cargar la imagen para el análisis.",
          );
        }

        const blob = await response.blob();

        dataImage = await readImage(
          new File([blob], "crop.jpg", { type: blob.type }),
        );
      }

      const response = await fetch("/api/analyze-crop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify({
          image: dataImage,
          crop,
          scaleReference,
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo analizar la imagen.",
        );
      }

      if (mounted.current) {
        setDiagnosis(data.diagnosis);
        setSource(data.source === "gemini" ? "gemini" : "openai");
        notify("Análisis completado. Revisa las observaciones.");
      }
    } catch (error) {
      if (mounted.current) {
        notify(
          error instanceof Error && error.name === "AbortError"
            ? "Se agotó el tiempo de espera. Inténtalo de nuevo."
            : error instanceof Error
              ? error.message
              : "No se pudo analizar la imagen.",
          true,
        );
      }
    } finally {
      clearTimeout(timer);

      if (mounted.current) {
        setBusy(false);
      }
    }
  }

  async function download(format: "csv" | "pdf") {
    setExportOpen(false);

    try {
      if (!records.length) {
        notify("Añade una observación antes de exportar.", true);
        return;
      }

      if (format === "csv") {
        exportSimpleCsv(records);
      } else {
        await exportPdf(records);
      }

      notify(
        `Archivo ${format.toUpperCase()} generado con ${records.length} registros.`,
      );
    } catch {
      notify("No se pudo generar el archivo.", true);
    }
  }

  const stats = summary(records);

  const choose = (id: View) => {
    setView(id);
    setMenu(false);
  };

  return (
    <div className="app-shell">
      {menu && (
        <button
          type="button"
          className="mobile-shade"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}

      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            choose("analysis");
          }}
        >
          <span className="brand-mark">
            <Sprout size={26} />
          </span>
          <span>
            agro<span>vision</span>
            <small>SEGUIMIENTO DEL CULTIVO</small>
          </span>
        </a>

        <div className="workspace-chip">
          <span className="workspace-icon">
            <Leaf size={19} />
          </span>
          <div>
            <strong>Mi monitoreo</strong>
            <small>Monitoreo de rabanito</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <span className="nav-label">ESPACIO DE TRABAJO</span>

        <nav aria-label="Navegación principal">
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={view === section.id ? "active" : ""}
              onClick={() => choose(section.id)}
              aria-current={view === section.id ? "page" : undefined}
            >
              <section.icon size={19} />
              <span>{section.label}</span>

              {section.id === "history" ? (
                <span className="nav-count">{records.length}</span>
              ) : view === section.id ? (
                <span className="nav-active-dot" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <HardDrive size={19} />
            </span>
            <strong>Almacenamiento local</strong>
            <p>Tus registros se guardan en este navegador.</p>
            <div>
              <span className="status-dot" />
              Almacenamiento local
            </div>
          </div>

          <button
            type="button"
            className="sidebar-link"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
            Guía de uso
            <ArrowUpRight size={14} />
          </button>

          <div className="sidebar-footer">
            <span className="workspace-icon">
              <Sprout size={18} />
            </span>
            <div>
              <strong>Proyecto de rabanito</strong>
              <small>Cultivo de rabanito</small>
            </div>
            <span className="version">v1.1</span>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <Grid2X2 size={16} />
            <span>Espacio de trabajo</span>
            <ChevronRight size={14} />
            <strong>
              {sections.find((section) => section.id === view)?.label}
            </strong>
          </div>

          <div className="topbar-right">
            <span className={`engine-status ${busy ? "working" : ""}`}>
              <span className="status-dot" />
              {!online
                ? "Sin conexión"
                : busy
                  ? "Motor de visión activo"
                  : configured
                    ? "Motor de visión listo"
                    : "Motor de IA sin configurar"}
            </span>

            <span className="topbar-divider" />

            <button
              type="button"
              className="icon-button"
              title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
              aria-label={
                dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
              }
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            <span className="profile-avatar">AG</span>
          </div>
        </header>

        <main>
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                <span className="mini-line" />
                {" "}REGISTRO Y SEGUIMIENTO DEL CULTIVO
              </div>
              <h1>
                Monitoreo de rabanito<span>.</span>
              </h1>
              <p>
                Registra y consulta las observaciones de tu planta.
              </p>
            </div>

            <div className="heading-actions">
              <div className="export-wrap">
                <button
                  type="button"
                  className="button secondary"
                  aria-expanded={exportOpen}
                  onClick={() => setExportOpen(!exportOpen)}
                >
                  <ArrowDownToLine size={17} />
                  Exportar
                  <ChevronDown size={14} />
                </button>

                {exportOpen && (
                  <div className="export-menu">
                    <button
                      type="button"
                      onClick={() => void download("csv")}
                    >
                      <FileSpreadsheet size={17} />
                      Monitoreo en CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => void download("pdf")}
                    >
                      <FileText size={17} />
                      Reporte en PDF
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="button primary"
                disabled={!ready}
                onClick={() => setForm("new")}
              >
                <Plus size={18} />
                Nueva observación
              </button>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-top">
                <span>Observaciones registradas</span>
                <span className="stat-icon">
                  <ScanLine size={19} />
                </span>
              </div>
              <div className="stat-value">
                {String(stats.count).padStart(2, "0")}
                <span className="stat-pill">BITÁCORA</span>
              </div>
              <p>Registros guardados</p>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Observaciones sanas</span>
                <span className="stat-icon">
                  <ShieldCheck size={19} />
                </span>
              </div>
              <div className="stat-value">
                {stats.assessed ? stats.health.toFixed(1) : "—"}
                <small>%</small>
                <span className="stat-spark">
                  <Activity size={45} strokeWidth={1.4} />
                </span>
              </div>
              <p>
                {stats.assessed} observaciones con estado registrado
              </p>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Diámetro promedio medido</span>
                <span className="stat-icon">
                  <Ruler size={19} />
                </span>
              </div>
              <div className="stat-value">
                {stats.measured ? stats.diameter.toFixed(1) : "—"}
                <small>cm</small>
              </div>
              <p>
                {stats.measured} observaciones con diámetro medido
              </p>
            </div>

            <div className="stat-card">
              <div className="stat-top">
                <span>Lotes en seguimiento</span>
                <span className="stat-icon">
                  <FlaskConical size={19} />
                </span>
              </div>
              <div className="stat-value">
                {String(stats.zones).padStart(2, "0")}
                <span className="lot-markers">
                  {["A", "B", "C"]
                    .slice(0, Math.min(stats.zones, 3))
                    .map((label) => (
                      <i key={label}>{label}</i>
                    ))}
                </span>
              </div>
              <p>Lotes registrados</p>
            </div>
          </div>

          {ready && (
            <BackupControls
              records={records}
              notify={notify}
              onRestored={(next) => {
                setRecords(next);
                setLastSync(currentTime());
                channel.current?.postMessage("changed");
                setView("history");
              }}
            />
          )}

          <div className="view-bar">
            <div
              className="view-tabs"
              role="tablist"
              aria-label="Módulos de monitoreo"
            >
              {sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  role="tab"
                  id={`tab-${section.id}`}
                  aria-selected={view === section.id}
                  aria-controls="module-panel"
                  className={view === section.id ? "active" : ""}
                  onClick={() => setView(section.id)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "ArrowRight" ||
                      event.key === "ArrowLeft"
                    ) {
                      event.preventDefault();

                      const index = sections.findIndex(
                        (item) => item.id === section.id,
                      );
                      const direction =
                        event.key === "ArrowRight" ? 1 : -1;
                      const next =
                        sections[
                          (index + direction + sections.length) %
                            sections.length
                        ];

                      setView(next.id);
                      document.getElementById(`tab-${next.id}`)?.focus();
                    }
                  }}
                >
                  <section.icon size={17} />
                  {section.short}
                </button>
              ))}
            </div>

            <span className="sync-label">
              {online ? <Cloud size={15} /> : <WifiOff size={15} />}
              {" "}
              {lastSync
                ? `Guardado local · ${lastSync}`
                : "Preparando bitácora"}
            </span>
          </div>

          <div
            id="module-panel"
            role="tabpanel"
            aria-labelledby={`tab-${view}`}
          >
            {view === "analysis" ? (
              <AnalysisPanel
                image={image}
                imageName={imageName}
                diagnosis={diagnosis}
                source={source}
                busy={busy}
                requiresToken={requiresToken}
                mode={mode}
                setMode={setMode}
                onFile={upload}
                onAnalyze={analyze}
                onDemo={demo}
                onReport={() => setForm("diagnosis")}
              />
            ) : view === "history" ? (
              <History
                records={records}
                onDelete={setRemove}
                onEdit={setEditing}
                onNew={() => setForm("new")}
              />
            ) : view === "comparison" ? (
              <Comparison records={records} />
            ) : (
              <Protocols />
            )}
          </div>

          {view === "analysis" && (
            <section className="recent-section">
              <div className="recent-heading">
                <div>
                  <h2>Observaciones recientes</h2>
                  <p>Últimos registros</p>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setView("history")}
                >
                  Ver bitácora
                  <ArrowRight size={16} />
                </button>
              </div>

              <div className="recent-grid">
                {records.slice(0, 3).map((record) => (
                  <button
                    type="button"
                    className="recent-card"
                    key={record.id}
                    onClick={() => setView("history")}
                  >
                    {record.image ? (
                      <img src={record.image} alt="" />
                    ) : (
                      <div className="recent-placeholder">
                        <Leaf size={24} />
                      </div>
                    )}
                    <div>
                      <strong>
                        {record.plantId || record.zone}
                        {" "}
                        <span>· {record.crop.split(" · ")[0]}</span>
                      </strong>
                      <p>
                        {record.fertilizer}
                        {record.dose ? ` · ${record.dose}` : ""}
                      </p>
                      <small>
                        {record.date}
                        {record.source === "demo" ? " · Ejemplo" : ""}
                      </small>
                    </div>
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
                  </button>
                ))}

                {!records.length && (
                  <p className="muted">
                    No hay observaciones registradas.
                  </p>
                )}
              </div>
            </section>
          )}

          <footer className="main-footer">
            <span>
              <Sprout size={14} />
              {" "}Seguimiento del cultivo de rabanito
            </span>
            <span>
              {records.some((record) => record.source === "demo")
                ? "Incluye datos de demostración · Guardado en este navegador"
                : "Datos guardados en este navegador"}
            </span>
          </footer>
        </main>
      </div>

      {form && (
        <ReportForm
          records={records}
          diagnosis={form === "diagnosis" ? diagnosis : null}
          image={form === "diagnosis" ? image : ""}
          source={form === "diagnosis" ? source : "manual"}
          onClose={() => setForm(null)}
          onSave={save}
          notify={notify}
        />
      )}

      {editing && (
        <EditObservation
          key={editing.id}
          record={editing}
          records={records}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          notify={notify}
        />
      )}

      {remove && (
        <Modal
          title="¿Eliminar esta observación?"
          onClose={() => setRemove(null)}
        >
          <p className="modal-subtitle">
            Se eliminará la observación de{" "}
            {remove.plantId || remove.zone} del {remove.date}.
            También se actualizarán la gráfica y las tablas.
          </p>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setRemove(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button destructive"
              onClick={() => void deleteRecord()}
            >
              Eliminar observación
            </button>
          </div>
        </Modal>
      )}

      {help && (
        <Modal
          title="Guía de uso"
          onClose={() => setHelp(false)}
        >
          <ol className="protocol-steps">
            {[
              "Etiqueta cada planta y registra su lote, fecha de siembra, tratamiento y dosis.",
              "Carga una foto nítida con luz uniforme. Incluye una regla si necesitas estimar el diámetro.",
              "Revisa las observaciones de la IA. Introduce las medidas verificadas manualmente.",
              "En cada visita, elige la misma planta y registra sus medidas, síntomas y fotografía.",
              "Revisa la gráfica de crecimiento y compara tratamientos con edades semejantes.",
              "Usa Editar observación para corregir fechas, medidas y notas sin duplicar el registro.",
              "Exporta la bitácora a CSV o PDF. Las fotografías no se incluyen en estas exportaciones.",
              "Guarda periódicamente un respaldo JSON para conservar tus fotografías y observaciones. Al restaurarlo, los registros existentes mantienen su versión actual.",
            ].map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>

          <p className="detail-copy">
            La confianza de la IA no equivale a precisión comprobada.
            Contrasta las estimaciones con mediciones manuales
            y revisa los cambios en campo.
          </p>
        </Modal>
      )}

      {toast && <Toast {...toast} onClose={closeToast} />}
    </div>
  );
}

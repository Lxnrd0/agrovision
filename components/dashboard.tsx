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
  PanelLeftClose,
  PanelLeftOpen,
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
import {
  isCloudConfigured,
  migrateLocalRecordsToCloud,
  mergeBackupIntoCloud,
  mutateCloudRecords,
  readCloudRecords,
} from "@/lib/cloud";

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

function getClientId() {
  try {
    const key = "agrovision-client-id";
    const existing = localStorage.getItem(key);

    if (existing) return existing;

    const created =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(key, created);
    return created;
  } catch {
    return "";
  }
}

type DashboardProps = {
  userEmail?: string;
  onLogout?: () => void;
};

export default function Dashboard({ userEmail, onLogout }: DashboardProps) {
  const cloudMode = isCloudConfigured();
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

    async function initialiseStorage() {
      try {
        let initial: FieldRecord[];
        if (cloudMode) {
          // Importa observaciones reales de este navegador una sola vez por ID,
          // y excluye los registros demostrativos del proyecto original.
          initial = await migrateLocalRecordsToCloud();
        } else {
          const saved = await readRecords();
          initial = saved === undefined ? demoRecords : saved;
          if (saved === undefined) await writeRecords(initial);
        }

        if (mounted.current) {
          setRecords(initial);
          setReady(true);
          setLastSync(currentTime());
        }
      } catch (error) {
        if (!mounted.current) return;
        setReady(false);
        notify(
          error instanceof Error
            ? `No se pudo cargar la bitácora: ${error.message}`
            : cloudMode
              ? "No se pudo conectar con la bitácora en la nube. Revisa tu conexión e inicia sesión nuevamente."
              : "No se pudo abrir el almacenamiento local. Revisa los permisos del navegador.",
          true,
        );
      }
    }

    void initialiseStorage();

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
        if (cloudMode) {
          void readCloudRecords().then((saved) => {
            if (mounted.current) {
              setRecords(saved);
              setLastSync(currentTime());
            }
          }).catch(() => {});
        }
      }
    };

    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if (!cloudMode && "BroadcastChannel" in window) {
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

    // Polling ligero para que las modificaciones de los otros integrantes
    // aparezcan también en dispositivos distintos sin tener que recargar.
    let cloudPoll: number | undefined;
    if (cloudMode) {
      cloudPoll = window.setInterval(() => {
        if (!navigator.onLine || document.visibilityState === "hidden") return;
        void readCloudRecords()
          .then((saved) => {
            if (mounted.current) {
              setRecords(saved);
              setLastSync(currentTime());
            }
          })
          .catch(() => {
            // Evita interrumpir el uso si una comprobación periódica falla.
          });
      }, 12000);
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
      if (cloudPoll !== undefined) window.clearInterval(cloudPoll);
      abort.current?.abort();
    };
  }, [cloudMode, notify, refreshEngine]);

  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);

    try {
      localStorage.setItem("agrovision-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);

  async function save(record: FieldRecord) {
    const mutate = cloudMode ? mutateCloudRecords : mutateRecords;
    const next = await mutate((rows) => {
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
    const mutate = cloudMode ? mutateCloudRecords : mutateRecords;
    const next = await mutate((rows) => {
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
      const mutate = cloudMode ? mutateCloudRecords : mutateRecords;
      const next = await mutate((rows) =>
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

      const clientId = getClientId();

      const response = await fetch("/api/analyze-crop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(clientId ? { "X-Client-ID": clientId } : {}),
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

      const responseText = await response.text();
      let data: { diagnosis?: Diagnosis; source?: string; error?: string };

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          response.ok
            ? "El servidor devolvió una respuesta no válida. Inténtalo de nuevo."
            : "El servidor no respondió correctamente. Revisa la conexión e inténtalo de nuevo.",
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo analizar la imagen.",
        );
      }

      if (!data.diagnosis || !data.source) {
        throw new Error(
          "El análisis terminó sin devolver un diagnóstico válido.",
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

      <aside className={`sidebar ${menu ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            choose("analysis");
          }}
        >
          <span className="brand-mark">
            <img src="/terranova-icon.png" alt="" width={36} height={36} />
          </span>
          <span>
            Terra<span>Nova</span>
            <small>MONITOREO INTELIGENTE DE CULTIVOS</small>
          </span>
        </a>

        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Plegar menú lateral"}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? "Expandir menú" : "Plegar menú"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <div className="workspace-chip">
          <span className="workspace-icon">
            <Leaf size={19} />
          </span>
          <div>
            <strong>Mi monitoreo</strong>
            <small>Monitoreo de rabanito</small>
          </div>
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
              title={section.label}
              aria-label={section.label}
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
          <button
            type="button"
            className="sidebar-link"
            onClick={() => setHelp(true)}
            title="Guía de uso"
            aria-label="Guía de uso"
          >
            <CircleHelp size={18} />
            Guía de uso
            <ArrowUpRight size={14} />
          </button>

        </div>
      </aside>

      <div className={`main-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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

            {userEmail && (
            <>
              <span className="account-email" title={userEmail}>{userEmail}</span>
              <button type="button" className="logout-button" onClick={onLogout} title="Cerrar sesión">Salir</button>
            </>
          )}
          {!userEmail && <span className="profile-avatar">AG</span>}
          </div>
        </header>

        <main>
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                <span className="mini-line" />
                {" "}REGISTRO Y MONITOREO INTELIGENTE DE CULTIVOS
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
                void (async () => {
                  try {
                    const restored = cloudMode
                      ? await mergeBackupIntoCloud(next)
                      : next;
                    setRecords(restored);
                    setLastSync(currentTime());
                    channel.current?.postMessage("changed");
                    setView("history");
                    notify(cloudMode
                      ? "Respaldo integrado y sincronizado con la nube."
                      : "Respaldo restaurado en este dispositivo.");
                  } catch (error) {
                    notify(error instanceof Error ? error.message : "No se pudo sincronizar el respaldo.", true);
                  }
                })();
              }}
            />
          )}

          <div className="view-bar view-bar-status">
            <span className="sync-label">
              {online ? <Cloud size={15} /> : <WifiOff size={15} />}
              {" "}
              {lastSync
                ? `${cloudMode ? "Sincronizado en la nube" : "Guardado local"} · ${lastSync}`
                : "Preparando bitácora"}
            </span>
          </div>

          <div
            id="module-panel"
            role="region"
            aria-label={sections.find((section) => section.id === view)?.label}
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

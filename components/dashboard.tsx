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
  Settings2,
  ShieldCheck,
  Sprout,
  Sun,
  WifiOff,
  X,
  FileText,
  FileSpreadsheet,
  HardDrive,
  KeyRound,
  CircleHelp,
} from "lucide-react";
import { demoDiagnosis, demoRecords } from "@/lib/demo";
import { Diagnosis, FieldRecord, View } from "@/lib/types";
import {
  readImage,
  readRecords,
  writeRecords,
  mutateRecords,
} from "@/lib/storage";
import { summary } from "@/lib/metrics";
import { exportCsv, exportPdf } from "@/lib/exports";
import AnalysisPanel from "./analysis-panel";
import History from "./history";
import Comparison from "./comparison";
import Protocols from "./protocols";
import ReportForm from "./report-form";
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
export default function Dashboard() {
  const [view, setView] = useState<View>("analysis");
  const [records, setRecords] = useState<FieldRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [image, setImage] = useState("/radish-sample.jpg");
  const [imageName, setImageName] = useState("Muestra de rábano");
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
  const [remove, setRemove] = useState<FieldRecord | null>(null);
  const [dark, setDark] = useState(true);
  const [menu, setMenu] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [engineChecked, setEngineChecked] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const channel = useRef<BroadcastChannel | null>(null);
  const abort = useRef<AbortController | null>(null);
  const version = useRef(0);
  const mounted = useRef(true);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  const closeToast = useCallback(() => setToast(null), []);
  const refreshEngine = useCallback(async () => {
    try {
      const r = await fetch("/api/analyze-crop", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setConfigured(!!data.configured);
      } else setConfigured(false);
    } catch {
      setConfigured(false);
    } finally {
      setEngineChecked(true);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    readRecords()
      .then(async (saved) => {
        const initial = saved === undefined ? demoRecords : saved;
        if (saved === undefined) await writeRecords(initial);
        if (mounted.current) {
          setRecords(initial);
          setReady(true);
          setLastSync(
            new Date().toLocaleTimeString("es-PE", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
        }
      })
      .catch(() => {
        setReady(true);
        notify(
          "No se pudo abrir el almacenamiento local. Revisa los permisos del navegador.",
          true,
        );
      });
    try {
      const savedTheme = localStorage.getItem("agrovision-theme");
      if (savedTheme === "light") setDark(false);
    } catch {}
    setOnline(navigator.onLine);
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refreshEngine();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("agrovision-records");
      channel.current.onmessage = () => {
        readRecords()
          .then((r) => {
            if (r) {
              setRecords(r);
              setLastSync(
                new Date().toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              );
            }
          })
          .catch(() => {});
      };
    }
    void refreshEngine();
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => {
      mounted.current = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
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
  async function persist(next: FieldRecord[]) {
    await writeRecords(next);
    setRecords(next);
    setLastSync(
      new Date().toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    channel.current?.postMessage("changed");
  }
  async function save(record: FieldRecord) {
    const next = await mutateRecords((rows) => [record, ...rows]);
    setRecords(next);
    setLastSync(
      new Date().toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    channel.current?.postMessage("changed");
    setView("history");
    notify("Registro guardado en tu bitácora.");
  }
  async function deleteRecord() {
    if (!remove) return;
    try {
      const next = await mutateRecords((rows) =>
        rows.filter((r) => r.id !== remove.id),
      );
      setRecords(next);
      setLastSync(
        new Date().toLocaleTimeString("es-PE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      channel.current?.postMessage("changed");
      setRemove(null);
      notify("Registro eliminado. La comparativa se actualizó.");
    } catch {
      notify("No se pudo eliminar el registro.", true);
    }
  }
  async function upload(file: File) {
    try {
      const n = ++version.current;
      const value = await readImage(file);
      if (n !== version.current) return;
      setImage(value);
      setImageName(file.name);
      setDiagnosis(null);
      setSource("manual");
      notify("Fotografía lista para analizar.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  async function demo() {
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
  async function analyze(crop: string, scaleReference: string) {
    if (!online) {
      notify(
        "El análisis real requiere conexión. Puedes seguir registrando observaciones.",
        true,
      );
      return;
    }
    setBusy(true);
    setDiagnosis(null);
    abort.current = new AbortController();
    const timer = setTimeout(() => abort.current?.abort(), 65000);
    try {
      let dataImage = image;
      if (!image.startsWith("data:")) {
        const response = await fetch(image);
        const blob = await response.blob();
        dataImage = await readImage(
          new File([blob], "crop.jpg", { type: blob.type }),
        );
      }
      const response = await fetch("/api/analyze-crop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ image: dataImage, crop, scaleReference }),
        signal: abort.current.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "No se pudo analizar la imagen.");
      setDiagnosis(data.diagnosis);
      setSource(data.source === "gemini" ? "gemini" : "openai");
      notify("Análisis completado. Revisa las observaciones.");
    } catch (e) {
      notify(
        e instanceof Error && e.name === "AbortError"
          ? "Se agotó el tiempo de espera. Inténtalo de nuevo."
          : (e as Error).message,
        true,
      );
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }
  async function download(format: "csv" | "pdf") {
    setExportOpen(false);
    try {
      if (!records.length) {
        notify("Añade un registro antes de exportar.", true);
        return;
      }
      if (format === "csv") exportCsv(records);
      else await exportPdf(records);
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
          className="mobile-shade"
          aria-label="Cerrar menú"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            choose("analysis");
          }}
        >
          <span className="brand-mark">
            <Sprout size={26} />
          </span>
          <span>
            agro<span>vision</span>
            <small>INTELIGENCIA QUE CULTIVA</small>
          </span>
        </a>
        <div className="workspace-chip">
          <span className="workspace-icon">
            <Leaf size={19} />
          </span>
          <div>
            <strong>Mi espacio agrícola</strong>
            <small>Monitoreo de cultivos</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">ESPACIO DE TRABAJO</span>
        <nav aria-label="Navegación principal">
          {sections.map((s) => (
            <button
              key={s.id}
              className={view === s.id ? "active" : ""}
              onClick={() => choose(s.id)}
              aria-current={view === s.id ? "page" : undefined}
            >
              <s.icon size={19} />
              <span>{s.label}</span>
              {s.id === "history" ? (
                <span className="nav-count">{records.length}</span>
              ) : view === s.id ? (
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
            <strong>Tu campo, conectado.</strong>
            <p>Bitácora disponible sin conexión en este navegador.</p>
            <div>
              <span className="status-dot" />
              Almacenamiento local
            </div>
          </div>
          <button className="sidebar-link" onClick={() => setSettings(true)}>
            <Settings2 size={18} />
            Configuración
          </button>
          <button className="sidebar-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Guía de uso
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span className="workspace-icon">
              <Sprout size={18} />
            </span>
            <div>
              <strong>Proyecto agrícola</strong>
              <small>Rábanos y hortalizas</small>
            </div>
            <span className="version">v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <Grid2X2 size={16} />
            <span>Espacio de trabajo</span>
            <ChevronRight size={14} />
            <strong>{sections.find((s) => s.id === view)?.label}</strong>
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
                    : "Motor en demostración"}
            </span>
            <span className="topbar-divider" />
            <button
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
                <span className="mini-line" /> SISTEMA INTELIGENTE DE MONITOREO
                AGRÍCOLA
              </div>
              <h1>
                Conoce mejor lo que cultivas<span>.</span>
              </h1>
              <p>Observa, analiza y acompaña cada etapa de tus cultivos.</p>
            </div>
            <div className="heading-actions">
              <div className="export-wrap">
                <button
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
                    <button onClick={() => void download("csv")}>
                      <FileSpreadsheet size={17} />
                      Historial en CSV
                    </button>
                    <button onClick={() => void download("pdf")}>
                      <FileText size={17} />
                      Reporte en PDF
                    </button>
                  </div>
                )}
              </div>
              <button
                className="button primary"
                disabled={!ready}
                onClick={() => setForm("new")}
              >
                <Plus size={18} />
                Nuevo registro
              </button>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-top">
                <span>Muestras registradas</span>
                <span className="stat-icon">
                  <ScanLine size={19} />
                </span>
              </div>
              <div className="stat-value">
                {String(stats.count).padStart(2, "0")}
                <span className="stat-pill">BITÁCORA</span>
              </div>
              <p>Observaciones en tu espacio</p>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>Plantas saludables</span>
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
              <p>{stats.assessed} muestras con estado evaluado</p>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>Diámetro promedio</span>
                <span className="stat-icon">
                  <Ruler size={19} />
                </span>
              </div>
              <div className="stat-value">
                {stats.diameter ? stats.diameter.toFixed(1) : "—"}
                <small>cm</small>
              </div>
              <p>Sobre muestras con medida</p>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>Lotes en seguimiento</span>
                <span className="stat-icon">
                  <LayersIcon />
                </span>
              </div>
              <div className="stat-value">
                {String(stats.zones).padStart(2, "0")}
                <span className="lot-markers">
                  {["A", "B", "C"]
                    .slice(0, Math.min(stats.zones, 3))
                    .map((l) => (
                      <i key={l}>{l}</i>
                    ))}
                </span>
              </div>
              <p>Zonas con registros guardados</p>
            </div>
          </div>
          <div className="view-bar">
            <div
              className="view-tabs"
              role="tablist"
              aria-label="Módulos de monitoreo"
            >
              {sections.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  id={`tab-${s.id}`}
                  aria-selected={view === s.id}
                  aria-controls="module-panel"
                  className={view === s.id ? "active" : ""}
                  onClick={() => setView(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      const i = sections.findIndex((x) => x.id === s.id);
                      const next =
                        sections[(i + (e.key === "ArrowRight" ? 1 : 3)) % 4];
                      setView(next.id);
                      document.getElementById(`tab-${next.id}`)?.focus();
                    }
                  }}
                >
                  <s.icon size={17} />
                  {s.short}
                </button>
              ))}
            </div>
            <span className="sync-label">
              {online ? <Cloud size={15} /> : <WifiOff size={15} />}{" "}
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
                  <h2>El pulso de tu campo</h2>
                  <p>Últimas observaciones registradas</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setView("history")}
                >
                  Ver bitácora
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="recent-grid">
                {records.slice(0, 3).map((r) => (
                  <button
                    className="recent-card"
                    key={r.id}
                    onClick={() => setView("history")}
                  >
                    {r.image ? (
                      <img src={r.image} alt="" />
                    ) : (
                      <div className="recent-placeholder">
                        <Leaf size={24} />
                      </div>
                    )}
                    <div>
                      <strong>
                        {r.zone} <span>· {r.crop.split(" · ")[0]}</span>
                      </strong>
                      <p>{r.fertilizer}</p>
                      <small>
                        {r.date}
                        {r.source === "demo" ? " · Ejemplo" : ""}
                      </small>
                    </div>
                    <Badge tone={r.health === "Sano" ? "green" : "orange"}>
                      {r.health}
                    </Badge>
                  </button>
                ))}
                {!records.length && (
                  <p className="muted">
                    Tu próxima observación aparecerá aquí.
                  </p>
                )}
              </div>
            </section>
          )}
          <footer className="main-footer">
            <span>
              <Sprout size={14} /> Cultiva con datos. Decide con criterio.
            </span>
            <span>
              {records.some((r) => r.source === "demo")
                ? "Incluye datos de demostración · Guardado en este navegador"
                : "Datos guardados en este navegador"}
            </span>
          </footer>
        </main>
      </div>
      {form && (
        <ReportForm
          diagnosis={form === "diagnosis" ? diagnosis : null}
          image={form === "diagnosis" ? image : ""}
          source={form === "diagnosis" ? source : "manual"}
          onClose={() => setForm(null)}
          onSave={save}
          notify={notify}
        />
      )}
      {remove && (
        <Modal title="¿Eliminar este registro?" onClose={() => setRemove(null)}>
          <p className="modal-subtitle">
            Se eliminará la observación de {remove.zone} del {remove.date}.
            También se actualizará la tabla comparativa.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(null)}
            >
              Cancelar
            </button>
            <button className="button destructive" onClick={deleteRecord}>
              Eliminar registro
            </button>
          </div>
        </Modal>
      )}
      {settings && (
        <Modal
          title="Configuración del espacio"
          onClose={() => setSettings(false)}
        >
          <div className="setting-row">
            <div>
              <h3>Apariencia</h3>
              <p>Elige cómo quieres ver tu espacio.</p>
            </div>
            <button className="button secondary" onClick={() => setDark(!dark)}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}{" "}
              {dark ? "Tema claro" : "Tema oscuro"}
            </button>
          </div>
          <div className="setting-block">
            <h3>
              <KeyRound size={18} /> Motor de visión
            </h3>
            <Badge tone={configured ? "green" : "orange"}>
              {configured
                ? "Servidor configurado"
                : engineChecked
                  ? "Pendiente de configurar"
                  : "Comprobando conexión"}
            </Badge>
            <p>
              {configured
                ? "Motor Gemini/OpenAI configurado. La clave se mantiene en el servidor."
                : "Para usar el nivel gratuito, configura GEMINI_API_KEY en .env.local. También acepta OPENAI_API_KEY como alternativa."}
            </p>
            <label>
              Código de acceso (solo si el servidor lo requiere)
              <input
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Token de acceso al motor"
              />
            </label>
            <small>
              Solo se conserva en memoria durante esta sesión. No es tu clave API; esa va en el archivo .env.local.
            </small>
            <button
              className="button secondary"
              onClick={() => void refreshEngine()}
            >
              Comprobar configuración
            </button>
          </div>
          <div className="setting-block">
            <h3>
              <HardDrive size={18} /> Datos y sincronización
            </h3>
            <p>
              Los registros y las imágenes se guardan con IndexedDB en este
              navegador y se actualizan entre pestañas abiertas. No se comparten
              entre equipos. Exporta tu bitácora antes de borrar datos del
              navegador.
            </p>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="De la fotografía al registro"
          onClose={() => setHelp(false)}
        >
          <ol className="protocol-steps">
            {[
              "Carga una foto nítida con luz uniforme. Incluye una regla si necesitas estimar el diámetro.",
              "Prueba la demostración o selecciona Visión real tras configurar la clave en el servidor.",
              "Revisa las observaciones y usa el diagnóstico para completar un reporte de campo.",
              "Compara las muestras por fertilizante y exporta la bitácora a CSV o PDF.",
            ].map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                <p>{s}</p>
              </li>
            ))}
          </ol>
          <p className="detail-copy">
            La confianza de la IA no está calibrada. Una imagen no permite
            confirmar una enfermedad ni medir rendimiento agrícola. Valida las
            observaciones en campo.
          </p>
        </Modal>
      )}
      {toast && <Toast {...toast} onClose={closeToast} />}
    </div>
  );
}
function LayersIcon() {
  return <FlaskConical size={19} />;
}

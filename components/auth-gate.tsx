"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cloud, LoaderCircle, LockKeyhole, LogIn, Sprout, UserPlus } from "lucide-react";
import Dashboard from "./dashboard";
import {
  cloudHasMembership,
  cloudJoinProject,
  cloudSignIn,
  cloudSignOut,
  cloudSignUp,
  getCloudSession,
  isCloudConfigured,
  type CloudSession,
} from "@/lib/cloud";

type Screen = "loading" | "login" | "join" | "app" | "local" | "setup";

export default function AuthGate() {
  const [screen, setScreen] = useState<Screen>(isCloudConfigured() ? "loading" : "setup");
  const [session, setSession] = useState<CloudSession | null>(null);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [memberName, setMemberName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isCloudConfigured()) {
      setScreen("setup");
      return;
    }

    let alive = true;
    getCloudSession()
      .then(async (active) => {
        if (!alive) return;
        if (!active) {
          setScreen("login");
          return;
        }
        setSession(active);
        try {
          const member = await cloudHasMembership(active);
          if (alive) setScreen(member ? "app" : "join");
        } catch (reason) {
          if (alive) {
            setError(reason instanceof Error ? reason.message : "No se pudo verificar la sesión.");
            setScreen("login");
          }
        }
      })
      .catch((reason) => {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "No se pudo recuperar la sesión.");
        setScreen("login");
      });

    return () => { alive = false; };
  }, []);

  async function afterLogin(active: CloudSession) {
    setSession(active);
    setError("");
    setMessage("");
    const member = await cloudHasMembership(active);
    setScreen(member ? "app" : "join");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (signup) {
        const result = await cloudSignUp(email, password);
        if (!result.session) {
          setMessage("Cuenta creada. Revisa tu correo para confirmar la dirección; después inicia sesión y usa el código de invitación del equipo.");
          setSignup(false);
          setScreen("login");
        } else {
          await afterLogin(result.session);
          setMessage("Cuenta creada. Introduce el código de invitación para entrar a la bitácora del equipo.");
        }
      } else {
        await afterLogin(await cloudSignIn(email, password));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await cloudJoinProject(inviteCode, memberName, session);
      setScreen("app");
      setMessage("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo activar el acceso al proyecto.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await cloudSignOut();
    setSession(null);
    setPassword("");
    setInviteCode("");
    setError("");
    setMessage("");
    setScreen("login");
    setBusy(false);
  }

  if (screen === "local") return <Dashboard />;

  if (screen === "setup") {
    return (
      <div className="auth-page">
        <section className="auth-card auth-setup-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={28} /></span><span>agro<span>vision</span></span></div>
          <span className="auth-kicker"><Cloud size={15} /> BITÁCORA COMPARTIDA</span>
          <h1>Activa la sincronización en la nube</h1>
          <p>Para que la bitácora se comparta entre laptop y celular, primero hay que configurar el proyecto de Supabase y las variables de entorno de Vercel.</p>
          <div className="auth-setup-list">
            <div><span>1</span><p>Crea un proyecto gratuito en Supabase.</p></div>
            <div><span>2</span><p>Ejecuta el archivo <code>supabase/schema.sql</code> en SQL Editor.</p></div>
            <div><span>3</span><p>Configura las variables indicadas en <code>.env.example</code> en Vercel y vuelve a desplegar.</p></div>
          </div>
          <button className="auth-primary" type="button" onClick={() => setScreen("local")}>Continuar solo en este dispositivo</button>
          <p className="auth-footnote">El modo local no sincroniza los datos entre dispositivos.</p>
        </section>
      </div>
    );
  }

  if (screen === "loading") {
    return <div className="auth-page"><div className="auth-loading"><LoaderCircle className="auth-spinner" size={28} /><span>Comprobando tu sesión...</span></div></div>;
  }

  if (screen === "app" && session) {
    return (
      <>
        <Dashboard userEmail={session.user.email || "Cuenta AgroVision"} onLogout={logout} />
        <div className="cloud-toast" role="status"><Cloud size={14} /> Bitácora sincronizada en la nube</div>
      </>
    );
  }

  if (screen === "join" && session) {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={28} /></span><span>agro<span>vision</span></span></div>
          <span className="auth-kicker"><LockKeyhole size={15} /> ACCESO AL EQUIPO</span>
          <h1>Únete a la bitácora compartida</h1>
          <p>La cuenta <strong>{session.user.email}</strong> ya inició sesión. Introduce el código de invitación del equipo para acceder a los registros de los cuatro integrantes.</p>
          <form className="auth-form" onSubmit={submitJoin}>
            <label>Tu nombre o integrante
              <input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Ej. Integrante 1" maxLength={80} autoComplete="name" />
            </label>
            <label>Código de invitación
              <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Código entregado por el administrador" required autoComplete="off" />
            </label>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-message">{message}</div>}
            <button className="auth-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner" size={18} /> : <Cloud size={18} />} Activar acceso al proyecto</button>
          </form>
          <button className="auth-text-button" type="button" disabled={busy} onClick={() => void logout()}>Cerrar sesión</button>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={28} /></span><span>agro<span>vision</span></span></div>
        <span className="auth-kicker"><Cloud size={15} /> BITÁCORA EN LA NUBE</span>
        <h1>{signup ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h1>
        <p>{signup ? "Crea una cuenta con tu correo. Después necesitarás el código de invitación del equipo." : "Inicia sesión para ver y actualizar la misma bitácora desde tu laptop o celular."}</p>
        <form className="auth-form" onSubmit={submitAuth}>
          <label>Correo electrónico
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required autoComplete="email" />
          </label>
          <label>Contraseña
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={signup ? "Mínimo 8 caracteres" : "Tu contraseña"} required minLength={signup ? 8 : 6} autoComplete={signup ? "new-password" : "current-password"} />
          </label>
          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}
          <button className="auth-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner" size={18} /> : signup ? <UserPlus size={18} /> : <LogIn size={18} />}{signup ? "Crear cuenta" : "Iniciar sesión"}</button>
        </form>
        <div className="auth-switch">
          <span>{signup ? "¿Ya tienes cuenta?" : "¿Es tu primera vez?"}</span>
          <button type="button" disabled={busy} onClick={() => { setSignup((value) => !value); setError(""); setMessage(""); }}>{signup ? "Inicia sesión" : "Crear cuenta"}</button>
        </div>
        <div className="auth-security"><LockKeyhole size={14} /> Solo las cuentas con código de invitación pueden acceder a la bitácora del equipo.</div>
      </section>
    </div>
  );
}

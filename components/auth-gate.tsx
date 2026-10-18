"use client";

import { FormEvent, useEffect, useState } from "react";
import { Cloud, LoaderCircle, LockKeyhole, LogIn, Sprout, UserPlus } from "lucide-react";
import Dashboard from "./dashboard";
import { cloudSignIn, cloudSignOut, cloudSignUp, getCloudSession, isCloudConfigured, type CloudSession } from "@/lib/cloud";

type Screen = "loading" | "login" | "app" | "local" | "setup";

export default function AuthGate() {
  const [screen, setScreen] = useState<Screen>(isCloudConfigured() ? "loading" : "setup");
  const [session, setSession] = useState<CloudSession | null>(null);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      .then((active) => {
        if (!alive) return;
        if (active) {
          setSession(active);
          setScreen("app");
        } else {
          setScreen("login");
        }
      })
      .catch((reason) => {
        if (!alive) return;
        setError(reason instanceof Error ? reason.message : "No se pudo recuperar la sesión.");
        setScreen("login");
      });
    return () => { alive = false; };
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (signup) {
        const result = await cloudSignUp(email, password);
        if (!result.session) {
          setSignup(false);
          setScreen("login");
          setMessage("Tu cuenta fue creada. Revisa tu correo para confirmar la dirección y luego inicia sesión.");
        } else {
          setSession(result.session);
          setScreen("app");
          setMessage("Cuenta creada. Tus bitácoras se guardarán en tu cuenta personal.");
        }
      } else {
        const active = await cloudSignIn(email, password);
        setSession(active);
        setScreen("app");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo completar la solicitud.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try { await cloudSignOut(); } finally {
      setSession(null);
      setPassword("");
      setError("");
      setMessage("");
      setScreen("login");
      setBusy(false);
    }
  }

  if (screen === "local") return <Dashboard />;

  if (screen === "setup") {
    return (
      <div className="auth-page">
        <section className="auth-card auth-setup-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={28} /></span><span>agro<span>vision</span></span></div>
          <span className="auth-kicker"><Cloud size={15} /> TU BITÁCORA EN LA NUBE</span>
          <h1>Activa tu cuenta de AgroVision</h1>
          <p>Configura Supabase y las variables de entorno para guardar tu bitácora en tu cuenta y recuperarla desde cualquier dispositivo.</p>
          <div className="auth-setup-list">
            <div><span>1</span><p>Configura el proyecto de Supabase.</p></div>
            <div><span>2</span><p>Ejecuta la migración del archivo <code>supabase/personal-account.sql</code>.</p></div>
            <div><span>3</span><p>Configura las variables de entorno en Vercel y vuelve a desplegar.</p></div>
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
    return <>
      <Dashboard userEmail={session.user.email || "Mi cuenta AgroVision"} onLogout={logout} />
      <div className="cloud-toast" role="status"><Cloud size={14} /> Tu bitácora personal está sincronizada</div>
    </>;
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={28} /></span><span>agro<span>vision</span></span></div>
        <span className="auth-kicker"><Cloud size={15} /> CUENTA PERSONAL</span>
        <h1>{signup ? "Crea tu cuenta" : "Bienvenido de nuevo"}</h1>
        <p>{signup ? "Crea una cuenta para guardar tus plantas, fotografías y observaciones en la nube." : "Inicia sesión para recuperar tu bitácora desde tu laptop o celular."}</p>
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
        <div className="auth-security"><LockKeyhole size={14} /> Cada cuenta solo puede ver y modificar sus propias bitácoras.</div>
      </section>
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Cloud,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Mail,
  Sprout,
  UserPlus,
} from "lucide-react";
import Dashboard from "./dashboard";
import {
  cloudRequestPasswordReset,
  cloudSignIn,
  cloudSignOut,
  cloudSignUp,
  cloudUpdatePassword,
  getCloudSession,
  isCloudConfigured,
  type CloudSession,
} from "@/lib/cloud";

type Screen = "loading" | "login" | "app" | "local" | "setup" | "recovery" | "reset";

// Use the official domain for production and the stable branch alias for Preview.
// This prevents password-reset emails from pointing to a per-deployment Vercel URL
// that may be protected or disappear after another deployment.
function getPasswordRecoveryRedirectUrl() {
  if (typeof window === "undefined") return "https://agrovision-lab.vercel.app/";

  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "agrovision-lab.vercel.app") {
    return "https://agrovision-lab.vercel.app/";
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${window.location.origin}/`;
  }

  return "https://agrovision-git-recuperacion-contrasena-leochegne2-7800.vercel.app/";
}

export default function AuthGate() {
  const [screen, setScreen] = useState<Screen>(isCloudConfigured() ? "loading" : "setup");
  const [session, setSession] = useState<CloudSession | null>(null);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetAccessToken, setResetAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isCloudConfigured()) {
      setScreen("setup");
      return;
    }

    // Supabase returns the recovery access token in the URL fragment.
    // Read it once, then remove it from the visible URL.
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryType = hash.get("type");
    const recoveryToken = hash.get("access_token");
    const authErrorCode = hash.get("error_code");
    const authErrorDescription = hash.get("error_description");

    // Show a useful message for an invalid/expired recovery link instead of
    // silently falling through to the normal login screen.
    if (authErrorCode || authErrorDescription) {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      const description = authErrorDescription?.replace(/\+/g, " ");
      setError(
        authErrorCode === "otp_expired"
          ? "El enlace de recuperación caducó o ya se utilizó. Solicita un enlace nuevo."
          : description || "No se pudo validar el enlace. Solicita uno nuevo."
      );
      setScreen("login");
      return;
    }

    if (recoveryType === "recovery") {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      if (recoveryToken) {
        setResetAccessToken(recoveryToken);
        setScreen("reset");
      } else {
        setError("El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.");
        setScreen("login");
      }
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

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await cloudRequestPasswordReset(email, getPasswordRecoveryRedirectUrl());
      setMessage("Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer la contraseña. Revisa también la carpeta de spam.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo solicitar la recuperación. Inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await cloudUpdatePassword(resetAccessToken, newPassword);
      setResetAccessToken("");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
      setSignup(false);
      setScreen("login");
      setMessage("Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la contraseña. Solicita un enlace nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await cloudSignOut();
    } finally {
      setSession(null);
      setPassword("");
      setError("");
      setMessage("");
      setScreen("login");
      setBusy(false);
    }
  }

  function goToLogin() {
    setScreen("login");
    setSignup(false);
    setError("");
    setMessage("");
    setNewPassword("");
    setConfirmPassword("");
    setResetAccessToken("");
  }

  if (screen === "local") return <Dashboard />;

  if (screen === "setup") {
    return (
      <div className="auth-page">
        <section className="auth-card auth-setup-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={26} /></span><span>agro<span>vision</span></span></div>
          <span className="auth-kicker"><Cloud size={15} /> TU BITÁCORA EN LA NUBE</span>
          <h1>Activa tu cuenta de AgroVision</h1>
          <p>Configura Supabase y las variables de entorno para guardar tu bitácora en tu cuenta y recuperarla desde cualquier dispositivo.</p>
          <div className="auth-setup-list">
            <div><span>1</span><p>Configura el proyecto de Supabase.</p></div>
            <div><span>2</span><p>Ejecuta la migración de cuentas personales en Supabase.</p></div>
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

  if (screen === "recovery") {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={26} /></span><span>agro<span>vision</span></span></div>
          <span className="auth-kicker"><Mail size={15} /> RECUPERACIÓN SEGURA</span>
          <h1>Recupera tu contraseña</h1>
          <p>Escribe el correo asociado a tu cuenta. Te enviaremos un enlace para crear una contraseña nueva.</p>
          <form className="auth-form" onSubmit={submitRecovery}>
            <label>Correo electrónico
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required autoComplete="email" />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            {message && <div className="auth-message" role="status">{message}</div>}
            <button className="auth-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="auth-spinner" size={18} /> : <Mail size={18} />}Enviar enlace de recuperación</button>
          </form>
          <button className="auth-text-button" type="button" disabled={busy} onClick={goToLogin}><ArrowLeft size={14} /> Volver al inicio de sesión</button>
          <div className="auth-security"><LockKeyhole size={14} /> Por seguridad, el mensaje no confirma si el correo está registrado.</div>
        </section>
      </div>
    );
  }

  if (screen === "reset") {
    return (
      <div className="auth-page">
        <section className="auth-card">
          <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={26} /></span><span>agro<span>vision</span></span></div>
          <span className="auth-kicker"><KeyRound size={15} /> NUEVA CONTRASEÑA</span>
          <h1>Protege tu cuenta</h1>
          <p>Elige una contraseña nueva de al menos 8 caracteres para volver a acceder a tu bitácora.</p>
          <form className="auth-form" onSubmit={submitNewPassword}>
            <label>Nueva contraseña
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} autoComplete="new-password" />
            </label>
            <label>Confirmar contraseña
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repite la contraseña" required minLength={8} autoComplete="new-password" />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-primary" type="submit" disabled={busy || !resetAccessToken}>{busy ? <LoaderCircle className="auth-spinner" size={18} /> : <KeyRound size={18} />}Guardar nueva contraseña</button>
          </form>
          <button className="auth-text-button" type="button" disabled={busy} onClick={goToLogin}><ArrowLeft size={14} /> Volver al inicio de sesión</button>
          {!resetAccessToken && <div className="auth-error" role="alert">El enlace no es válido o ha caducado. Solicita otro desde la pantalla de inicio de sesión.</div>}
        </section>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><span className="auth-brand-mark"><Sprout size={26} /></span><span>agro<span>vision</span></span></div>
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
          {!signup && <div className="auth-forgot-row"><button type="button" disabled={busy} onClick={() => { setScreen("recovery"); setError(""); setMessage(""); }}>¿Olvidaste tu contraseña?</button></div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-message" role="status">{message}</div>}
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

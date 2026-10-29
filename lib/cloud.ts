import type { FieldRecord } from "./types";
import { readRecords, mergeRecords } from "./storage";
import { isRecord } from "./backup";
import { eligible, validateRecord } from "./tracking";

type CloudUser = { id: string; email?: string };
export type CloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type?: string;
  user: CloudUser;
};

type CloudRecordRow = {
  id: string;
  owner_id: string;
  project_id: string;
  payload: FieldRecord;
  created_by: string;
  updated_by: string;
  updated_at: string;
};

const SESSION_KEY = "agrovision-cloud-session-v2";
const PROJECT_ID = process.env.NEXT_PUBLIC_AGROVISION_PROJECT_ID || "rabanitos-2026";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const PRIVATE_IMAGE_PREFIX = "supabase-storage://agrovision-photos/";

async function cloudFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (init.signal) return fetch(input, init);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function sessionIdentityChanged(oldValue: string | null, newValue: string | null): boolean {
  if (!oldValue || !newValue) return true;
  try {
    const oldId = JSON.parse(oldValue)?.user?.id;
    const newId = JSON.parse(newValue)?.user?.id;
    return typeof oldId !== "string" || typeof newId !== "string" || oldId !== newId;
  } catch { return true; }
}

export function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function cloudProjectId() {
  return PROJECT_ID;
}

function authHeaders(accessToken?: string) {
  return {
    apikey: SUPABASE_ANON_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    "Content-Type": "application/json",
  };
}

function parseErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["msg", "message", "error_description", "error"]) {
      if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
    }
  }
  return fallback;
}

async function responseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function saveSession(session: CloudSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function readStoredSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudSession>;
    if (
      typeof parsed.access_token !== "string" ||
      typeof parsed.refresh_token !== "string" ||
      typeof parsed.expires_at !== "number" ||
      !parsed.user ||
      typeof parsed.user.id !== "string"
    ) {
      clearSession();
      return null;
    }
    return parsed as CloudSession;
  } catch {
    return null;
  }
}

function normaliseSession(data: Record<string, unknown>): CloudSession | null {
  const user = data.user as CloudUser | undefined;
  if (
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    !user ||
    typeof user.id !== "string"
  ) return null;

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  const expiresAt = typeof data.expires_at === "number"
    ? data.expires_at
    : Math.floor(Date.now() / 1000) + expiresIn;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    token_type: typeof data.token_type === "string" ? data.token_type : "bearer",
    user,
  };
}

export async function cloudSignIn(email: string, password: string) {
  ensureCloudConfigured();
  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo iniciar sesión."));
  const session = normaliseSession(data as Record<string, unknown>);
  if (!session) throw new Error("El inicio de sesión no devolvió una sesión completa.");
  saveSession(session);
  return session;
}

export async function cloudSignUp(email: string, password: string) {
  ensureCloudConfigured();
  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo crear la cuenta."));
  const session = normaliseSession((data || {}) as Record<string, unknown>);
  if (session) saveSession(session);
  return { session, data };
}

export async function cloudSignOut() {
  const session = readStoredSession();
  try {
    if (session && isCloudConfigured()) {
      await cloudFetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: authHeaders(session.access_token),
        cache: "no-store",
      });
    }
  } finally {
    clearSession();
  }
}

export async function getCloudSession(): Promise<CloudSession | null> {
  ensureCloudConfigured();
  const session = readStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;

  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  const refreshed = response.ok ? normaliseSession((data || {}) as Record<string, unknown>) : null;
  if (!refreshed) {
    clearSession();
    return null;
  }
  saveSession(refreshed);
  return refreshed;
}

function ensureCloudConfigured() {
  if (!isCloudConfigured()) throw new Error("Falta configurar Supabase para habilitar la sincronización en la nube.");
}

async function activeSession() {
  const session = await getCloudSession();
  if (!session) throw new Error("Tu sesión venció. Inicia sesión nuevamente.");
  return session;
}

async function cloudRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await activeSession();
  const response = await cloudFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authHeaders(session.access_token),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, `Error de la base de datos (${response.status}).`));
  return data as T;
}

async function getCloudRows(): Promise<CloudRecordRow[]> {
  const session = await activeSession();
  const query = new URLSearchParams({
    select: "id,owner_id,project_id,payload,created_by,updated_by,updated_at",
    owner_id: `eq.${session.user.id}`,
    project_id: `eq.${PROJECT_ID}`,
    order: "updated_at.desc,id.asc",
  });
  const rows: CloudRecordRow[] = [];
  const pageSize = 500;
  const ids = new Set<string>();
  for (let offset = 0; ;) {
    query.set("limit", String(pageSize));
    query.set("offset", String(offset));
    const page = await cloudRest<CloudRecordRow[]>(`agrovision_records?${query}`);
    if (!Array.isArray(page)) throw new Error("La nube devolvió una página inválida.");
    if (page.length === 0) return rows;
    for (const row of page) {
      if (ids.has(row.id)) throw new Error("La bitácora cambió durante la lectura. Actualiza para volver a consultar.");
      ids.add(row.id);
    }
    rows.push(...page);
    // The server can enforce a smaller page size than the requested limit.
    offset += page.length;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sorted(records: FieldRecord[]) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function signedImageUrl(marker: string, accessToken: string): Promise<string> {
  const path = marker.slice(PRIVATE_IMAGE_PREFIX.length);
  const response = await cloudFetch(`${SUPABASE_URL}/storage/v1/object/sign/agrovision-photos/${encodePath(path)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  });
  const data = await responseJson(response) as { signedURL?: string; message?: string } | null;
  if (!response.ok || !data?.signedURL) {
    throw new Error(parseErrorMessage(data, "No se pudo obtener acceso a una fotografía de tu bitácora."));
  }
  if (/^https?:\/\//i.test(data.signedURL)) return data.signedURL;
  if (data.signedURL.startsWith("/storage/v1/")) return `${SUPABASE_URL}${data.signedURL}`;
  return `${SUPABASE_URL}/storage/v1${data.signedURL.startsWith("/") ? data.signedURL : `/${data.signedURL}`}`;
}

async function withSignedImage(record: FieldRecord, accessToken: string): Promise<FieldRecord> {
  if (!record.image?.startsWith(PRIVATE_IMAGE_PREFIX)) return record;
  return { ...record, image: await signedImageUrl(record.image, accessToken) };
}

export async function readCloudRecords(): Promise<FieldRecord[]> {
  const session = await activeSession();
  const rows = await getCloudRows();
  const records = rows.map((row) => row.payload);
  for (const record of records) {
    if (!isRecord({ ...record, image: "" })) {
      throw new Error("La nube contiene un registro inválido. No se modificaron tus datos.");
    }
  }
  return sorted(await Promise.all(records.map((record) => withSignedImage(record, session.access_token))));
}

async function uploadImageIfNeeded(record: FieldRecord): Promise<FieldRecord> {
  if (!record.image || record.image.startsWith(PRIVATE_IMAGE_PREFIX)) return record;
  if (/^https:\/\//i.test(record.image)) return record;
  if (record.image.startsWith("/")) {
    return { ...record, image: new URL(record.image, window.location.origin).href };
  }
  if (!record.image.startsWith("data:image/")) {
    throw new Error("Una fotografía tiene un formato que no se puede sincronizar. Vuelve a adjuntarla.");
  }

  const imageResponse = await cloudFetch(record.image);
  if (!imageResponse.ok) throw new Error("No se pudo preparar una fotografía para subirla a la nube.");
  const blob = await imageResponse.blob();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const mimeType = extension === "jpg" ? "image/jpeg" : blob.type;
  const unique = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const session = await activeSession();
  const path = `${session.user.id}/${record.id}-${unique}.${extension}`;
  const response = await cloudFetch(`${SUPABASE_URL}/storage/v1/object/agrovision-photos/${encodePath(path)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: blob,
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo guardar la fotografía en la nube."));
  return { ...record, image: `${PRIVATE_IMAGE_PREFIX}${path}` };
}

/** Only the configured private bucket may be fetched for portable backups. */
export function isCloudPhotoUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return !!SUPABASE_URL && url.origin === new URL(SUPABASE_URL).origin &&
      url.pathname.startsWith("/storage/v1/object/sign/agrovision-photos/");
  } catch { return false; }
}

function preserveExistingPrivateImage(record: FieldRecord, previous?: FieldRecord): FieldRecord {
  if (
    previous?.image?.startsWith(PRIVATE_IMAGE_PREFIX) &&
    record.image?.includes("/storage/v1/object/sign/agrovision-photos/")
  ) return { ...record, image: previous.image };
  return record;
}

export async function mutateCloudRecords(update: (records: FieldRecord[]) => FieldRecord[]): Promise<FieldRecord[]> {
  const session = await activeSession();
  const rows = await getCloudRows();
  const previous = sorted(rows.map((row) => row.payload));
  const previousById = new Map(rows.map((row) => [row.id, row]));
  const input = update(previous).map((record) => preserveExistingPrivateImage(record, previousById.get(record.id)?.payload));
  const uniqueIds = new Set<string>();
  for (const record of input) {
    if (uniqueIds.has(record.id)) throw new Error("Hay identificadores repetidos.");
    uniqueIds.add(record.id);
    if (eligible(record)) validateRecord(record, input);
  }
  const next: FieldRecord[] = [];
  for (const record of input) next.push(await uploadImageIfNeeded(record));

  const nextById = new Map(next.map((record) => [record.id, record]));
  const changed = next.filter((record) => {
    const old = previousById.get(record.id);
    return !old || stableStringify(old.payload) !== stableStringify(record);
  });

  if (changed.length) {
    const payload = changed.map((record) => {
      const old = previousById.get(record.id);
      return {
        id: record.id,
        owner_id: session.user.id,
        project_id: PROJECT_ID,
        payload: record,
        created_by: old?.created_by || session.user.id,
        updated_by: session.user.id,
      };
    });
    for (const item of payload) {
      const old = previousById.get(item.id);
      if (!old) {
        // A conflicting ID must not silently overwrite an existing observation.
        await cloudRest<unknown>("agrovision_records", {
          method: "POST",
          body: JSON.stringify(item),
        });
      } else {
        if (!old.updated_at) throw new Error("Actualiza el esquema de Supabase antes de editar.");
        const query = new URLSearchParams({
          id: `eq.${item.id}`, owner_id: `eq.${session.user.id}`,
          project_id: `eq.${PROJECT_ID}`, updated_at: `eq.${old.updated_at}`,
        });
        const updated = await cloudRest<CloudRecordRow[]>(`agrovision_records?${query}`, {
          method: "PATCH", headers: { Prefer: "return=representation" },
          body: JSON.stringify(item),
        });
        if (!updated.length) throw new Error("Otra sesión modificó esta observación. Recarga antes de reintentar.");
      }
    }
  }

  for (const row of rows) {
    if (!nextById.has(row.id)) {
      if (!row.updated_at) throw new Error("Actualiza el esquema de Supabase antes de eliminar.");
      const query = new URLSearchParams({ id: `eq.${row.id}`, owner_id: `eq.${session.user.id}`,
        project_id: `eq.${PROJECT_ID}`, updated_at: `eq.${row.updated_at}` });
      const deleted = await cloudRest<CloudRecordRow[]>(`agrovision_records?${query}`, {
        method: "DELETE", headers: { Prefer: "return=representation" },
      });
      if (!deleted.length) throw new Error("Otra sesión modificó esta observación. Recarga antes de eliminar.");
    }
  }
  return readCloudRecords();
}

/** Importa en la cuenta iniciada solo las observaciones reales de este navegador. */
export async function migrateLocalRecordsToCloud() {
  const session = await activeSession();
  const migrationKey = `agrovision-cloud-migrated:${PROJECT_ID}:${session.user.id}`;
  const localOwnerKey = "agrovision-local-records-owner-v1";
  try {
    if (localStorage.getItem(migrationKey) === "1") return readCloudRecords();
    const localOwner = localStorage.getItem(localOwnerKey);
    // Never copy one account's browser-only records into a different account.
    if (localOwner && localOwner !== session.user.id) return readCloudRecords();
    if (!localOwner) localStorage.setItem(localOwnerKey, session.user.id);
  } catch {
    // Ownership must be known before copying browser data into an account.
    return readCloudRecords();
  }

  const local: FieldRecord[] = (await readRecords()) || [];
  const realLocal = local.filter((record) => record.source !== "demo");
  const cloud = await readCloudRecords();
  const ids = new Set(cloud.map((record) => record.id));
  const additions = realLocal.filter((record) => !ids.has(record.id));
  const result = additions.length
    ? await mutateCloudRecords((current) => {
        const currentIds = new Set(current.map((record) => record.id));
        return [...current, ...additions.filter((record) => !currentIds.has(record.id))];
      })
    : cloud;
  try { localStorage.setItem(migrationKey, "1"); } catch {}
  return result;
}

export async function mergeBackupIntoCloud(incoming: FieldRecord[]) {
  let added = 0;
  const records = await mutateCloudRecords((current) => {
    const merged = mergeRecords(current, incoming);
    added = merged.added;
    return merged.records;
  });
  return { records, added };
}


/** Sends a Supabase password-recovery email back to the same origin. */
export async function cloudRequestPasswordReset(email: string, redirectTo: string): Promise<void> {
  ensureCloudConfigured();
  const cleanedEmail = email.trim();
  if (!cleanedEmail) throw new Error("Escribe el correo asociado a tu cuenta.");

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(redirectTo);
  } catch {
    throw new Error("La dirección de recuperación no es válida.");
  }

  // Never allow a recovery link to redirect to an unrelated site. Preview and
  // production both work because the form passes window.location.origin.
  if (typeof window !== "undefined" && redirectUrl.origin !== window.location.origin) {
    throw new Error("La dirección de recuperación debe pertenecer a este sitio.");
  }
  const localDevelopment = redirectUrl.protocol === "http:" &&
    (redirectUrl.hostname === "localhost" || redirectUrl.hostname === "127.0.0.1");
  if (redirectUrl.protocol !== "https:" && !localDevelopment) {
    throw new Error("La dirección de recuperación debe usar HTTPS.");
  }

  const endpoint = new URL(`${SUPABASE_URL}/auth/v1/recover`);
  endpoint.searchParams.set("redirect_to", redirectUrl.toString());
  const response = await cloudFetch(endpoint.toString(), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: cleanedEmail }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo enviar el correo de recuperación. Inténtalo nuevamente."));
  }
}

/** Updates the password using the temporary recovery access token in the URL fragment. */
export async function cloudUpdatePassword(accessToken: string, newPassword: string): Promise<void> {
  ensureCloudConfigured();
  if (!accessToken) throw new Error("El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.");
  if (newPassword.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");

  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ password: newPassword }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo actualizar la contraseña. Solicita un enlace nuevo."));
  }
}

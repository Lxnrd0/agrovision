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
const SIGNED_URL_CACHE_TTL_MS = 50 * 60 * 1000;
const signedImageCache = new Map<string, { url: string; expiresAt: number }>();

async function cloudFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  operation = "conectar con Supabase",
  timeoutMs = 30_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal || controller.signal });
  } catch (reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (error.name === "AbortError") {
      throw new Error(`Se agotó el tiempo al ${operation}. Comprueba tu conexión e inténtalo nuevamente.`);
    }
    // Safari/iOS reports network and CORS failures as the unhelpful "Load failed".
    // Keep the operation explicit so the user can distinguish Storage from REST.
    throw new Error(`No se pudo ${operation}. Comprueba la conexión a internet y la configuración de Supabase en Vercel. (${error.message || "fallo de red"})`);
  } finally {
    clearTimeout(timeout);
  }
}

function imageDataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) {
    throw new Error("La fotografía no tiene un formato válido. Vuelve a adjuntarla en JPG, PNG o WEBP.");
  }
  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    throw new Error("No se pudo decodificar la fotografía. Vuelve a adjuntarla.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: match[1].toLowerCase() });
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
  try {
    const previous = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as { user?: { id?: string } } | null;
    if (previous?.user?.id && previous.user.id !== session.user.id) signedImageCache.clear();
  } catch {
    signedImageCache.clear();
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  signedImageCache.clear();
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

let refreshInFlight: Promise<CloudSession | null> | null = null;

async function refreshCloudSession(session: CloudSession): Promise<CloudSession | null> {
  let response: Response;
  try {
    response = await cloudFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      cache: "no-store",
    });
  } catch {
    // A network outage is not proof that the refresh token is invalid.
    // Keep the stored session so the user can retry when connectivity returns.
    throw new Error("No se pudo renovar la sesión por un problema de conexión. Inténtalo nuevamente.");
  }

  const data = await responseJson(response);
  if (!response.ok) {
    const details = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const errorCode = String(details.error || details.code || details.error_code || "").toLowerCase();
    const errorMessage = String(details.msg || details.message || details.error_description || "").toLowerCase();
    const invalidRefresh = response.status === 401 ||
      (response.status === 400 && /invalid_grant|refresh_token_not_found|refresh_token_already_used|invalid refresh token/.test(`${errorCode} ${errorMessage}`));

    if (invalidRefresh) {
      const current = readStoredSession();
      if (current && (current.user.id !== session.user.id || current.refresh_token !== session.refresh_token)) {
        return current;
      }
      if (current) clearSession();
      return null;
    }

    throw new Error(
  `No se pudo renovar la sesión (${response.status}). Inténtalo nuevamente.`);
  }

  const refreshed = normaliseSession((data || {}) as Record<string, unknown>);
  if (!refreshed) {
    throw new Error("Supabase devolvió una sesión de renovación incompleta. No se eliminó la sesión guardada.");
  }

  // Do not overwrite a newer session or a different account written by another tab.
  const current = readStoredSession();
  // A sign-out during refresh must not resurrect the old account session.
  if (!current) return null;
  if (current.user.id !== session.user.id || current.refresh_token !== session.refresh_token) {
    return current;
  }

  saveSession(refreshed);
  return refreshed;
}

export async function getCloudSession(): Promise<CloudSession | null> {
  ensureCloudConfigured();
  const session = readStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;

  // Multiple requests in the same tab share one refresh request. This prevents
  // Supabase refresh-token rotation from invalidating concurrent operations.
  if (!refreshInFlight) {
    refreshInFlight = refreshCloudSession(session).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
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
  const operation = path.startsWith("rpc/")
    ? "guardar o sincronizar la observación con Supabase"
    : "consultar la bitácora en Supabase";
  const response = await cloudFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authHeaders(session.access_token),
      ...(init.headers || {}),
    },
    cache: "no-store",
  }, operation);
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, `Error de la base de datos (${response.status}).`));
  return data as T;
}


/** Aggregated comparison data returned by the Supabase security-definer RPCs. */
export type ProjectComparisonTreatment = {
  crop: string;
  fertilizer: string;
  dose: string;
  plantCount: number;
  memberCount: number;
  ageMinDays: number | null;
  ageMaxDays: number | null;
  height: { n: number; meanCm: number | null };
  growth: {
    n: number;
    meanCmPerDay: number | null;
    meanPeriodDays: number | null;
  };
  leaves: { n: number; meanCount: number | null };
  diameter: { n: number; meanCm: number | null };
  health: {
    assessed: number;
    healthy: number;
    healthyPercent: number | null;
  };
};

export type ProjectComparisonData = {
  projectId: string;
  generatedAt: string;
  summary: {
    observations: number;
    plants: number;
    members: number;
    treatments: number;
  };
  treatments: ProjectComparisonTreatment[];
  warnings: string[];
  methodology: {
    measurements: string;
    growth: string;
    averages: string;
    privacy: string;
  };
};

export type PublishedProjectComparison = {
  payload: ProjectComparisonData;
  publishedAt: string;
};

/** Supabase verifies the administrator against auth.uid(); no client-side role is trusted. */
export async function isProjectComparisonAdmin(): Promise<boolean> {
  const result = await cloudRest<boolean>(
    "rpc/agrovision_comparison_is_admin",
    {
      method: "POST",
      body: JSON.stringify({ p_project_id: PROJECT_ID }),
    },
  );
  return result === true;
}

/** Administrator-only preview. The RPC returns aggregated metrics, never individual records. */
export async function readProjectComparisonPreview(): Promise<ProjectComparisonData> {
  return cloudRest<ProjectComparisonData>(
    "rpc/agrovision_comparison_preview",
    {
      method: "POST",
      body: JSON.stringify({ p_project_id: PROJECT_ID }),
    },
  );
}

/** Reads only the administrator-approved aggregate snapshot for a project member. */
export async function readPublishedProjectComparison(): Promise<PublishedProjectComparison | null> {
  return cloudRest<PublishedProjectComparison | null>(
    "rpc/agrovision_comparison_published",
    {
      method: "POST",
      body: JSON.stringify({ p_project_id: PROJECT_ID }),
    },
  );
}

/** Recalculates on Supabase and publishes the aggregate snapshot. */
export async function publishProjectComparison(): Promise<PublishedProjectComparison> {
  return cloudRest<PublishedProjectComparison>(
    "rpc/agrovision_comparison_publish",
    {
      method: "POST",
      body: JSON.stringify({ p_project_id: PROJECT_ID }),
    },
  );
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

async function signedImageUrl(marker: string, accessToken: string, userId: string): Promise<string> {
  const path = marker.slice(PRIVATE_IMAGE_PREFIX.length);
  const cacheKey = `${userId}:${path}`;
  const cached = signedImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) signedImageCache.delete(cacheKey);

  const response = await cloudFetch(`${SUPABASE_URL}/storage/v1/object/sign/agrovision-photos/${encodePath(path)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  }, "obtener el acceso privado a una fotografía");
  const data = await responseJson(response) as { signedURL?: string; message?: string } | null;
  if (!response.ok || !data?.signedURL) {
    throw new Error(parseErrorMessage(data, "No se pudo obtener acceso a una fotografía de tu bitácora."));
  }
  const url = /^https?:\/\//i.test(data.signedURL)
    ? data.signedURL
    : data.signedURL.startsWith("/storage/v1/")
      ? `${SUPABASE_URL}${data.signedURL}`
      : `${SUPABASE_URL}/storage/v1${data.signedURL.startsWith("/") ? data.signedURL : `/${data.signedURL}`}`;
  if (signedImageCache.size >= 2_000) {
    const oldest = signedImageCache.keys().next().value;
    if (oldest) signedImageCache.delete(oldest);
  }
  signedImageCache.set(cacheKey, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS });
  return url;
}

async function withSignedImage(record: FieldRecord, accessToken: string, userId: string): Promise<FieldRecord> {
  if (!record.image?.startsWith(PRIVATE_IMAGE_PREFIX)) return record;
  try {
    return { ...record, image: await signedImageUrl(record.image, accessToken, userId) };
  } catch {
    // A temporary Storage/signing outage must not make the entire field log
    // unavailable. Keep the private object reference so a later poll can retry.
    return record;
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
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
  return sorted(await mapWithConcurrency(
    records,
    8,
    (record) => withSignedImage(record, session.access_token, session.user.id),
  ));
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

  // Do not fetch(data:...) here: Safari on iOS can reject it as "Load failed".
  // Decode the already-compressed data URL locally and send the Blob directly.
  const blob = imageDataUrlToBlob(record.image);
  if (blob.size > 12 * 1024 * 1024) {
    throw new Error("La fotografía supera el límite de 12 MB permitido por el almacenamiento.");
  }
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const mimeType = extension === "jpg" ? "image/jpeg" : blob.type;
  const session = await activeSession();
  // Stable object path makes retries idempotent and avoids orphaning a new file
  // each time the user retries a save after a mobile network interruption.
  const safeRecordId = record.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const path = `${session.user.id}/${safeRecordId}.${extension}`;
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
  }, "subir la fotografía a Supabase Storage", 60_000);
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
  // Keep the display records separate from their private Storage markers.
  // The display copy keeps the current signed URL/data URL for the live UI.
  const displayRecords = update(previous);
  const input = displayRecords.map((record) => preserveExistingPrivateImage(record, previousById.get(record.id)?.payload));
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

  if (changed.some((record) => previousById.has(record.id) && !previousById.get(record.id)?.updated_at)) {
    throw new Error("Actualiza el esquema de Supabase antes de editar observaciones.");
  }
  const upserts = changed.map((record) => {
    const old = previousById.get(record.id);
    return {
      id: record.id,
      payload: record,
      expected_updated_at: old?.updated_at || null,
    };
  });
  const deletes = rows
    .filter((row) => !nextById.has(row.id))
    .map((row) => ({ id: row.id, expected_updated_at: row.updated_at }));

  if (upserts.length || deletes.length) {
    if (deletes.some((row) => !row.expected_updated_at)) {
      throw new Error("Actualiza el esquema de Supabase antes de eliminar observaciones.");
    }
    try {
      await cloudRest<unknown>("rpc/agrovision_records_apply_batch", {
        method: "POST",
        body: JSON.stringify({
          p_project_id: PROJECT_ID,
          p_upserts: upserts,
          p_deletes: deletes,
        }),
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      if (/concurrencia|versión esperada|cambió|ya existe|ya fue eliminada/i.test(message)) {
        throw new Error("Otra sesión modificó esta observación. Recarga la bitácora antes de reintentar.");
      }
      throw reason;
    }
  }
  // The RPC response is the commit boundary. A follow-up SELECT/sign-URL request
  // must not turn a successful write into a visible "Load failed" (and invite a
  // duplicate retry) when mobile Safari briefly loses the network afterwards.
  // The normal cloud poll refreshes signed URLs and concurrent changes shortly.
  return sorted(displayRecords);
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

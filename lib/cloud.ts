import type { FieldRecord } from "./types";
import { mergeRecords } from "./storage";
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

async function cloudFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (init.signal) return fetch(input, init);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export function sessionIdentityChanged(oldValue: string | null, newValue: string | null): boolean {
  if (!oldValue || !newValue) return true;
  try {
    const oldId = JSON.parse(oldValue)?.user?.id;
    const newId = JSON.parse(newValue)?.user?.id;
    return typeof oldId !== "string" || typeof newId !== "string" || oldId !== newId;
  } catch { return true; }
}
export function isCloudConfigured() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }
export function cloudProjectId() { return PROJECT_ID; }

function authHeaders(accessToken?: string) {
  return { apikey: SUPABASE_ANON_KEY, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), "Content-Type": "application/json" };
}
function parseErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["msg", "message", "error_description", "error"]) if (typeof obj[key] === "string" && obj[key]) return obj[key] as string;
  }
  return fallback;
}
async function responseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return { message: text.slice(0, 300) }; }
}
function saveSession(session: CloudSession) {
  try {
    const previous = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as { user?: { id?: string } } | null;
    if (previous?.user?.id && previous.user.id !== session.user.id) signedImageCache.clear();
  } catch { signedImageCache.clear(); }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function clearSession() { localStorage.removeItem(SESSION_KEY); signedImageCache.clear(); }
function readStoredSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudSession>;
    if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string" || typeof parsed.expires_at !== "number" || !parsed.user || typeof parsed.user.id !== "string") { clearSession(); return null; }
    return parsed as CloudSession;
  } catch { return null; }
}
function normaliseSession(data: Record<string, unknown>): CloudSession | null {
  const user = data.user as CloudUser | undefined;
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || !user || typeof user.id !== "string") return null;
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: typeof data.expires_at === "number" ? data.expires_at : Math.floor(Date.now() / 1000) + expiresIn, token_type: typeof data.token_type === "string" ? data.token_type : "bearer", user };
}
function ensureCloudConfigured() {
  if (!isCloudConfigured()) throw new Error("Falta configurar Supabase para habilitar la sincronización en la nube.");
}

export async function cloudSignIn(email: string, password: string) {
  ensureCloudConfigured();
  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ email: email.trim(), password }), cache: "no-store" });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo iniciar sesión."));
  const session = normaliseSession(data as Record<string, unknown>);
  if (!session) throw new Error("El inicio de sesión no devolvió una sesión completa.");
  saveSession(session); return session;
}
export async function cloudSignUp(email: string, password: string) {
  ensureCloudConfigured();
  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/signup`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ email: email.trim(), password }), cache: "no-store" });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo crear la cuenta."));
  const session = normaliseSession((data || {}) as Record<string, unknown>);
  if (session) saveSession(session);
  return { session, data };
}
export async function cloudSignOut() {
  const session = readStoredSession();
  try { if (session && isCloudConfigured()) await cloudFetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: authHeaders(session.access_token), cache: "no-store" }); }
  finally { clearSession(); }
}

let refreshInFlight: Promise<CloudSession | null> | null = null;
async function refreshCloudSession(session: CloudSession): Promise<CloudSession | null> {
  let response: Response;
  try { response = await cloudFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ refresh_token: session.refresh_token }), cache: "no-store" }); }
  catch { throw new Error("No se pudo renovar la sesión por un problema de conexión. Inténtalo nuevamente."); }
  const data = await responseJson(response);
  if (!response.ok) {
    const details = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const code = String(details.error || details.code || details.error_code || "").toLowerCase();
    const message = String(details.msg || details.message || details.error_description || "").toLowerCase();
    const invalid = response.status === 401 || (response.status === 400 && /invalid_grant|refresh_token_not_found|refresh_token_already_used|invalid refresh token/.test(`${code} ${message}`));
    if (invalid) {
      const current = readStoredSession();
      if (current && (current.user.id !== session.user.id || current.refresh_token !== session.refresh_token)) return current;
      if (current) clearSession();
      return null;
    }
    throw new Error(`No se pudo renovar la sesión (${response.status}). Inténtalo nuevamente.`);
  }
  const refreshed = normaliseSession((data || {}) as Record<string, unknown>);
  if (!refreshed) throw new Error("Supabase devolvió una sesión de renovación incompleta. No se eliminó la sesión guardada.");
  const current = readStoredSession();
  if (!current) return null;
  if (current.user.id !== session.user.id || current.refresh_token !== session.refresh_token) return current;
  saveSession(refreshed); return refreshed;
}
export async function getCloudSession(): Promise<CloudSession | null> {
  ensureCloudConfigured();
  const session = readStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  if (!refreshInFlight) refreshInFlight = refreshCloudSession(session).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
async function activeSession() {
  const session = await getCloudSession();
  if (!session) throw new Error("Tu sesión venció. Inicia sesión nuevamente.");
  return session;
}
async function cloudRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await activeSession();
  let response: Response;
  try {
    response = await cloudFetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...authHeaders(session.access_token), ...(init.headers || {}) }, cache: "no-store" });
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`No se pudo consultar la bitácora en Supabase${detail}`);
  }
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, `Error de la base de datos (${response.status}).`));
  return data as T;
}

export type ProjectComparisonTreatment = {
  crop: string; fertilizer: string; dose: string; plantCount: number; memberCount: number; ageMinDays: number | null; ageMaxDays: number | null;
  height: { n: number; meanCm: number | null }; growth: { n: number; meanCmPerDay: number | null; meanPeriodDays: number | null };
  leaves: { n: number; meanCount: number | null }; diameter: { n: number; meanCm: number | null };
  health: { assessed: number; healthy: number; healthyPercent: number | null };
};
export type ProjectComparisonData = {
  projectId: string; generatedAt: string;
  summary: { observations: number; plants: number; members: number; treatments: number };
  treatments: ProjectComparisonTreatment[]; warnings: string[];
  methodology: { measurements: string; growth: string; averages: string; privacy: string };
};
export type PublishedProjectComparison = { payload: ProjectComparisonData; publishedAt: string };
export async function isProjectComparisonAdmin(): Promise<boolean> {
  return (await cloudRest<boolean>("rpc/agrovision_comparison_is_admin", { method: "POST", body: JSON.stringify({ p_project_id: PROJECT_ID }) })) === true;
}
async function withCurrentProjectRecordOwners<T extends { summary: { members: number } }>(data: T): Promise<T> {
  const members = await cloudRest<number>("rpc/agrovision_comparison_record_owner_count", {
    method: "POST",
    body: JSON.stringify({ p_project_id: PROJECT_ID }),
  });
  if (!Number.isSafeInteger(members) || members < 0) {
    throw new Error("Supabase devolvió un conteo inválido de integrantes con registros.");
  }
  return { ...data, summary: { ...data.summary, members } };
}
export async function readProjectComparisonPreview(): Promise<ProjectComparisonData> {
  const data = await cloudRest<ProjectComparisonData>("rpc/agrovision_comparison_preview", { method: "POST", body: JSON.stringify({ p_project_id: PROJECT_ID }) });
  return withCurrentProjectRecordOwners(data);
}
export async function readPublishedProjectComparison(): Promise<PublishedProjectComparison | null> {
  const data = await cloudRest<PublishedProjectComparison | null>("rpc/agrovision_comparison_published", { method: "POST", body: JSON.stringify({ p_project_id: PROJECT_ID }) });
  return data
    ? { ...data, payload: await withCurrentProjectRecordOwners(data.payload) }
    : null;
}
export async function publishProjectComparison(): Promise<PublishedProjectComparison> {
  const data = await cloudRest<PublishedProjectComparison>("rpc/agrovision_comparison_publish", { method: "POST", body: JSON.stringify({ p_project_id: PROJECT_ID }) });
  return { ...data, payload: await withCurrentProjectRecordOwners(data.payload) };
}

async function getCloudRows(): Promise<CloudRecordRow[]> {
  const session = await activeSession();
  const query = new URLSearchParams({ select: "id,owner_id,project_id,payload,created_by,updated_by,updated_at", owner_id: `eq.${session.user.id}`, project_id: `eq.${PROJECT_ID}`, order: "updated_at.desc,id.asc" });
  const rows: CloudRecordRow[] = []; const ids = new Set<string>(); const pageSize = 500;
  for (let offset = 0;;) {
    query.set("limit", String(pageSize)); query.set("offset", String(offset));
    const page = await cloudRest<CloudRecordRow[]>(`agrovision_records?${query}`);
    if (!Array.isArray(page)) throw new Error("La nube devolvió una página inválida.");
    if (!page.length) return rows;
    for (const row of page) { if (ids.has(row.id)) throw new Error("La bitácora cambió durante la lectura. Actualiza para volver a consultar."); ids.add(row.id); }
    rows.push(...page); offset += page.length;
  }
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") { const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`; }
  return JSON.stringify(value) ?? "null";
}
function sorted(records: FieldRecord[]) { return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)); }
function encodePath(path: string) { return path.split("/").map(encodeURIComponent).join("/"); }
async function signedImageUrl(marker: string, accessToken: string, userId: string): Promise<string> {
  const path = marker.slice(PRIVATE_IMAGE_PREFIX.length); const key = `${userId}:${path}`; const cached = signedImageCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) signedImageCache.delete(key);
  const response = await cloudFetch(`${SUPABASE_URL}/storage/v1/object/sign/agrovision-photos/${encodePath(path)}`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }), cache: "no-store" });
  const data = await responseJson(response) as { signedURL?: string; message?: string } | null;
  if (!response.ok || !data?.signedURL) throw new Error(parseErrorMessage(data, "No se pudo obtener acceso a una fotografía de tu bitácora."));
  const url = /^https?:\/\//i.test(data.signedURL) ? data.signedURL : data.signedURL.startsWith("/storage/v1/") ? `${SUPABASE_URL}${data.signedURL}` : `${SUPABASE_URL}/storage/v1${data.signedURL.startsWith("/") ? data.signedURL : `/${data.signedURL}`}`;
  if (signedImageCache.size >= 2000) { const oldest = signedImageCache.keys().next().value; if (oldest) signedImageCache.delete(oldest); }
  signedImageCache.set(key, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS }); return url;
}
async function withSignedImage(record: FieldRecord, token: string, userId: string): Promise<FieldRecord> {
  if (!record.image?.startsWith(PRIVATE_IMAGE_PREFIX)) return record;
  try { return { ...record, image: await signedImageUrl(record.image, token, userId) }; }
  catch { return record; }
}
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (true) { const index = next++; if (index >= items.length) return; results[index] = await mapper(items[index]); } }));
  return results;
}
export async function readCloudRecords(): Promise<FieldRecord[]> {
  const session = await activeSession(); const rows = await getCloudRows(); const records = rows.map(row => row.payload);
  for (const record of records) if (!isRecord({ ...record, image: "" })) throw new Error("La nube contiene un registro inválido. No se modificaron tus datos.");
  return sorted(await mapWithConcurrency(records, 8, record => withSignedImage(record, session.access_token, session.user.id)));
}

function imageDataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("No se pudo preparar una fotografía para subirla a la nube.");
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}
async function uploadImageIfNeeded(record: FieldRecord): Promise<FieldRecord> {
  if (!record.image || record.image.startsWith(PRIVATE_IMAGE_PREFIX)) return record;
  if (/^https:\/\//i.test(record.image)) return record;
  if (record.image.startsWith("/")) return { ...record, image: new URL(record.image, window.location.origin).href };
  if (!record.image.startsWith("data:image/")) throw new Error("Una fotografía tiene un formato que no se puede sincronizar. Vuelve a adjuntarla.");
  const blob = imageDataUrlToBlob(record.image);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const mime = ext === "jpg" ? "image/jpeg" : blob.type;
  const session = await activeSession();
  const path = `${session.user.id}/${record.id}.${ext}`;
  const response = await cloudFetch(`${SUPABASE_URL}/storage/v1/object/agrovision-photos/${encodePath(path)}`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": mime, "x-upsert": "true" }, body: blob, cache: "no-store" });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo guardar la fotografía en la nube."));
  return { ...record, image: `${PRIVATE_IMAGE_PREFIX}${path}` };
}
export function isCloudPhotoUrl(input: string): boolean {
  try { const url = new URL(input); return !!SUPABASE_URL && url.origin === new URL(SUPABASE_URL).origin && url.pathname.startsWith("/storage/v1/object/sign/agrovision-photos/"); }
  catch { return false; }
}
function preserveExistingPrivateImage(record: FieldRecord, previous?: FieldRecord): FieldRecord {
  if (previous?.image?.startsWith(PRIVATE_IMAGE_PREFIX) && record.image?.includes("/storage/v1/object/sign/agrovision-photos/")) return { ...record, image: previous.image };
  return record;
}
export async function mutateCloudRecords(update: (records: FieldRecord[]) => FieldRecord[]): Promise<FieldRecord[]> {
  const rows = await getCloudRows(); const previous = sorted(rows.map(row => row.payload));
  const previousById = new Map(rows.map(row => [row.id, row]));
  const input = update(previous).map(record => preserveExistingPrivateImage(record, previousById.get(record.id)?.payload));
  const ids = new Set<string>();
  for (const record of input) { if (ids.has(record.id)) throw new Error("Hay identificadores repetidos."); ids.add(record.id); if (eligible(record)) validateRecord(record, input); }
  const next: FieldRecord[] = [];
  for (const record of input) next.push(await uploadImageIfNeeded(record));
  const nextById = new Map(next.map(record => [record.id, record]));
  const changed = next.filter(record => { const old = previousById.get(record.id); return !old || stableStringify(old.payload) !== stableStringify(record); });
  if (changed.some(record => previousById.has(record.id) && !previousById.get(record.id)?.updated_at)) throw new Error("Actualiza el esquema de Supabase antes de editar observaciones.");
  const upserts = changed.map(record => ({ id: record.id, payload: record, expected_updated_at: previousById.get(record.id)?.updated_at || null }));
  const deletes = rows.filter(row => !nextById.has(row.id)).map(row => ({ id: row.id, expected_updated_at: row.updated_at }));
  if (upserts.length || deletes.length) {
    if (deletes.some(row => !row.expected_updated_at)) throw new Error("Actualiza el esquema de Supabase antes de eliminar observaciones.");
    try { await cloudRest<unknown>("rpc/agrovision_records_apply_batch", { method: "POST", body: JSON.stringify({ p_project_id: PROJECT_ID, p_upserts: upserts, p_deletes: deletes }) }); }
    catch (reason) { const message = reason instanceof Error ? reason.message : ""; if (/concurrencia|versión esperada|cambió|ya existe|ya fue eliminada/i.test(message)) throw new Error("Otra sesión modificó esta observación. Recarga la bitácora antes de reintentar."); throw reason; }
  }
  // The RPC response confirms persistence. Do not make a second network read
  // after committing: a transient refresh failure must not make a saved entry
  // appear to have failed, and the original image remains visible as a preview.
  return sorted(input);
}

/** Backward-compatible name: cloud mode now treats Supabase as the sole source of truth. */
export async function migrateLocalRecordsToCloud() { return readCloudRecords(); }
export async function mergeBackupIntoCloud(incoming: FieldRecord[]) {
  let added = 0;
  const records = await mutateCloudRecords(current => { const merged = mergeRecords(current, incoming); added = merged.added; return merged.records; });
  return { records, added };
}
export async function cloudRequestPasswordReset(email: string, redirectTo: string): Promise<void> {
  ensureCloudConfigured(); const cleanedEmail = email.trim();
  if (!cleanedEmail) throw new Error("Escribe el correo asociado a tu cuenta.");
  let redirectUrl: URL;
  try { redirectUrl = new URL(redirectTo); } catch { throw new Error("La dirección de recuperación no es válida."); }
  if (typeof window !== "undefined" && redirectUrl.origin !== window.location.origin) throw new Error("La dirección de recuperación debe pertenecer a este sitio.");
  const localDevelopment = redirectUrl.protocol === "http:" && (redirectUrl.hostname === "localhost" || redirectUrl.hostname === "127.0.0.1");
  if (redirectUrl.protocol !== "https:" && !localDevelopment) throw new Error("La dirección de recuperación debe usar HTTPS.");
  const endpoint = new URL(`${SUPABASE_URL}/auth/v1/recover`); endpoint.searchParams.set("redirect_to", redirectUrl.toString());
  const response = await cloudFetch(endpoint.toString(), { method: "POST", headers: authHeaders(), body: JSON.stringify({ email: cleanedEmail }), cache: "no-store" });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo enviar el correo de recuperación. Inténtalo nuevamente."));
}
export async function cloudUpdatePassword(accessToken: string, newPassword: string): Promise<void> {
  ensureCloudConfigured();
  if (!accessToken) throw new Error("El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.");
  if (newPassword.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  const response = await cloudFetch(`${SUPABASE_URL}/auth/v1/user`, { method: "PUT", headers: authHeaders(accessToken), body: JSON.stringify({ password: newPassword }), cache: "no-store" });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo actualizar la contraseña. Solicita un enlace nuevo."));
}

import type { FieldRecord } from "./types";
import { readRecords } from "./storage";

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
  project_id: string;
  payload: FieldRecord;
  created_by: string;
  updated_by: string;
};

const SESSION_KEY = "agrovision-cloud-session-v1";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_AGROVISION_PROJECT_ID || "rabanitos-2026";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

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
  ) {
    return null;
  }

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
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo iniciar sesión."));
  }
  const session = normaliseSession(data as Record<string, unknown>);
  if (!session) throw new Error("El servicio de inicio de sesión devolvió una respuesta incompleta.");
  saveSession(session);
  return session;
}

export async function cloudSignUp(email: string, password: string) {
  ensureCloudConfigured();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: email.trim(), password }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo crear la cuenta."));
  }
  const session = normaliseSession((data || {}) as Record<string, unknown>);
  if (session) saveSession(session);
  return { session, data };
}

export async function cloudSignOut() {
  const session = readStoredSession();
  try {
    if (session && isCloudConfigured()) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
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

  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return session;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: session.refresh_token }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  const refreshed = response.ok
    ? normaliseSession((data || {}) as Record<string, unknown>)
    : null;
  if (!refreshed) {
    clearSession();
    return null;
  }
  saveSession(refreshed);
  return refreshed;
}

export async function cloudHasMembership(session?: CloudSession) {
  const active = await getCloudSession() || session;
  if (!active) return false;
  const query = new URLSearchParams({
    select: "user_id,project_id,member_name",
    user_id: `eq.${active.user.id}`,
    project_id: `eq.${PROJECT_ID}`,
    limit: "1",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/agrovision_members?${query}`, {
    headers: authHeaders(active.access_token),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo verificar el acceso al proyecto."));
  }
  return Array.isArray(data) && data.length > 0;
}

export async function cloudJoinProject(
  inviteCode: string,
  memberName: string,
  session?: CloudSession,
) {
  const active = await getCloudSession() || session;
  if (!active) throw new Error("Inicia sesión antes de unirte al proyecto.");
  const response = await fetch("/api/join-project", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${active.access_token}`,
    },
    body: JSON.stringify({ inviteCode, memberName }),
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo activar el acceso al proyecto."));
  }
}

function ensureCloudConfigured() {
  if (!isCloudConfigured()) {
    throw new Error("Falta configurar Supabase para habilitar la sincronización en la nube.");
  }
}

async function activeSession() {
  const session = await getCloudSession();
  if (!session) throw new Error("Tu sesión venció. Inicia sesión nuevamente.");
  return session;
}

async function cloudRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await activeSession();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...authHeaders(session.access_token),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, `Error de la base de datos (${response.status}).`));
  }
  return data as T;
}

async function getCloudRows(): Promise<CloudRecordRow[]> {
  const query = new URLSearchParams({
    select: "id,project_id,payload,created_by,updated_by",
    project_id: `eq.${PROJECT_ID}`,
    order: "updated_at.desc",
  });
  return cloudRest<CloudRecordRow[]>(`agrovision_records?${query}`);
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
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

export async function readCloudRecords(): Promise<FieldRecord[]> {
  const rows = await getCloudRows();
  return sorted(rows.map((row) => row.payload).filter((record) => record && typeof record.id === "string"));
}

async function uploadImageIfNeeded(record: FieldRecord): Promise<FieldRecord> {
  if (!record.image || /^https:\/\//i.test(record.image)) return record;
  if (record.image.startsWith("/")) {
    // La fotografía de muestra de la aplicación es un recurso del sitio, no
    // una imagen privada del usuario. Guarda su URL absoluta para otros equipos.
    return { ...record, image: new URL(record.image, window.location.origin).href };
  }
  if (!record.image.startsWith("data:image/")) {
    throw new Error("Una fotografía tiene un formato que no se puede sincronizar. Vuelve a adjuntarla.");
  }

  const imageResponse = await fetch(record.image);
  if (!imageResponse.ok) throw new Error("No se pudo preparar una fotografía para subirla a la nube.");
  const blob = await imageResponse.blob();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const mimeType = extension === "jpg" ? "image/jpeg" : blob.type;
  const unique = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${PROJECT_ID}/${record.id}-${unique}.${extension}`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const session = await activeSession();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/agrovision-photos/${encodedPath}`, {
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
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo guardar la fotografía en la nube."));
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/agrovision-photos/${encodedPath}`;
  return { ...record, image: publicUrl };
}

export async function mutateCloudRecords(
  update: (records: FieldRecord[]) => FieldRecord[],
): Promise<FieldRecord[]> {
  const session = await activeSession();
  const rows = await getCloudRows();
  const previous = sorted(rows.map((row) => row.payload));
  const nextInput = update(previous);
  const next: FieldRecord[] = [];

  for (const record of nextInput) {
    next.push(await uploadImageIfNeeded(record));
  }

  const previousById = new Map(rows.map((row) => [row.id, row]));
  const nextIds = new Set(next.map((record) => record.id));
  const changed = next.filter((record) => {
    const old = previousById.get(record.id);
    return !old || stableStringify(old.payload) !== stableStringify(record);
  });

  if (changed.length) {
    const payload = changed.map((record) => {
      const old = previousById.get(record.id);
      return {
        id: record.id,
        project_id: PROJECT_ID,
        payload: record,
        created_by: old?.created_by || session.user.id,
        updated_by: session.user.id,
      };
    });
    await cloudRest<unknown>("agrovision_records?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
  }

  const removed = rows.filter((row) => !nextIds.has(row.id));
  for (const row of removed) {
    const query = new URLSearchParams({
      id: `eq.${row.id}`,
      project_id: `eq.${PROJECT_ID}`,
    });
    await cloudRest<unknown>(`agrovision_records?${query}`, { method: "DELETE" });
  }

  return sorted(next);
}

/** Merges real records from this browser into the shared project once a user signs in. */
export async function migrateLocalRecordsToCloud() {
  const migrationKey = `agrovision-cloud-migrated:${PROJECT_ID}`;
  try {
    if (localStorage.getItem(migrationKey) === "1") {
      return readCloudRecords();
    }
  } catch {
    // Continue without the marker if localStorage is unavailable.
  }

  let local: FieldRecord[] = [];
  try {
    local = (await readRecords()) || [];
  } catch {
    // Cloud mode must still work even if this device has no local database.
  }
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

  // Only mark migration after cloud reads/uploads succeed. This prevents a deleted
  // cloud record from being re-imported from the stale local IndexedDB on every login.
  try {
    localStorage.setItem(migrationKey, "1");
  } catch {}
  return result;
}

export async function mergeBackupIntoCloud(incoming: FieldRecord[]) {
  return mutateCloudRecords((current) => {
    const byId = new Map(current.map((record) => [record.id, record]));
    for (const record of incoming) {
      if (!byId.has(record.id)) byId.set(record.id, record);
    }
    return [...byId.values()];
  });
}

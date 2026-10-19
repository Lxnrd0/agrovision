
type CloudRecordRow = {
id: string;
  owner_id: string;
project_id: string;
payload: FieldRecord;
created_by: string;
updated_by: string;
};

const SESSION_KEY = "agrovision-cloud-session-v1";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_AGROVISION_PROJECT_ID || "rabanitos-2026";
const SESSION_KEY = "agrovision-cloud-session-v2";
const PROJECT_ID = process.env.NEXT_PUBLIC_AGROVISION_PROJECT_ID || "rabanitos-2026";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const PRIVATE_IMAGE_PREFIX = "supabase-storage://agrovision-photos/";

export function isCloudConfigured() {
return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
@@ -96,9 +97,7 @@ function normaliseSession(data: Record<string, unknown>): CloudSession | null {
typeof data.refresh_token !== "string" ||
!user ||
typeof user.id !== "string"
  ) {
    return null;
  }
  ) return null;

const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
const expiresAt = typeof data.expires_at === "number"
@@ -123,11 +122,9 @@ export async function cloudSignIn(email: string, password: string) {
cache: "no-store",
});
const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo iniciar sesión."));
  }
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo iniciar sesión."));
const session = normaliseSession(data as Record<string, unknown>);
  if (!session) throw new Error("El servicio de inicio de sesión devolvió una respuesta incompleta.");
  if (!session) throw new Error("El inicio de sesión no devolvió una sesión completa.");
saveSession(session);
return session;
}
@@ -141,9 +138,7 @@ export async function cloudSignUp(email: string, password: string) {
cache: "no-store",
});
const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo crear la cuenta."));
  }
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo crear la cuenta."));
const session = normaliseSession((data || {}) as Record<string, unknown>);
if (session) saveSession(session);
return { session, data };
@@ -168,10 +163,7 @@ export async function getCloudSession(): Promise<CloudSession | null> {
ensureCloudConfigured();
const session = readStoredSession();
if (!session) return null;

  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) {
    return session;
  }
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;

const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
method: "POST",
@@ -180,9 +172,7 @@ export async function getCloudSession(): Promise<CloudSession | null> {
cache: "no-store",
});
const data = await responseJson(response);
  const refreshed = response.ok
    ? normaliseSession((data || {}) as Record<string, unknown>)
    : null;
  const refreshed = response.ok ? normaliseSession((data || {}) as Record<string, unknown>) : null;
if (!refreshed) {
clearSession();
return null;
@@ -191,52 +181,8 @@ export async function getCloudSession(): Promise<CloudSession | null> {
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
  if (!isCloudConfigured()) throw new Error("Falta configurar Supabase para habilitar la sincronización en la nube.");
}

async function activeSession() {
@@ -256,15 +202,15 @@ async function cloudRest<T>(path: string, init: RequestInit = {}): Promise<T> {
cache: "no-store",
});
const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, `Error de la base de datos (${response.status}).`));
  }
  if (!response.ok) throw new Error(parseErrorMessage(data, `Error de la base de datos (${response.status}).`));
return data as T;
}

async function getCloudRows(): Promise<CloudRecordRow[]> {
  const session = await activeSession();
const query = new URLSearchParams({
    select: "id,project_id,payload,created_by,updated_by",
    select: "id,owner_id,project_id,payload,created_by,updated_by",
    owner_id: `eq.${session.user.id}`,
project_id: `eq.${PROJECT_ID}`,
order: "updated_at.desc",
});
@@ -281,21 +227,50 @@ function stableStringify(value: unknown): string {
}

function sorted(records: FieldRecord[]) {
  return [...records].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  return [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function signedImageUrl(marker: string, accessToken: string): Promise<string> {
  const path = marker.slice(PRIVATE_IMAGE_PREFIX.length);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/agrovision-photos/${encodePath(path)}`, {
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
  return sorted(rows.map((row) => row.payload).filter((record) => record && typeof record.id === "string"));
  const records = rows.map((row) => row.payload).filter((record) => record && typeof record.id === "string");
  return sorted(await Promise.all(records.map((record) => withSignedImage(record, session.access_token))));
}

async function uploadImageIfNeeded(record: FieldRecord): Promise<FieldRecord> {
  if (!record.image || /^https:\/\//i.test(record.image)) return record;
  if (!record.image || record.image.startsWith(PRIVATE_IMAGE_PREFIX)) return record;
  if (/^https:\/\//i.test(record.image)) return record;
if (record.image.startsWith("/")) {
    // La fotografía de muestra de la aplicación es un recurso del sitio, no
    // una imagen privada del usuario. Guarda su URL absoluta para otros equipos.
return { ...record, image: new URL(record.image, window.location.origin).href };
}
if (!record.image.startsWith("data:image/")) {
@@ -307,13 +282,10 @@ async function uploadImageIfNeeded(record: FieldRecord): Promise<FieldRecord> {
const blob = await imageResponse.blob();
const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
const mimeType = extension === "jpg" ? "image/jpeg" : blob.type;
  const unique = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${PROJECT_ID}/${record.id}-${unique}.${extension}`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const unique = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const session = await activeSession();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/agrovision-photos/${encodedPath}`, {
  const path = `${session.user.id}/${record.id}-${unique}.${extension}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/agrovision-photos/${encodePath(path)}`, {
method: "POST",
headers: {
apikey: SUPABASE_ANON_KEY,
@@ -325,28 +297,28 @@ async function uploadImageIfNeeded(record: FieldRecord): Promise<FieldRecord> {
cache: "no-store",
});
const data = await responseJson(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(data, "No se pudo guardar la fotografía en la nube."));
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/agrovision-photos/${encodedPath}`;
  return { ...record, image: publicUrl };
  if (!response.ok) throw new Error(parseErrorMessage(data, "No se pudo guardar la fotografía en la nube."));
  return { ...record, image: `${PRIVATE_IMAGE_PREFIX}${path}` };
}

function preserveExistingPrivateImage(record: FieldRecord, previous?: FieldRecord): FieldRecord {
  if (
    previous?.image?.startsWith(PRIVATE_IMAGE_PREFIX) &&
    record.image?.includes("/storage/v1/object/sign/agrovision-photos/")
  ) return { ...record, image: previous.image };
  return record;
}

export async function mutateCloudRecords(
  update: (records: FieldRecord[]) => FieldRecord[],
): Promise<FieldRecord[]> {
export async function mutateCloudRecords(update: (records: FieldRecord[]) => FieldRecord[]): Promise<FieldRecord[]> {
const session = await activeSession();
const rows = await getCloudRows();
const previous = sorted(rows.map((row) => row.payload));
  const nextInput = update(previous);
  const previousById = new Map(rows.map((row) => [row.id, row]));
  const input = update(previous).map((record) => preserveExistingPrivateImage(record, previousById.get(record.id)?.payload));
const next: FieldRecord[] = [];
  for (const record of input) next.push(await uploadImageIfNeeded(record));

  for (const record of nextInput) {
    next.push(await uploadImageIfNeeded(record));
  }

  const previousById = new Map(rows.map((row) => [row.id, row]));
  const nextIds = new Set(next.map((record) => record.id));
  const nextById = new Map(next.map((record) => [record.id, record]));
const changed = next.filter((record) => {
const old = previousById.get(record.id);
return !old || stableStringify(old.payload) !== stableStringify(record);
@@ -357,6 +329,7 @@ export async function mutateCloudRecords(
const old = previousById.get(record.id);
return {
id: record.id,
        owner_id: session.user.id,
project_id: PROJECT_ID,
payload: record,
created_by: old?.created_by || session.user.id,
@@ -370,35 +343,30 @@ export async function mutateCloudRecords(
});
}

  const removed = rows.filter((row) => !nextIds.has(row.id));
  for (const row of removed) {
    const query = new URLSearchParams({
      id: `eq.${row.id}`,
      project_id: `eq.${PROJECT_ID}`,
    });
    await cloudRest<unknown>(`agrovision_records?${query}`, { method: "DELETE" });
  for (const row of rows) {
    if (!nextById.has(row.id)) {
      const query = new URLSearchParams({ id: `eq.${row.id}`, owner_id: `eq.${session.user.id}`, project_id: `eq.${PROJECT_ID}` });
      await cloudRest<unknown>(`agrovision_records?${query}`, { method: "DELETE" });
    }
}

  return sorted(next);
  return readCloudRecords();
}

/** Merges real records from this browser into the shared project once a user signs in. */
/** Importa en la cuenta iniciada solo las observaciones reales de este navegador. */
export async function migrateLocalRecordsToCloud() {
  const migrationKey = `agrovision-cloud-migrated:${PROJECT_ID}`;
  const session = await activeSession();
  const migrationKey = `agrovision-cloud-migrated:${PROJECT_ID}:${session.user.id}`;
  const localOwnerKey = "agrovision-local-records-owner-v1";
try {
    if (localStorage.getItem(migrationKey) === "1") {
      return readCloudRecords();
    }
  } catch {
    // Continue without the marker if localStorage is unavailable.
  }
    if (localStorage.getItem(migrationKey) === "1") return readCloudRecords();
    const localOwner = localStorage.getItem(localOwnerKey);
    // Never copy one account's browser-only records into a different account.
    if (localOwner && localOwner !== session.user.id) return readCloudRecords();
    if (!localOwner) localStorage.setItem(localOwnerKey, session.user.id);
  } catch {}

let local: FieldRecord[] = [];
  try {
    local = (await readRecords()) || [];
  } catch {
    // Cloud mode must still work even if this device has no local database.
  }
  try { local = (await readRecords()) || []; } catch {}
const realLocal = local.filter((record) => record.source !== "demo");
const cloud = await readCloudRecords();
const ids = new Set(cloud.map((record) => record.id));
@@ -409,21 +377,14 @@ export async function migrateLocalRecordsToCloud() {
return [...current, ...additions.filter((record) => !currentIds.has(record.id))];
})
: cloud;

  // Only mark migration after cloud reads/uploads succeed. This prevents a deleted
  // cloud record from being re-imported from the stale local IndexedDB on every login.
  try {
    localStorage.setItem(migrationKey, "1");
  } catch {}
  try { localStorage.setItem(migrationKey, "1"); } catch {}
return result;
}

export async function mergeBackupIntoCloud(incoming: FieldRecord[]) {
return mutateCloudRecords((current) => {
const byId = new Map(current.map((record) => [record.id, record]));
    for (const record of incoming) {
      if (!byId.has(record.id)) byId.set(record.id, record);
    }
    for (const record of incoming) if (!byId.has(record.id)) byId.set(record.id, record);
return [...byId.values()];
});
}

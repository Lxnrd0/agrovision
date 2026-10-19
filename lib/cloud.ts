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
  owner_id: string;
  project_id: string;
  payload: FieldRecord;
  created_by: string;
  updated_by: string;
};

const SESSION_KEY = "agrovision-cloud-session-v2";
const PROJECT_ID = process.env.NEXT_PUBLIC_AGROVISION_PROJECT_ID || "rabanitos-2026";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const PRIVATE_IMAGE_PREFIX = "supabase-storage://agrovision-photos/";

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

import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { readRecords, writeRecords } from "../lib/storage";
import type { FieldRecord } from "../lib/types";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
}, configurable: true });
memory.set("agrovision-cloud-session-v2", JSON.stringify({ access_token: "test-token", refresh_token: "test-refresh",
  expires_at: Date.now() / 1000 + 3600, user: { id: "owner" } }));
let cloud: typeof import("../lib/cloud");
test.before(async () => { cloud = await import("../lib/cloud"); });
const fixture: FieldRecord = { id: "a", plantId: "P01", sowingDate: "2026-10-01", date: "2026-10-10",
  crop: "Rabanito", collaborator: "Ana", zone: "A", fertilizer: "Humus", dose: "1 g/planta",
  heightCm: 10, leafCount: 5, diameterCm: 2, bulbColor: "Rojo", leafColor: "Verde", health: "Sano",
  confidence: 0, observations: [], recommendations: [], limitations: [], image: "", source: "manual",
  createdAt: "2026-10-10T12:00:00Z" };
function row(record: FieldRecord) {
  return { id: record.id, owner_id: "owner", project_id: "rabanitos-2026", payload: record,
    created_by: "owner", updated_by: "owner", updated_at: "2026-10-10T12:00:00Z" };
}
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; });

test("cloud restore writes only cloud, awaits completion, and excludes local records", async () => {
  await writeRecords([{ ...fixture, id: "private-local" }]);
  let rows: ReturnType<typeof row>[] = [];
  globalThis.fetch = async (_input, init) => {
    assert.ok(init?.signal, "cloud calls have a timeout");
    if (init?.method === "POST") rows.push(row(JSON.parse(String(init.body)) .payload));
    return Response.json(init?.method === "POST" ? null : rows.slice(Number(new URL(String(_input)).searchParams.get("offset"))));
  };
  const result = await cloud.mergeBackupIntoCloud([fixture]);
  assert.equal(result.added, 1);
  assert.deepEqual(result.records.map(r => r.id), ["a"]);
  assert.deepEqual((await readRecords())?.map(r => r.id), ["private-local"]);
});
test("cloud restore propagates provider failures instead of reporting success", async () => {
  globalThis.fetch = async (_input, init) => init?.method === "POST"
    ? Response.json({ message: "write denied" }, { status: 403 }) : Response.json([]);
  await assert.rejects(cloud.mergeBackupIntoCloud([fixture]), /write denied/);
});
test("cloud reads paginate beyond the default row limit", async () => {
  const all = Array.from({ length: 1001 }, (_, i) => row({ ...fixture, id: String(i) }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    return Response.json(all.slice(offset, offset + limit));
  };
  assert.equal((await cloud.readCloudRecords()).length, 1001);
});
test("cloud edit detects concurrent changes using conditional timestamp", async () => {
  globalThis.fetch = async (input, init) => {
    if (init?.method === "PATCH") {
      assert.equal(new URL(String(input)).searchParams.get("updated_at"), "eq.2026-10-10T12:00:00Z");
      return Response.json([]); // Another device has already changed it.
    }
    return Response.json(Number(new URL(String(input)).searchParams.get("offset")) ? [] : [row(fixture)]);
  };
  await assert.rejects(cloud.mutateCloudRecords(rows => rows.map(r => ({ ...r, collaborator: "Bob" }))), /Otra sesión/);
});
test("backup only permits photo signing paths from configured Supabase", () => {
  assert.equal(cloud.isCloudPhotoUrl("https://test.supabase.co/storage/v1/object/sign/agrovision-photos/owner/a?token=x"), true);
  assert.equal(cloud.isCloudPhotoUrl("https://evil.test/storage/v1/object/sign/agrovision-photos/a"), false);
  assert.equal(cloud.isCloudPhotoUrl("https://test.supabase.co/auth/v1/user"), false);
});

test("cross-tab account changes invalidate the dashboard, token refresh keeps drafts", () => {
  const session = (id: string, token: string) => JSON.stringify({ user: { id }, access_token: token });
  assert.equal(cloud.sessionIdentityChanged(session("a", "one"), session("b", "two")), true);
  assert.equal(cloud.sessionIdentityChanged(session("a", "one"), null), true);
  assert.equal(cloud.sessionIdentityChanged(session("a", "one"), session("a", "two")), false);
  assert.equal(cloud.sessionIdentityChanged("broken", session("a", "two")), true);
});

test("cloud reads all rows when the server caps pages below the requested size", async () => {
  const all = Array.from({ length: 235 }, (_, i) => row({ ...fixture, id: String(i) }));
  globalThis.fetch = async (input) => {
    const offset = Number(new URL(String(input)).searchParams.get("offset"));
    return Response.json(all.slice(offset, offset + 100));
  };
  assert.equal((await cloud.readCloudRecords()).length, 235);
});

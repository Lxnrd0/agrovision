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
    const url = new URL(String(_input));
    if (url.pathname.endsWith("/rpc/agrovision_records_apply_batch") && init?.method === "POST") {
      const batch = JSON.parse(String(init.body));
      for (const item of batch.p_upserts) rows.push(row(item.payload));
      return Response.json({ upserted: batch.p_upserts.length, deleted: batch.p_deletes.length });
    }
    return Response.json(rows.slice(Number(url.searchParams.get("offset"))));
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
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rpc/agrovision_records_apply_batch") && init?.method === "POST") {
      return Response.json({ message: "Conflicto de concurrencia: una observación cambió." }, { status: 400 });
    }
    return Response.json(Number(url.searchParams.get("offset")) ? [] : [row(fixture)]);
  };
  await assert.rejects(cloud.mutateCloudRecords(rows => rows.map(r => ({ ...r, collaborator: "Bob" }))), /Otra sesión/);
});
test("backup only permits photo signing paths from configured Supabase", () => {
  assert.equal(cloud.isCloudPhotoUrl("https://test.supabase.co/storage/v1/object/sign/agrovision-photos/owner/a?token=x"), true);
  assert.equal(cloud.isCloudPhotoUrl("https://evil.test/storage/v1/object/sign/agrovision-photos/a"), false);
  assert.equal(cloud.isCloudPhotoUrl("https://test.supabase.co/auth/v1/user"), false);
});

test("signed private photo URLs are cached per user and reused while valid", async () => {
  const original = globalThis.fetch;
  const photoRecord = { ...fixture, image: "supabase-storage://agrovision-photos/owner/photo.jpg" };
  let signCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes("/storage/v1/object/sign/")) {
      signCalls++;
      return Response.json({ signedURL: "/storage/v1/object/sign/agrovision-photos/owner/photo.jpg?token=signed" });
    }
    if (url.pathname.endsWith("/rest/v1/agrovision_records")) return Response.json([row(photoRecord)]);
    throw new Error(`Unexpected request: ${url.pathname} ${init?.method || "GET"}`);
  };
  try {
    const first = await cloud.readCloudRecords();
    const second = await cloud.readCloudRecords();
    assert.match(first[0].image, /token=signed/);
    assert.equal(second[0].image, first[0].image);
    assert.equal(signCalls, 1);
  } finally { globalThis.fetch = original; }
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

test("mobile photo upload decodes data URLs locally and uses a stable Supabase Storage path", async () => {
  const photo = { ...fixture, id: "photo-record-1", image: "data:image/jpeg;base64,/9j/2Q==" };
  let uploadedBlob: Blob | null = null;
  let storagePath = "";
  let restReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.notEqual(url.protocol, "data:", "the browser must not fetch data URLs");
    if (url.pathname.endsWith("/rest/v1/agrovision_records") && (!init?.method || init.method === "GET")) {
      restReads += 1;
      return Response.json([]);
    }
    if (url.pathname.includes("/storage/v1/object/agrovision-photos/")) {
      storagePath = url.pathname;
      uploadedBlob = init?.body as Blob;
      return Response.json({ Key: "uploaded" });
    }
    if (url.pathname.endsWith("/rpc/agrovision_records_apply_batch")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_upserts[0].payload.image, "supabase-storage://agrovision-photos/owner/photo-record-1.jpg");
      return Response.json({ upserted: 1, deleted: 0 });
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const saved = await cloud.mutateCloudRecords(() => [photo]);
  assert.equal(saved[0].id, photo.id);
  assert.equal(saved[0].image, photo.image, "keep the local preview visible after a successful save");
  assert.ok(uploadedBlob instanceof Blob);
  assert.equal(uploadedBlob?.type, "image/jpeg");
  assert.match(storagePath, /photo-record-1\.jpg$/);
  assert.equal(restReads, 1, "do not issue a second read after the write has committed");
});

test("a successful cloud commit is not reported as failed by a post-commit refresh", async () => {
  let committed = false;
  let recordReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rest/v1/agrovision_records")) {
      recordReads += 1;
      return Response.json([]);
    }
    if (url.pathname.endsWith("/rpc/agrovision_records_apply_batch")) {
      committed = true;
      return Response.json({ upserted: 1, deleted: 0 });
    }
    if (committed) throw new TypeError("Load failed");
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const saved = await cloud.mutateCloudRecords(() => [{ ...fixture, id: "committed-once" }]);
  assert.equal(saved[0].id, "committed-once");
  assert.equal(committed, true);
  assert.equal(recordReads, 1);
});

test("network errors are translated into a useful Supabase message", async () => {
  globalThis.fetch = async () => { throw new TypeError("Load failed"); };
  await assert.rejects(
    cloud.readCloudRecords(),
    /No se pudo consultar la bitácora en Supabase.*Load failed/,
  );
});


test("a temporary private-photo signing failure does not block loading the observation", async () => {
  const photoRecord = { ...fixture, image: "supabase-storage://agrovision-photos/owner/photo.jpg" };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/rest/v1/agrovision_records")) return Response.json([row(photoRecord)]);
    if (url.pathname.includes("/storage/v1/object/sign/")) throw new TypeError("Load failed");
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const records = await cloud.readCloudRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].id, photoRecord.id);
  assert.equal(records[0].image, photoRecord.image, "keep the private storage reference so a later refresh can retry");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/hardening-1.2.1.sql"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const preflight = readFileSync(join(root, "supabase/preflight-hardening-1.2.1.sql"), "utf8");
const cloud = readFileSync(join(root, "lib/cloud.ts"), "utf8");
const reportForm = readFileSync(join(root, "components/report-form.tsx"), "utf8");
const serviceWorker = readFileSync(join(root, "public/sw.js"), "utf8");

test("hardening migration preserves the known CRUD policies and rejects unknown policy sets", () => {
  for (const name of ["agrovision_records_select", "agrovision_records_insert", "agrovision_records_update", "agrovision_records_delete"]) {
    assert.ok(migration.includes(name), `missing supported policy ${name}`);
  }
  assert.match(migration, /elsif v_count = 4 and v_expected = 4 then/);
  assert.match(migration, /Conjunto de políticas RLS no reconocido/);
  assert.doesNotMatch(migration, /drop policy if exists agrovision_records_(select|insert|update|delete)/i);
});

test("membership migration keeps the current primary key and adds project-scoped uniqueness", () => {
  assert.match(migration, /No borrar duplicados ni cambiar la PK/i);
  assert.match(migration, /create unique index agrovision_members_project_user_uidx/i);
  assert.doesNotMatch(migration, /drop constraint[^;]*agrovision_members_pkey/i);
  assert.doesNotMatch(migration, /add constraint[^;]*primary key/i);
});

test("member table is not directly exposed to anon or authenticated", () => {
  assert.match(migration, /revoke all on table public\.agrovision_members from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant select on public\.agrovision_members to authenticated/i);
});

test("batch RPC is invoker-secured and only executable by authenticated users", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.agrovision_records_apply_batch\(text, jsonb, jsonb\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.agrovision_records_apply_batch\(text, jsonb, jsonb\) to authenticated/i);
  assert.match(migration, /r\.updated_at = v_item\.expected_updated_at/i);
});

test("CI runs on fix branches and can be started manually without merging main", () => {
  assert.match(workflow, /hardening\/\*\*/);
  assert.match(workflow, /fix\/\*\*/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /node-version: "24"/);
});

test("preflight is read-only and checks the live schema shape", () => {
  assert.match(preflight, /pg_policies/);
  assert.match(preflight, /pg_constraint/);
  assert.match(preflight, /has_table_privilege/);
  assert.doesNotMatch(preflight, /\b(insert|update|delete|create|alter|drop)\s+(into|table|policy|function|trigger|index)/i);
});


test("mobile cloud photo upload decodes data URLs without fetch(data:)", () => {
  assert.match(cloud, /function imageDataUrlToBlob/);
  assert.doesNotMatch(cloud, /fetch\(record\.image\)/);
  assert.match(cloud, /subir la fotografía a Supabase Storage/);
  assert.match(cloud, /const path = `\$\{session\.user\.id\}\/\$\{safeRecordId\}\.\$\{extension\}`/);
});

test("a committed write is not followed by a read that can falsely report failure", () => {
  assert.match(cloud, /return sorted\(displayRecords\)/);
  assert.match(reportForm, /submissionId\.current \?\? \(submissionId\.current = crypto\.randomUUID\(\)\)/);
});

test("private photo signing failures do not block loading the whole field log", () => {
  assert.match(cloud, /catch \{[\s\S]*?Keep the private object reference/);
  assert.match(serviceWorker, /agrovision-v6/);
});

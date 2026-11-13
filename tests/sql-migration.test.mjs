import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/hardening-1.2.1.sql"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const preflight = readFileSync(join(root, "supabase/preflight-hardening-1.2.1.sql"), "utf8");

test("hardening migration preserves existing CRUD RLS policies", () => {
  for (const name of ["agrovision_records_select", "agrovision_records_insert", "agrovision_records_update", "agrovision_records_delete"]) {
    assert.ok(migration.includes(name), `missing compatibility policy ${name}`);
  }
  assert.match(migration, /elsif v_count = 4 and v_expected = 4 then/);
  assert.doesNotMatch(migration, /drop policy if exists agrovision_records_(select|insert|update|delete)/i);
});

test("hardening migration does not change the existing members primary key", () => {
  assert.doesNotMatch(migration, /drop constraint[^;]*agrovision_members_pkey/i);
  assert.doesNotMatch(migration, /add constraint[^;]*primary key/i);
  assert.match(
    migration,
    /create unique index agrovision_members_project_user_uidx\s+on public\.agrovision_members\s*\(project_id,\s*user_id\)/i,
  );
});

test("hardening migration keeps member table direct access revoked", () => {
  assert.match(migration, /revoke all on table public\.agrovision_members from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant select on public\.agrovision_members to authenticated/i);
});

test("CI runs on the hardening branch without merging into main", () => {
  assert.match(workflow, /hardening\/\*\*/);
  assert.match(workflow, /node-version: "24"/);
  assert.match(workflow, /workflow_dispatch/);
});

test("preflight is read-only and inspects the existing production shape", () => {
  assert.match(preflight, /pg_policies/);
  assert.match(preflight, /pg_constraint/);
  assert.match(preflight, /has_table_privilege/);
  assert.doesNotMatch(preflight, /\b(insert|update|delete|create|alter|drop)\s+(into|table|policy|function|trigger|index)/i);
});

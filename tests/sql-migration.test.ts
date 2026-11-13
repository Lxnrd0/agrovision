import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hardening = readFileSync(resolve(root, "supabase/hardening-1.2.1.sql"), "utf8");
const registerMember = readFileSync(resolve(root, "supabase/registrar-integrante.sql"), "utf8");
const comparison = readFileSync(resolve(root, "supabase/comparativa-equipo.sql"), "utf8");

test("hardening migration is transactional and preserves data rows", () => {
  assert.match(hardening, /\bbegin;\s*set local/i);
  assert.match(hardening, /\bcommit;/i);
  assert.doesNotMatch(hardening, /\btruncate\s+table\b/i);
  assert.doesNotMatch(hardening, /\bdelete\s+from\s+public\.agrovision_members\b/i);
  assert.doesNotMatch(hardening, /\bdelete\s+from\s+public\.agrovision_records\s*;/i);
  assert.doesNotMatch(hardening, /drop\s+table\s+public\.agrovision_(members|records)\b/i);
});

test("hardening migration replaces known legacy RLS policies and aborts on unknown ones", () => {
  for (const name of [
    "Users can delete own records",
    "Users can insert own records",
    "Users can read own records",
    "Users can update own records",
  ]) {
    assert.ok(hardening.includes(`drop policy if exists \"${name}\"`));
  }
  assert.match(hardening, /Hay políticas RLS no reconocidas/);
  assert.match(hardening, /create policy agrovision_records_select/);
  assert.match(hardening, /create policy agrovision_records_insert/);
  assert.match(hardening, /create policy agrovision_records_update/);
  assert.match(hardening, /create policy agrovision_records_delete/);
});

test("membership migration supports project-scoped composite primary key", () => {
  assert.match(hardening, /primary key \(project_id, user_id\)/i);
  assert.match(hardening, /claves foráneas que dependen de la PK actual/i);
  assert.match(hardening, /agrovision_is_project_member/);
});

test("batch RPC is invoker-secured and granted only to authenticated", () => {
  assert.match(hardening, /security invoker/i);
  assert.match(hardening, /revoke all on function public\.agrovision_records_apply_batch\(text, jsonb, jsonb\) from public, anon/i);
  assert.match(hardening, /grant execute on function public\.agrovision_records_apply_batch\(text, jsonb, jsonb\) to authenticated/i);
  assert.match(hardening, /r\.updated_at = v_item\.expected_updated_at/i);
});

test("member registration does not overwrite an existing member", () => {
  assert.match(registerMember, /on conflict \(project_id, user_id\) do nothing/i);
  assert.doesNotMatch(registerMember, /do update\s+set member_name/i);
  assert.match(registerMember, /No se modificó su nombre ni su fecha de ingreso/);
});

test("comparison migration no longer drops the historical trigger function", () => {
  assert.match(comparison, /drop trigger if exists agrovision_comparison_register_member/);
  assert.match(comparison, /requiere PK \(project_id, user_id\)/);
  assert.doesNotMatch(comparison, /create unique index if not exists agrovision_members_project_user_uidx/i);
  assert.doesNotMatch(comparison, /drop function if exists public\.agrovision_comparison_register_member/);
});

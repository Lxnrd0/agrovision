import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hardening = readFileSync(resolve(root, "supabase/hardening-1.2.1.sql"), "utf8");
const registerMember = readFileSync(resolve(root, "supabase/registrar-integrante.sql"), "utf8");
const comparison = readFileSync(resolve(root, "supabase/comparativa-equipo.sql"), "utf8");
const recordOwnerCount = readFileSync(resolve(root, "supabase/actualizar-integrantes-con-registros.sql"), "utf8");

test("hardening migration is transactional and preserves data rows", () => {
  assert.match(hardening, /^\s*begin;/im);
  assert.match(hardening, /^\s*commit;/im);
  assert.doesNotMatch(hardening, /\btruncate\s+table\b/i);
  assert.doesNotMatch(hardening, /\bdelete\s+from\s+public\.agrovision_members\b/i);
  assert.doesNotMatch(hardening, /\bdelete\s+from\s+public\.agrovision_records\s*;/i);
  assert.doesNotMatch(hardening, /drop\s+table\s+public\.agrovision_(members|records)\b/i);
});

test("hardening accepts safe CRUD RLS policies and rejects unsafe or unknown policies", () => {
  for (const name of [
    "agrovision_records_select",
    "agrovision_records_insert",
    "agrovision_records_update",
    "agrovision_records_delete",
  ]) {
    assert.ok(hardening.includes(name));
  }
  assert.match(hardening, /elsif v_count = 4 and v_expected = 4 then/i);
  assert.match(hardening, /if v_unsafe is not null then\s+raise exception 'Las políticas RLS existentes no coinciden con las condiciones seguras esperadas:/i);
  assert.match(hardening, /else\s+raise exception 'Conjunto de políticas RLS no reconocido/i);
});

test("membership migration preserves the existing primary key and enforces project-scoped uniqueness", () => {
  assert.match(hardening, /sin reconstruir la tabla ni cambiar su PK/i);
  assert.doesNotMatch(hardening, /add constraint[^;]*primary key/i);
  assert.match(
    hardening,
    /create unique index agrovision_members_project_user_uidx\s+on public\.agrovision_members\s*\(project_id,\s*user_id\)/i,
  );
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
});

test("comparison migration removes the historical auto-registration trigger and function", () => {
  assert.match(comparison, /drop trigger if exists agrovision_comparison_register_member/);
  assert.match(
    comparison,
    /create unique index if not exists agrovision_members_project_user_uidx\s+on public\.agrovision_members\s*\(project_id,\s*user_id\)/i,
  );
  assert.match(comparison, /drop function if exists public\.agrovision_comparison_register_member/);
});

test("comparison member summaries count distinct record owners in the active project", () => {
  assert.equal(
    (comparison.match(/count\(distinct r\.owner_id\)::integer\s+from public\.agrovision_records r\s+where r\.project_id = p_project_id/gi) ?? []).length,
    3,
  );
  assert.match(comparison, /jsonb_set\(\s*p\.payload,\s*'\{summary,members\}'/i);
  assert.doesNotMatch(
    comparison,
    /\(select count\(\*\)::integer from public\.agrovision_members m where m\.project_id = p_project_id\) as members/i,
  );
});

test("record owner count RPC is project-scoped and limited to project admins and members", () => {
  const rpc = comparison.match(
    /create or replace function public\.agrovision_comparison_record_owner_count[\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(rpc);
  assert.match(rpc, /count\(distinct r\.owner_id\)::integer/i);
  assert.match(rpc, /where r\.project_id = p_project_id/i);
  assert.match(rpc, /agrovision_comparison_is_admin\(p_project_id\)/i);
  assert.match(rpc, /m\.project_id = p_project_id[\s\S]*m\.user_id = auth\.uid\(\)/i);
  assert.match(comparison, /revoke all on function public\.agrovision_comparison_record_owner_count\(text\) from public, anon/i);
  assert.match(comparison, /grant execute on function public\.agrovision_comparison_record_owner_count\(text\) to authenticated/i);
});

test("focused record-owner migration does not alter RLS or stored publications", () => {
  assert.match(recordOwnerCount, /count\(distinct r\.owner_id\)::integer/i);
  assert.match(recordOwnerCount, /where r\.project_id = p_project_id/i);
  assert.doesNotMatch(recordOwnerCount, /\b(alter table|create policy|drop policy|insert into|update public\.agrovision_comparison_publications)\b/i);
});

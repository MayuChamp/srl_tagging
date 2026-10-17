import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaggingSnapshot, parseEnvironmentConfig } from "../src/lib/environment.ts";
const id = "12345678-1234-1234-1234-123456789abc";
const base = { interval_seconds: 180, frames_per_window: 1, adaptive_video: false, macro_analysis: true };
const session = { id, name: "תכנון", created_at: "2026-10-17", is_ai_generated: false };
const row = { id, code_id: "SRL_PLAN", start_time: 10, end_time: 20, evidence_text: "מה התכנית?" };

test("selected tagging requires an explicit macro run and valid ID; client cannot forge snapshot", () => {
  assert.deepEqual(parseEnvironmentConfig({ ...base, tagging_session_id: id }), { ...base, tagging_session_id: id });
  for (const config of [
    { ...base, tagging_session_id: "wrong" }, { ...base, tagging_session_id: null },
    { ...base, macro_analysis: false, tagging_session_id: id },
    { ...base, macro_analysis: undefined, tagging_session_id: id },
    { ...base, tagging_snapshot: { session_id: id, tags: [] } },
  ]) assert.equal(parseEnvironmentConfig(config), null);
});
test("frozen source preserves provenance, code labels and source text without arbitrary metadata", () => {
  const result = buildTaggingSnapshot(session, [{ ...row, storage_path: "private", notes: "not included" }], 1,
    [{ id: "SRL_PLAN", label: "תכנון" }], "2026-10-17T00:00:00Z");
  assert.deepEqual(result.tags, [{ id, code_id: "SRL_PLAN", label: "תכנון", start_time: 10, end_time: 20, text: "מה התכנית?" }]);
  assert.equal(result.session_id, id);
  assert.equal(result.captured_at, "2026-10-17T00:00:00Z");
  assert.equal(result.truncated, false);
  assert.ok(result.limitations.length >= 2);
});
test("invalid times and duplicate references cannot become annotation evidence", () => {
  const rows = [row, row, { ...row, id: "x" },
    { ...row, start_time: -1 }, { ...row, end_time: NaN }, { ...row, end_time: 9 }];
  const result = buildTaggingSnapshot(session, rows, rows.length, null);
  assert.equal(result.tags.length, 1);
  assert.equal(result.truncated, true);
});
test("snapshot bounds disclose omissions and text truncation", () => {
  const rows = Array.from({ length: 401 }, (_, n) => ({ ...row,
    id: `12345678-1234-1234-1234-${n.toString().padStart(12, "0")}`, evidence_text: "א".repeat(2100) }));
  const result = buildTaggingSnapshot(session, rows, 401, null);
  assert.equal(result.tags.length, 400);
  assert.equal(result.total_tags, 401);
  assert.equal(result.tags[0].text.length, 2000);
  assert.equal(result.truncated, true);
  assert.ok(result.limitations.some(s => s.includes("400")));
});
test("empty selected session remains distinguishable from no selected session", () => {
  const result = buildTaggingSnapshot(session, [], 0, null);
  assert.equal(result.session_id, id);
  assert.deepEqual(result.tags, []);
  assert.equal(result.total_tags, 0);
});

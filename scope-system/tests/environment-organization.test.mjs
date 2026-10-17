import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeOrganization } from "../src/lib/environment.ts";
const sample = (organization, coverage = "class_visible", status = "completed") => ({ status, observation: { organization, coverage } });
test("distribution includes unknown once and excludes failed windows from denominator", () => {
  const result = summarizeOrganization([sample("groups"), sample("mixed"), sample("unknown"), sample("new-value", "teacher_only"), sample("whole_class", "class_visible", "failed")], 7);
  assert.deepEqual(result.counts, { whole_class: 0, individual: 0, pairs: 0, groups: 1, mixed: 1, unknown: 2 });
  assert.equal(result.completed, 4); assert.equal(result.failed, 1); assert.equal(result.unprocessed, 2); assert.equal(result.limitedCoverage, 1);
  assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.completed);
});
test("empty and incomplete legacy runs have no invented denominator", () => {
  assert.equal(summarizeOrganization([]).unprocessed, null);
  assert.equal(summarizeOrganization([], 3).completed, 0);
  assert.equal(summarizeOrganization([sample(undefined, undefined)], 0).unprocessed, 0);
  assert.equal(summarizeOrganization([sample("__proto__")]).counts.unknown, 1);
});

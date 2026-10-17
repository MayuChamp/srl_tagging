import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, parseEnvironmentConfig } from "../src/lib/environment.ts";

test("sampling accepts only the three comparison configurations", () => {
  for (const [interval, frames] of [[60, 3], [60, 1], [180, 1]]) {
    const config = { interval_seconds: interval, frames_per_window: frames, adaptive_video: true };
    assert.deepEqual(parseEnvironmentConfig(config), config);
  }
});
test("invalid, coercible or injected configuration cannot reach the queue", () => {
  for (const value of [null, [], {}, { interval_seconds: 180, frames_per_window: 3, adaptive_video: true },
    { interval_seconds: "60", frames_per_window: 3, adaptive_video: true },
    { interval_seconds: 60, frames_per_window: true, adaptive_video: true },
    { interval_seconds: 60, frames_per_window: 3, adaptive_video: "true" },
    { interval_seconds: 60, frames_per_window: 3, adaptive_video: true, requested_by: "another-user" }]) {
    assert.equal(parseEnvironmentConfig(value), null);
  }
});
test("resource IDs reject paths and malformed query values", () => {
  assert.equal(isUuid("12345678-1234-1234-1234-123456789abc"), true);
  for (const value of [null, 12, "../secret", "abc", "12345678-1234-1234-1234-123456789abc?x=1"]) {
    assert.equal(isUuid(value), false);
  }
});

test("macro analysis is explicit and backward compatible", () => {
  const base = { interval_seconds: 60, frames_per_window: 3, adaptive_video: true };
  assert.deepEqual(parseEnvironmentConfig(base), base);
  for (const value of [true, false]) assert.deepEqual(parseEnvironmentConfig({ ...base, macro_analysis: value }), { ...base, macro_analysis: value });
  for (const value of [null, "true", 1]) assert.equal(parseEnvironmentConfig({ ...base, macro_analysis: value }), null);
});

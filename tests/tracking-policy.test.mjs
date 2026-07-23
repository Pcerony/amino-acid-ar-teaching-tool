import assert from "node:assert/strict";
import test from "node:test";
import * as faceTracking from "../app/lib/faceTracking.ts";

test("keeps a recognized target through short pose-estimation gaps", () => {
  const shouldReleaseTarget = faceTracking.shouldReleaseTarget;
  assert.equal(typeof shouldReleaseTarget, "function");
  assert.equal(shouldReleaseTarget(1_000, 3_399, 2_400), false);
  assert.equal(shouldReleaseTarget(1_000, 3_400, 2_400), true);
});

test("scan scheduling preserves start-to-start cadence", () => {
  const nextScanDelay = faceTracking.nextScanDelay;
  assert.equal(typeof nextScanDelay, "function");
  assert.equal(nextScanDelay(250, 90), 160);
  assert.equal(nextScanDelay(180, 220), 24);
});

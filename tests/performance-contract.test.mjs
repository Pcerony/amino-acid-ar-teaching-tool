import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scanner uses separate search and target-tracking cadences", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /SEARCH_INTERVAL_MS\s*=\s*250/);
  assert.match(source, /TRACK_INTERVAL_MS\s*=\s*180/);
  assert.match(source, /SLOW_TRACK_INTERVAL_MS\s*=\s*250/);
  assert.match(source, /recognizer\.track/);
  assert.match(source, /AnchorSmoother/);
  assert.match(source, /shouldReleaseTarget/);
  assert.match(source, /lastPoseSeenAtRef/);
  assert.match(source, /nextScanDelay/);
  assert.doesNotMatch(
    source,
    /next\.state === "lost" && anchorMissesRef\.current > 4/,
  );
});

test("local recognition limits full sweeps with a cooldown", async () => {
  const source = await readFile(
    new URL("../app/lib/localRecognizer.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /COLOR_CANDIDATE_LIMIT\s*=\s*8/);
  assert.match(source, /FULL_SWEEP_COOLDOWN_MS\s*=\s*700/);
  assert.match(source, /lastFullSweepAt/);
  assert.match(source, /canFullSweep/);
  assert.match(source, /this\.references\.filter\(\(\{ acid \}\) => !shortlistIds\.has\(acid\.id\)\)/);
});

test("scanner pauses expensive work while the lesson is expanded or the page is hidden", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /document\.hidden/);
  assert.match(source, /panelExpanded/);
  assert.match(source, /stopScanTimer/);
});

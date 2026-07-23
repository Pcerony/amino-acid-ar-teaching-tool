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

test("scanner pauses expensive work while the lesson is expanded or the page is hidden", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /document\.hidden/);
  assert.match(source, /panelExpanded/);
  assert.match(source, /stopScanTimer/);
});

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

test("first paint stays light and does not load camera or 3D dependencies", async () => {
  const loadingSource = await readFile(
    new URL("../app/components/LoadingScreen.tsx", import.meta.url),
    "utf8",
  );
  const scannerSource = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  const pagesSource = await readFile(
    new URL("../github-pages/index.html", import.meta.url),
    "utf8",
  );
  const mainSource = await readFile(
    new URL("../github-pages/main.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(loadingSource, /(?:three|@techstark\/opencv-js|LocalRecognizer)/i);
  assert.equal((scannerSource.match(/new LocalRecognizer\(\)/g) ?? []).length, 1);
  assert.match(scannerSource, /coreLoadingReady/);
  assert.match(scannerSource, /LoadingProgressBanner/);
  assert.match(scannerSource, /loadingState\.stages\.art\.status/);
  assert.doesNotMatch(pagesSource, /<script[^>]+(?:vendor\/opencv|opencv\.js)/i);
  assert.match(pagesSource, /id="bootstrap-shell"[\s\S]*role="status"/);
  assert.match(pagesSource, /id="bootstrap-progress"[\s\S]*<\/progress>/);
  assert.doesNotMatch(pagesSource, /(?:three|@techstark\/opencv-js)/i);
  assert.match(mainSource, /getElementById\("bootstrap-shell"\)\?\.remove\(\)/);
});

test("loading checks every known molecule and preloads only the twenty reference images", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /AMINO_ACID_IDS\.every\(\(id\)/);
  assert.match(source, /validateMolecule\(molecule\)/);
  assert.doesNotMatch(source, /Object\.keys\(MOLECULES\)\.length/);

  const preloadStart = source.indexOf("const preloadReferenceArt");
  const preloadEnd = source.indexOf("const begin", preloadStart);
  assert.ok(preloadStart >= 0 && preloadEnd > preloadStart);
  const preloadSource = source.slice(preloadStart, preloadEnd);
  assert.match(preloadSource, /AMINO_ACIDS\.map/);
  assert.match(preloadSource, /image\.src\s*=\s*acid\.referencePath/);
  assert.doesNotMatch(preloadSource, /getUserMedia/);
  assert.doesNotMatch(preloadSource, /setInterval|setTimeout/);
});

test("README documents visible weak-network loading and the two child-friendly modes", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /ページを準備中|加载进度/);
  assert.match(readme, /抽福/);
  assert.match(readme, /固定/);
  assert.match(readme, /弱网|ネットワーク|network/i);
});

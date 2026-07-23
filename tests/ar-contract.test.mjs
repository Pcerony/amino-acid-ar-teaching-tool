import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local recognizer exposes normalized planar anchors and target-only tracking", async () => {
  const source = await readFile(
    new URL("../app/lib/localRecognizer.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /anchor:\s*TrackedQuad\s*\|\s*null/);
  assert.match(source, /perspectiveTransform/);
  assert.match(source, /async track\(/);
  assert.match(source, /referenceForId/);
});

test("molecule viewer lazy-loads Three and enforces the mobile render budget", async () => {
  const source = await readFile(
    new URL("../app/components/MoleculeViewer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import\("three"\)/);
  assert.match(source, /Math\.min\(window\.devicePixelRatio,\s*1\.25\)/);
  assert.match(source, /powerPreference:\s*"low-power"/);
  assert.match(source, /antialias:\s*false/);
  assert.match(source, /projectMolecule/);
});

test("anchored overlay uses the selected ring layout and projective matrix", async () => {
  const source = await readFile(
    new URL("../app/components/AnchoredOverlay.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /cssMatrixForQuad/);
  assert.match(source, /MoleculeViewer/);
  assert.match(source, /aria-label=.*学習カード/);
  assert.match(source, /ar-anchor-ring/);
});

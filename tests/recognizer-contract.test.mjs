import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AMINO_ACID_IDS } from "../app/data/aminoAcids.ts";

test("local recognizer exposes a closed-set normalized result", async () => {
  const source = await readFile(
    new URL("../app/lib/localRecognizer.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /source:\s*"local"/);
  assert.match(source, /margin:/);
  assert.match(source, /goodMatches/);
  assert.match(source, /inliers/);
  assert.match(source, /findHomography/);
  assert.match(source, /NORM_HAMMING/);
  assert.equal(AMINO_ACID_IDS.length, 20);
});

test("camera teardown stops every media track", async () => {
  const { stopMediaStream } = await import("../app/lib/camera.ts");
  let stopped = 0;
  stopMediaStream({
    getTracks: () => [
      { stop: () => stopped++ },
      { stop: () => stopped++ },
    ],
  });
  assert.equal(stopped, 2);
});

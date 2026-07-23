import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cloud fallback is optional, closed-set, no-store, and image-only", async () => {
  const source = await readFile(
    new URL("../app/api/recognize/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /OPENAI_API_KEY/);
  assert.match(source, /status:\s*503/);
  assert.match(source, /MAX_IMAGE_CHARACTERS/);
  assert.match(source, /AMINO_ACID_IDS/);
  assert.match(source, /strict:\s*true/);
  assert.match(source, /store:\s*false/);
  assert.match(source, /Cache-Control":\s*"no-store"/);
  assert.doesNotMatch(source, /console\.(log|info|debug)/);
});

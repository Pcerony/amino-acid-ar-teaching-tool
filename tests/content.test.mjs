import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import {
  AMINO_ACIDS,
  AMINO_ACID_IDS,
  isAminoAcidId,
} from "../app/data/aminoAcids.ts";

test("contains exactly the twenty printed amino-acid faces", async () => {
  assert.equal(AMINO_ACIDS.length, 20);
  assert.equal(new Set(AMINO_ACIDS.map((acid) => acid.id)).size, 20);
  assert.deepEqual(
    AMINO_ACIDS.map((acid) => acid.id),
    [...AMINO_ACID_IDS],
  );
  for (const acid of AMINO_ACIDS) {
    assert.ok(acid.nameJa);
    assert.ok(acid.nameEn);
    assert.match(acid.code, /^[A-Z][a-z]{2}$/);
    assert.match(acid.theme, /^#[0-9a-f]{6}$/i);
    assert.ok(acid.shape.length > 8);
    assert.ok(acid.role.length > 8);
    assert.ok(acid.memory.length > 8);
    assert.equal(isAminoAcidId(acid.id), true);
    await access(new URL(`../public/${acid.referencePath}`, import.meta.url));
  }
  assert.equal(isAminoAcidId("glycine"), true);
});

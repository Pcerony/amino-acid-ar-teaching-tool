import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AMINO_ACID_IDS } from "../app/data/aminoAcids.ts";
import { FORTUNES } from "../app/data/fortunes.ts";
import { MOLECULES } from "../app/data/molecules.ts";
import { constellationFromMolecule } from "../app/lib/constellation.ts";

const TEXT_FIELDS = [
  "constellationName",
  "constellationTitle",
  "meaning",
  "fortune",
  "tryToday",
  "takeCare",
  "moleculeHint",
  "theme",
  "message",
  "goodFor",
  "avoid",
  "learningHint",
];

test("every amino acid has one complete fixed Japanese fortune", () => {
  assert.deepEqual(Object.keys(FORTUNES).sort(), [...AMINO_ACID_IDS].sort());

  for (const id of AMINO_ACID_IDS) {
    const entry = FORTUNES[id];
    assert.equal(entry.id, id);
    for (const field of TEXT_FIELDS) {
      assert.equal(typeof entry[field], "string", `${id}.${field} should be text`);
      assert.ok(entry[field].trim().length > 0, `${id}.${field} should not be empty`);
    }
    assert.match(entry.constellationName, /座$/);
    assert.match(entry.learningHint, /学習用のイメージ/);
    assert.ok(entry.stars.length >= 4, `${id} needs at least four stars`);
    assert.ok(entry.links.length > 0, `${id} needs molecule links`);
  }
});

test("fortune entries have unique ids and no runtime randomness or date dependency", async () => {
  assert.equal(new Set(Object.values(FORTUNES).map((entry) => entry.id)).size, 20);

  const source = await readFile(new URL("../app/data/fortunes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:Date|Math\.random|localStorage)\b/);
});

test("constellation projections stay normalized and link only valid unique pairs", () => {
  assert.deepEqual(Object.keys(MOLECULES).sort(), [...AMINO_ACID_IDS].sort());

  for (const id of AMINO_ACID_IDS) {
    const constellation = constellationFromMolecule(MOLECULES[id]);
    assert.ok(constellation.stars.length >= 4, `${id} needs at least four points`);
    assert.equal(Object.isFrozen(constellation), true);
    assert.equal(Object.isFrozen(constellation.stars), true);
    assert.equal(Object.isFrozen(constellation.links), true);
    assert.equal(Object.isFrozen(constellation.sourceAtomIndices), true);
    assert.equal(constellation.sourceAtomIndices.length, constellation.stars.length);

    for (const atomIndex of constellation.sourceAtomIndices) {
      if (atomIndex === null) continue;
      assert.ok(atomIndex >= 0 && atomIndex < MOLECULES[id].atoms.length);
      assert.notEqual(MOLECULES[id].atoms[atomIndex].element, "H");
    }

    for (const point of constellation.stars) {
      assert.ok(Number.isFinite(point.x));
      assert.ok(Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= 1);
      assert.ok(point.y >= 0 && point.y <= 1);
    }

    const seen = new Set();
    for (const [from, to] of constellation.links) {
      assert.ok(Number.isInteger(from) && Number.isInteger(to));
      assert.ok(from >= 0 && from < constellation.stars.length);
      assert.ok(to >= 0 && to < constellation.stars.length);
      assert.notEqual(from, to);
      const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
      assert.equal(seen.has(key), false, `${id} contains duplicate link ${key}`);
      seen.add(key);

      // A visual link must correspond to an actual heavy-atom bond.
      const fromAtom = constellation.sourceAtomIndices[from];
      const toAtom = constellation.sourceAtomIndices[to];
      assert.notEqual(fromAtom, null);
      assert.notEqual(toAtom, null);
      assert.equal(
        MOLECULES[id].bonds.some(({ atoms: [a, b] }) =>
          (a === fromAtom && b === toAtom) || (a === toAtom && b === fromAtom),
        ),
        true,
        `${id} link ${key} is not backed by a molecule bond`,
      );
    }

    assert.deepEqual(constellation, constellationFromMolecule(MOLECULES[id]));
  }
});

test("tiny and empty molecules receive deterministic fallback stars", () => {
  const tinyMolecule = {
    cid: 1,
    atoms: [
      { element: "C", position: [0, 0, 0] },
      { element: "H", position: [1, 0, 0] },
    ],
    bonds: [{ atoms: [0, 1], order: 1 }],
  };
  const emptyMolecule = { cid: 2, atoms: [], bonds: [] };

  for (const molecule of [tinyMolecule, emptyMolecule]) {
    const first = constellationFromMolecule(molecule);
    const second = constellationFromMolecule(molecule);
    assert.equal(first.stars.length, 4);
    assert.deepEqual(
      first.sourceAtomIndices,
      molecule === tinyMolecule ? [0, null, null, null] : [null, null, null, null],
    );
    assert.deepEqual(first, second);
    for (const point of first.stars) {
      assert.ok(point.x >= 0 && point.x <= 1);
      assert.ok(point.y >= 0 && point.y <= 1);
    }
  }
});

test("ring-bearing molecules keep at least one visible closed loop", () => {
  for (const id of ["phenylalanine", "tryptophan", "tyrosine", "histidine"]) {
    const constellation = constellationFromMolecule(MOLECULES[id]);
    const visibleCount = constellation.sourceAtomIndices.filter(
      (atomIndex) => atomIndex !== null,
    ).length;
    const adjacency = Array.from({ length: visibleCount }, () => []);
    for (const [from, to] of constellation.links) {
      adjacency[from].push(to);
      adjacency[to].push(from);
    }

    const visited = new Set();
    let components = 0;
    for (let start = 0; start < visibleCount; start += 1) {
      if (visited.has(start)) continue;
      components += 1;
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of adjacency[current]) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const cycleRank = constellation.links.length - visibleCount + components;
    assert.ok(cycleRank >= 1, `${id} should retain a closed ring`);
  }
});

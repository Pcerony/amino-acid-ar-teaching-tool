import assert from "node:assert/strict";
import test from "node:test";
import { AMINO_ACID_IDS } from "../app/data/aminoAcids.ts";
import { MOLECULES } from "../app/data/molecules.ts";
import {
  formulaForAtoms,
  projectMolecule,
  validateMolecule,
} from "../app/lib/molecule.ts";

const FORMULAS = {
  alanine: "C3H7NO2",
  valine: "C5H11NO2",
  leucine: "C6H13NO2",
  isoleucine: "C6H13NO2",
  methionine: "C5H11NO2S",
  phenylalanine: "C9H11NO2",
  tryptophan: "C11H12N2O2",
  proline: "C5H9NO2",
};

test("contains one valid offline 3D molecule for every printed face", () => {
  assert.deepEqual(Object.keys(MOLECULES).sort(), [...AMINO_ACID_IDS].sort());
  for (const id of AMINO_ACID_IDS) {
    const molecule = MOLECULES[id];
    assert.deepEqual(validateMolecule(molecule), []);
    assert.equal(formulaForAtoms(molecule.atoms), FORMULAS[id]);
  }
});

test("projects every atom into a finite normalized 2D fallback", () => {
  for (const molecule of Object.values(MOLECULES)) {
    const points = projectMolecule(molecule, { yaw: -0.48, pitch: 0.38 });
    assert.equal(points.length, molecule.atoms.length);
    for (const point of points) {
      assert.ok(Number.isFinite(point.x));
      assert.ok(Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= 1);
      assert.ok(point.y >= 0 && point.y <= 1);
    }
  }
});

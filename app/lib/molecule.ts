export type MoleculeElement = "C" | "H" | "N" | "O" | "S";

export type MoleculeAtom = {
  element: MoleculeElement;
  position: readonly [number, number, number];
};

export type MoleculeBond = {
  atoms: readonly [number, number];
  order: 1 | 2 | 3;
};

export type Molecule = {
  cid: number;
  atoms: readonly MoleculeAtom[];
  bonds: readonly MoleculeBond[];
};

const ELEMENT_ORDER: readonly MoleculeElement[] = ["C", "H", "N", "O", "S"];

export function formulaForAtoms(atoms: readonly MoleculeAtom[]) {
  const counts = new Map<MoleculeElement, number>();
  for (const atom of atoms) {
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1);
  }
  return ELEMENT_ORDER.flatMap((element) => {
    const count = counts.get(element) ?? 0;
    return count ? `${element}${count === 1 ? "" : count}` : [];
  }).join("");
}

export function validateMolecule(molecule: Molecule) {
  const errors: string[] = [];
  const seen = new Set<string>();
  molecule.bonds.forEach((bond, index) => {
    const [a, b] = bond.atoms;
    if (a === b) errors.push(`bond ${index} connects an atom to itself`);
    if (
      a < 0 ||
      b < 0 ||
      a >= molecule.atoms.length ||
      b >= molecule.atoms.length
    ) {
      errors.push(`bond ${index} has an invalid atom index`);
    }
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) errors.push(`bond ${index} duplicates ${key}`);
    seen.add(key);
  });
  return errors;
}

export function projectMolecule(
  molecule: Molecule,
  rotation: { yaw: number; pitch: number },
) {
  const rotated = molecule.atoms.map(({ position: [x, y, z] }) => {
    const x1 = x * Math.cos(rotation.yaw) + z * Math.sin(rotation.yaw);
    const z1 = -x * Math.sin(rotation.yaw) + z * Math.cos(rotation.yaw);
    const y1 =
      y * Math.cos(rotation.pitch) - z1 * Math.sin(rotation.pitch);
    return { x: x1, y: y1 };
  });
  const xs = rotated.map(({ x }) => x);
  const ys = rotated.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, Number.EPSILON);
  const height = Math.max(maxY - minY, Number.EPSILON);
  return rotated.map(({ x, y }) => ({
    x: (x - minX) / width,
    y: 1 - (y - minY) / height,
  }));
}

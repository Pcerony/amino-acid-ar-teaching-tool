import type { Molecule } from "./molecule.ts";
import { projectMolecule } from "./molecule.ts";

export type ConstellationPoint = {
  readonly x: number;
  readonly y: number;
};

export type ConstellationLink = readonly [number, number];

export type ConstellationData = {
  /** The compact star list used by the fortune card. */
  readonly stars: readonly ConstellationPoint[];
  /** Alias for callers that describe the same values as points. */
  readonly points: readonly ConstellationPoint[];
  readonly links: readonly ConstellationLink[];
  /** Source atom index for each star; fallback stars are marked with null. */
  readonly sourceAtomIndices: readonly (number | null)[];
};

/** Kept as a short compatibility name for consumers of the design document. */
export type Constellation = ConstellationData;

const PROJECTION = { yaw: -0.48, pitch: 0.38 } as const;
const VIEWPORT_START = 0.12;
const VIEWPORT_SIZE = 0.76;
const MIN_STARS = 4;
const MAX_STARS = 9;

const FALLBACK_POINTS: readonly ConstellationPoint[] = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function toConstellationPoint(point: { x: number; y: number }): ConstellationPoint {
  return {
    x: VIEWPORT_START + clampUnit(point.x) * VIEWPORT_SIZE,
    y: VIEWPORT_START + clampUnit(point.y) * VIEWPORT_SIZE,
  };
}

type HeavyAdjacency = Map<number, number[]>;

function edgeKey(from: number, to: number) {
  return from < to ? `${from}:${to}` : `${to}:${from}`;
}

function buildHeavyAdjacency(
  molecule: Molecule,
  heavyIndices: readonly number[],
) {
  const heavySet = new Set(heavyIndices);
  const adjacency: HeavyAdjacency = new Map(
    heavyIndices.map((index) => [index, []]),
  );
  const edges = new Set<string>();
  for (const bond of molecule.bonds) {
    const [from, to] = bond.atoms;
    if (
      from === to ||
      !heavySet.has(from) ||
      !heavySet.has(to)
    ) {
      continue;
    }
    const key = edgeKey(from, to);
    if (edges.has(key)) continue;
    edges.add(key);
    adjacency.get(from)?.push(to);
    adjacency.get(to)?.push(from);
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((left, right) => left - right);
  }

  return adjacency;
}

function cycleAtoms(
  heavyIndices: readonly number[],
  adjacency: HeavyAdjacency,
) {
  const discovery = new Map<number, number>();
  const low = new Map<number, number>();
  const bridges = new Set<string>();
  let clock = 0;

  function visit(node: number, parentEdge: string | null) {
    const discoveredAt = ++clock;
    discovery.set(node, discoveredAt);
    low.set(node, discoveredAt);
    for (const neighbor of adjacency.get(node) ?? []) {
      const key = edgeKey(node, neighbor);
      if (key === parentEdge) continue;
      const neighborDiscovery = discovery.get(neighbor);
      if (neighborDiscovery === undefined) {
        visit(neighbor, key);
        low.set(node, Math.min(low.get(node)!, low.get(neighbor)!));
        if (low.get(neighbor)! > discoveredAt) bridges.add(key);
      } else {
        low.set(node, Math.min(low.get(node)!, neighborDiscovery));
      }
    }
  }

  for (const index of heavyIndices) {
    if (!discovery.has(index)) visit(index, null);
  }

  const result = new Set<number>();
  for (const [from, neighbors] of adjacency) {
    for (const to of neighbors) {
      if (!bridges.has(edgeKey(from, to))) {
        result.add(from);
        result.add(to);
      }
    }
  }
  return result;
}

function bfsOrder(
  starts: readonly number[],
  adjacency: HeavyAdjacency,
  allowed?: ReadonlySet<number>,
) {
  const order: number[] = [];
  const visited = new Set<number>();
  for (const start of starts) {
    if (visited.has(start) || (allowed && !allowed.has(start))) continue;
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      order.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor) || (allowed && !allowed.has(neighbor))) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return order;
}

function sampleHeavyAtomIndices(molecule: Molecule) {
  const heavyIndices = molecule.atoms.reduce<number[]>((indices, atom, index) => {
    if (atom.element !== "H") indices.push(index);
    return indices;
  }, []);
  if (heavyIndices.length <= MAX_STARS) return heavyIndices;

  const adjacency = buildHeavyAdjacency(molecule, heavyIndices);
  const cycleSet = cycleAtoms(heavyIndices, adjacency);
  const cycleOrder = bfsOrder(
    [...cycleSet].sort((left, right) => left - right),
    adjacency,
    cycleSet,
  );
  const selected = cycleOrder.slice(0, MAX_STARS);
  const selectedSet = new Set(selected);
  for (const index of bfsOrder(heavyIndices, adjacency)) {
    if (selected.length >= MAX_STARS) break;
    if (selectedSet.has(index)) continue;
    selected.push(index);
    selectedSet.add(index);
  }
  return selected;
}

/**
 * Projects a real molecule into a small, deterministic constellation.
 *
 * The links are derived from molecule bonds. When sampling reduces the atom
 * list, only bonds whose two heavy-atom endpoints remain visible are kept;
 * this avoids inventing a visual connection between unrelated stars.
 */
export function constellationFromMolecule(molecule: Molecule): ConstellationData {
  const atomCount = molecule.atoms.length;
  const projected = atomCount
    ? projectMolecule(molecule, PROJECTION)
    : [];
  const sampledIndices = sampleHeavyAtomIndices(molecule);
  const stars = sampledIndices.map((atomIndex) =>
    toConstellationPoint(projected[atomIndex]),
  );
  const sourceAtomIndices: Array<number | null> = [...sampledIndices];

  for (const fallback of FALLBACK_POINTS) {
    if (stars.length >= MIN_STARS) break;
    stars.push(fallback);
    sourceAtomIndices.push(null);
  }

  const links: ConstellationLink[] = [];
  const seen = new Set<string>();
  for (const bond of molecule.bonds) {
    const [fromAtom, toAtom] = bond.atoms;
    if (
      fromAtom < 0 ||
      toAtom < 0 ||
      fromAtom >= atomCount ||
      toAtom >= atomCount ||
      fromAtom === toAtom
    ) {
      continue;
    }

    const from = sampledIndices.indexOf(fromAtom);
    const to = sampledIndices.indexOf(toAtom);
    if (from < 0 || to < 0 || from === to) continue;

    const low = Math.min(from, to);
    const high = Math.max(from, to);
    const key = `${low}:${high}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push([low, high]);
  }

  const frozenStars = Object.freeze(
    stars.map((point) => Object.freeze(point)),
  );
  const frozenLinks = Object.freeze(
    links.map((link) => Object.freeze(link) as ConstellationLink),
  );
  const frozenSourceAtomIndices = Object.freeze(sourceAtomIndices);
  return Object.freeze({
    stars: frozenStars,
    points: frozenStars,
    links: frozenLinks,
    sourceAtomIndices: frozenSourceAtomIndices,
  });
}

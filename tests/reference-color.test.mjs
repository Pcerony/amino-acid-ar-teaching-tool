import assert from "node:assert/strict";
import test from "node:test";
import { AMINO_ACIDS } from "../app/data/aminoAcids.ts";
import {
  colorProfileDistance,
  featureSupportScore,
  rankReferenceCandidates,
} from "../app/lib/color.ts";

const measuredProfiles = {
  glycine: [177.1, 0.497, 0.801],
  alanine: [11.7, 0.46, 0.987],
  valine: [15.2, 0.637, 0.965],
  leucine: [31.9, 0.629, 0.986],
  isoleucine: [44.2, 0.752, 0.938],
  methionine: [31.2, 0.516, 0.948],
  phenylalanine: [8.1, 0.453, 0.981],
  tryptophan: [326.7, 0.432, 0.803],
  proline: [355.3, 0.403, 0.889],
  serine: [181, 0.404, 0.829],
  threonine: [178.8, 0.425, 0.802],
  cysteine: [126.2, 0.228, 0.81],
  tyrosine: [179.1, 0.544, 0.791],
  asparagine: [178, 0.371, 0.842],
  glutamine: [210.6, 0.498, 0.848],
  "aspartic-acid": [266.3, 0.337, 0.845],
  "glutamic-acid": [267, 0.249, 0.776],
  lysine: [135.4, 0.184, 0.865],
  arginine: [176.6, 0.37, 0.798],
  histidine: [177.3, 0.501, 0.671],
};

const referenceProfiles = AMINO_ACIDS.map((acid) => {
  const [hue, saturation, value] = measuredProfiles[acid.id];
  return {
    id: acid.id,
    themeRgb: acid.themeRgb,
    colorProfile: { hue, saturation, value, validPixels: 1 },
  };
});

test("keeps every reference in the recognition shortlist", () => {
  for (const reference of referenceProfiles) {
    const ranked = rankReferenceCandidates(
      reference.colorProfile,
      referenceProfiles,
      8,
    );
    assert.equal(
      colorProfileDistance(reference.colorProfile, reference.colorProfile),
      0,
    );
    assert.ok(ranked.some((candidate) => candidate.id === reference.id));
  }
});

test("strong geometric support separates an exact match from a color twin", () => {
  const exact = featureSupportScore(536, 536);
  const colorTwin = featureSupportScore(47, 63);
  assert.ok(exact > colorTwin + 0.02);
  assert.equal(featureSupportScore(0, 0), 0);
});

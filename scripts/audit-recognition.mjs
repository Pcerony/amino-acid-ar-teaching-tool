import { resolve } from "node:path";
import sharp from "sharp";
import { AMINO_ACIDS } from "../app/data/aminoAcids.ts";
import {
  colorProfileDistance,
  profileImageData,
  rankReferenceCandidates,
  themeColorDistance,
} from "../app/lib/color.ts";

const VARIANTS = [
  { brightness: 0.75, saturation: 0.85, angle: -8 },
  { brightness: 0.75, saturation: 1, angle: 8 },
  { brightness: 1, saturation: 0.85, angle: 0 },
  { brightness: 1, saturation: 1, angle: 0 },
  { brightness: 1.25, saturation: 0.85, angle: -8 },
  { brightness: 1.25, saturation: 1, angle: 8 },
];

async function readProfile(path, variant = null) {
  let pipeline = sharp(path);
  if (variant) {
    pipeline = pipeline
      .modulate({
        brightness: variant.brightness,
        saturation: variant.saturation,
      })
      .rotate(variant.angle, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
  }
  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return profileImageData(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
  );
}

const profiles = [];
for (const acid of AMINO_ACIDS) {
  profiles.push({
    acid,
    path: resolve("public", acid.referencePath),
    colorProfile: await readProfile(resolve("public", acid.referencePath)),
  });
}

const entries = profiles.map(({ acid, colorProfile }) => ({
  id: acid.id,
  themeRgb: acid.themeRgb,
  colorProfile,
}));
const rows = profiles.map(({ acid, colorProfile }) => {
  const profileRank = [...entries]
    .sort(
      (a, b) =>
        colorProfileDistance(colorProfile, a.colorProfile) -
        colorProfileDistance(colorProfile, b.colorProfile),
    )
    .findIndex((entry) => entry.id === acid.id) + 1;
  const themeRank = [...entries]
    .sort(
      (a, b) =>
        themeColorDistance(colorProfile, a.themeRgb) -
        themeColorDistance(colorProfile, b.themeRgb),
    )
    .findIndex((entry) => entry.id === acid.id) + 1;
  const shortlist = rankReferenceCandidates(colorProfile, entries, 8);
  return {
    id: acid.id,
    hue: Number(colorProfile.hue.toFixed(1)),
    saturation: Number(colorProfile.saturation.toFixed(3)),
    value: Number(colorProfile.value.toFixed(3)),
    themeRank,
    profileRank,
    shortlistIncluded: shortlist.some((entry) => entry.id === acid.id),
  };
});

console.table(rows);
const missing = rows.filter((row) => !row.shortlistIncluded);
if (missing.length) {
  throw new Error(
    `Recognition shortlist excludes: ${missing.map((row) => row.id).join(", ")}`,
  );
}

let variantCount = 0;
const missingVariants = [];
for (const { acid, path } of profiles) {
  for (const variant of VARIANTS) {
    variantCount += 1;
    const profile = await readProfile(path, variant);
    const shortlist = rankReferenceCandidates(profile, entries, 8);
    if (!shortlist.some((entry) => entry.id === acid.id)) {
      missingVariants.push(`${acid.id}:${JSON.stringify(variant)}`);
    }
  }
}
if (missingVariants.length) {
  throw new Error(
    `Recognition variants excluded: ${missingVariants.join(", ")}`,
  );
}
console.log(
  `Recognition color audit passed: ${rows.length}/${rows.length} references and ${variantCount}/${variantCount} variants in shortlist`,
);

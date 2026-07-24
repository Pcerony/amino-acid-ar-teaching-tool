export type FrameQuality = "ok" | "too-dark" | "glare" | "too-small";

export type ColorProfile = {
  hue: number;
  saturation: number;
  value: number;
  validPixels: number;
};

export function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

export function hueDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

export function profileImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  stride = 4,
): ColorProfile {
  let x = 0;
  let y = 0;
  let weight = 0;
  let saturation = 0;
  let value = 0;
  let validPixels = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 18000)));

  for (let py = 0; py < height; py += step) {
    for (let px = 0; px < width; px += step) {
      const i = (py * width + px) * stride;
      const alpha = stride === 4 ? data[i + 3] / 255 : 1;
      const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
      if (alpha < 0.35 || hsv.value < 0.08) continue;
      const pixelWeight = Math.max(0.08, hsv.saturation) * alpha;
      const radians = (hsv.hue * Math.PI) / 180;
      x += Math.cos(radians) * pixelWeight;
      y += Math.sin(radians) * pixelWeight;
      saturation += hsv.saturation;
      value += hsv.value;
      weight += pixelWeight;
      validPixels += 1;
    }
  }

  if (!validPixels || !weight) {
    return { hue: 0, saturation: 0, value: 0, validPixels: 0 };
  }

  let hue = (Math.atan2(y, x) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: saturation / validPixels,
    value: value / validPixels,
    validPixels,
  };
}

export function themeColorDistance(
  profile: ColorProfile,
  rgb: readonly [number, number, number],
) {
  return colorProfileDistance(profile, rgbToHsv(rgb[0], rgb[1], rgb[2]));
}

export function colorProfileDistance(
  profile: ColorProfile,
  target: Pick<ColorProfile, "hue" | "saturation" | "value">,
) {
  const hue = hueDistance(profile.hue, target.hue) / 180;
  const saturation = Math.abs(profile.saturation - target.saturation);
  const value = Math.abs(profile.value - target.value);
  return Math.min(1, hue * 0.65 + saturation * 0.2 + value * 0.15);
}

export type ReferenceColorEntry = {
  id: string;
  themeRgb: readonly [number, number, number];
  colorProfile: ColorProfile;
};

export function rankReferenceCandidates(
  profile: ColorProfile,
  references: readonly ReferenceColorEntry[],
  limit = 8,
) {
  return references
    .map((reference) => {
      const imageDistance = colorProfileDistance(
        profile,
        reference.colorProfile,
      );
      const themeDistance = themeColorDistance(
        profile,
        reference.themeRgb,
      );
      return {
        id: reference.id,
        reference,
        colorDistance: imageDistance * 0.8 + themeDistance * 0.2,
      };
    })
    .sort((a, b) => a.colorDistance - b.colorDistance)
    .slice(0, limit);
}

/**
 * Keep the original low-match sensitivity while rewarding strong geometric
 * support, so a near-colour false match cannot tie an exact reference match.
 */
export function featureSupportScore(inliers: number, goodMatches: number) {
  const inlierSupport = Math.min(1, Math.max(0, inliers) / 14);
  const highInlierSupport = Math.min(1, Math.max(0, inliers) / 120);
  let score =
    inlierSupport * 0.8 +
    highInlierSupport * 0.05 +
    Math.min(1, Math.max(0, goodMatches) / 60) * 0.15;
  if (inliers < 6) score *= 0.4;
  return score;
}

export function assessFrameQuality(
  profile: ColorProfile,
  brightPixelRatio: number,
  subjectCoverage: number,
): FrameQuality {
  if (profile.value < 0.24) return "too-dark";
  if (brightPixelRatio > 0.32 && profile.saturation < 0.32) return "glare";
  if (subjectCoverage < 0.24) return "too-small";
  return "ok";
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  assessFrameQuality,
  hueDistance,
  profileImageData,
  rgbToHsv,
  themeColorDistance,
} from "../app/lib/color.ts";

test("converts primary colors and wraps hue distance", () => {
  assert.deepEqual(rgbToHsv(255, 0, 0), {
    hue: 0,
    saturation: 1,
    value: 1,
  });
  assert.equal(Math.round(rgbToHsv(0, 255, 0).hue), 120);
  assert.equal(hueDistance(355, 5), 10);
});

test("profiles colored pixels while ignoring transparent black corners", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 0,
    255, 100, 80, 255,
    250, 105, 75, 255,
    0, 0, 0, 255,
  ]);
  const profile = profileImageData(pixels, 2, 2);
  assert.equal(profile.validPixels, 2);
  assert.ok(profile.saturation > 0.6);
  assert.ok(themeColorDistance(profile, [255, 105, 80]) < 0.12);
});

test("returns actionable quality states", () => {
  assert.equal(
    assessFrameQuality(
      { hue: 0, saturation: 0.2, value: 0.18, validPixels: 100 },
      0,
      0.7,
    ),
    "too-dark",
  );
  assert.equal(
    assessFrameQuality(
      { hue: 0, saturation: 0.2, value: 0.9, validPixels: 100 },
      0.5,
      0.7,
    ),
    "glare",
  );
  assert.equal(
    assessFrameQuality(
      { hue: 0, saturation: 0.7, value: 0.8, validPixels: 100 },
      0,
      0.1,
    ),
    "too-small",
  );
  assert.equal(
    assessFrameQuality(
      { hue: 0, saturation: 0.7, value: 0.8, validPixels: 100 },
      0,
      0.7,
    ),
    "ok",
  );
});

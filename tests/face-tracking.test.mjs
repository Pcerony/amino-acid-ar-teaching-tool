import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchorSmoother,
  applyProjectiveMatrix,
  cssMatrixForQuad,
  validateTrackedQuad,
} from "../app/lib/faceTracking.ts";

const square = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];

test("maps every source corner onto the tracked quadrilateral", () => {
  const target = [
    { x: 30, y: 20 },
    { x: 260, y: 45 },
    { x: 235, y: 270 },
    { x: 48, y: 245 },
  ];
  const matrix = cssMatrixForQuad(target, 300);
  const source = [
    [0, 0],
    [300, 0],
    [300, 300],
    [0, 300],
  ];
  source.forEach(([x, y], index) => {
    const point = applyProjectiveMatrix(matrix, x, y);
    assert.ok(Math.abs(point.x - target[index].x) < 0.001);
    assert.ok(Math.abs(point.y - target[index].y) < 0.001);
  });
});

test("rejects tiny, non-convex, and far-outside quads", () => {
  assert.equal(validateTrackedQuad(square).valid, true);
  assert.equal(
    validateTrackedQuad(
      square.map((point) => ({ x: point.x * 0.1, y: point.y * 0.1 })),
    ).valid,
    false,
  );
  assert.equal(
    validateTrackedQuad([square[0], square[2], square[1], square[3]]).valid,
    false,
  );
  assert.equal(
    validateTrackedQuad(
      square.map((point) => ({ x: point.x + 2, y: point.y })),
    ).valid,
    false,
  );
});

test("smooths movement, holds briefly, then reports loss", () => {
  const smoother = new AnchorSmoother({ alpha: 0.35, holdMs: 400 });
  assert.equal(smoother.push(square, 0).state, "tracked");
  const moved = square.map((point) => ({ x: point.x + 0.1, y: point.y }));
  const smoothed = smoother.push(moved, 100);
  assert.ok(smoothed.quad[0].x > 0.2 && smoothed.quad[0].x < 0.3);
  assert.equal(smoother.push(null, 350).state, "holding");
  assert.equal(smoother.push(null, 501).state, "lost");
});

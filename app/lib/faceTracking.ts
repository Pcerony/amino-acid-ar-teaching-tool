export type Point2 = { x: number; y: number };

export type TrackedQuad = readonly [
  Point2,
  Point2,
  Point2,
  Point2,
];

export type AnchorState = {
  state: "tracked" | "holding" | "lost";
  quad: TrackedQuad | null;
};

export function shouldReleaseTarget(
  lastSeenAt: number,
  now: number,
  timeoutMs: number,
) {
  return lastSeenAt > 0 && now - lastSeenAt >= timeoutMs;
}

export function nextScanDelay(
  targetIntervalMs: number,
  analysisElapsedMs: number,
  minIdleMs = 24,
) {
  return Math.max(minIdleMs, targetIntervalMs - analysisElapsedMs);
}

function signedArea(points: readonly Point2[]) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return total / 2;
}

function cross(a: Point2, b: Point2, c: Point2) {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

export function validateTrackedQuad(
  quad: readonly Point2[],
): { valid: boolean; area: number } {
  if (quad.length !== 4) return { valid: false, area: 0 };
  const area = Math.abs(signedArea(quad));
  const insideBounds = quad.every(
    ({ x, y }) => x >= -0.25 && x <= 1.25 && y >= -0.25 && y <= 1.25,
  );
  const turns = quad.map((point, index) =>
    cross(
      point,
      quad[(index + 1) % quad.length],
      quad[(index + 2) % quad.length],
    ),
  );
  const convex =
    turns.every((value) => value > 0.0001) ||
    turns.every((value) => value < -0.0001);
  return {
    area,
    valid: insideBounds && convex && area >= 0.035 && area <= 1.5,
  };
}

export function cssMatrixForQuad(
  quadPixels: readonly Point2[],
  sourceSize: number,
): readonly number[] {
  if (quadPixels.length !== 4 || sourceSize <= 0) {
    throw new Error("A four-point quad and positive source size are required");
  }
  const [p0, p1, p2, p3] = quadPixels;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const projective =
    Math.abs(dx3) > Number.EPSILON || Math.abs(dy3) > Number.EPSILON;
  if (projective && Math.abs(determinant) < Number.EPSILON) {
    throw new Error("Tracked quad cannot be projected");
  }
  const g = projective
    ? (dx3 * dy2 - dx2 * dy3) / determinant
    : 0;
  const h = projective
    ? (dx1 * dy3 - dx3 * dy1) / determinant
    : 0;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;

  return [
    a / sourceSize,
    d / sourceSize,
    0,
    g / sourceSize,
    b / sourceSize,
    e / sourceSize,
    0,
    h / sourceSize,
    0,
    0,
    1,
    0,
    c,
    f,
    0,
    1,
  ];
}

export function applyProjectiveMatrix(
  matrix: readonly number[],
  x: number,
  y: number,
): Point2 {
  if (matrix.length !== 16) throw new Error("Expected a CSS matrix3d");
  const denominator = matrix[3] * x + matrix[7] * y + matrix[15];
  return {
    x: (matrix[0] * x + matrix[4] * y + matrix[12]) / denominator,
    y: (matrix[1] * x + matrix[5] * y + matrix[13]) / denominator,
  };
}

function asTrackedQuad(points: readonly Point2[]): TrackedQuad {
  return [points[0], points[1], points[2], points[3]];
}

function quadCenter(quad: TrackedQuad) {
  return quad.reduce(
    (center, point) => ({
      x: center.x + point.x / 4,
      y: center.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  );
}

export class AnchorSmoother {
  private readonly alpha: number;
  private readonly holdMs: number;
  private current: TrackedQuad | null = null;
  private lastTrackedAt = 0;

  constructor(options: { alpha?: number; holdMs?: number } = {}) {
    this.alpha = options.alpha ?? 0.35;
    this.holdMs = options.holdMs ?? 400;
  }

  push(quad: readonly Point2[] | null, now: number): AnchorState {
    const valid = quad ? validateTrackedQuad(quad).valid : false;
    if (quad && valid) {
      const next = asTrackedQuad(quad);
      if (this.current) {
        const previousCenter = quadCenter(this.current);
        const nextCenter = quadCenter(next);
        const centerShift = Math.hypot(
          nextCenter.x - previousCenter.x,
          nextCenter.y - previousCenter.y,
        );
        const previousArea = validateTrackedQuad(this.current).area;
        const nextArea = validateTrackedQuad(next).area;
        const areaRatio =
          Math.max(previousArea, nextArea) /
          Math.max(Math.min(previousArea, nextArea), Number.EPSILON);
        if (centerShift > 0.28 || areaRatio > 2.8) {
          return this.push(null, now);
        }
        this.current = asTrackedQuad(
          next.map((point, index) => ({
            x:
              this.current![index].x +
              this.alpha * (point.x - this.current![index].x),
            y:
              this.current![index].y +
              this.alpha * (point.y - this.current![index].y),
          })),
        );
      } else {
        this.current = next;
      }
      this.lastTrackedAt = now;
      return { state: "tracked", quad: this.current };
    }

    if (this.current && now - this.lastTrackedAt <= this.holdMs) {
      return { state: "holding", quad: this.current };
    }
    this.current = null;
    return { state: "lost", quad: null };
  }

  reset() {
    this.current = null;
    this.lastTrackedAt = 0;
  }
}

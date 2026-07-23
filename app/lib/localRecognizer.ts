/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCV.js uses embind
 * vectors and matrices that are not fully represented by its declaration file. */
import {
  AMINO_ACIDS,
  type AminoAcid,
  type AminoAcidId,
} from "../data/aminoAcids";
import {
  assessFrameQuality,
  profileImageData,
  themeColorDistance,
  type FrameQuality,
} from "./color";
import {
  type TrackedQuad,
  validateTrackedQuad,
} from "./faceTracking";

type Cv = typeof import("@techstark/opencv-js") & Record<string, any>;

type IndexedReference = {
  acid: AminoAcid;
  keypoints: any;
  descriptors: any;
  width: number;
  height: number;
};

export type LocalRecognitionResult = {
  id: AminoAcidId;
  score: number;
  margin: number;
  goodMatches: number;
  inliers: number;
  anchor: TrackedQuad | null;
  source: "local";
  quality: FrameQuality;
};

export type LocalTrackingResult = {
  id: AminoAcidId;
  goodMatches: number;
  inliers: number;
  anchor: TrackedQuad | null;
};

export type FrameAssessment = {
  result: LocalRecognitionResult | null;
  quality: FrameQuality;
};

let cvPromise: Promise<Cv> | null = null;

async function resolveCvCandidate(candidate: unknown) {
  const value = await Promise.resolve(candidate as any);
  if (value?.Mat && value?.ORB) return value as Cv;
  return new Promise<Cv>((resolve, reject) => {
    if (!value) {
      reject(new Error("OpenCV.js is unavailable"));
      return;
    }
    const previous = value.onRuntimeInitialized;
    value.onRuntimeInitialized = () => {
      previous?.();
      resolve(value as Cv);
    };
    window.setTimeout(() => reject(new Error("OpenCV.js timed out")), 15000);
  });
}

async function loadCv() {
  if (!cvPromise) {
    const browserCandidate =
      typeof window !== "undefined"
        ? (globalThis as Record<string, unknown>).cv
        : undefined;
    cvPromise = browserCandidate
      ? resolveCvCandidate(browserCandidate)
      : import("@techstark/opencv-js").then(async (module) => {
          const exported = (module as { default?: unknown }).default ?? module;
          return resolveCvCandidate(exported);
        });
  }
  return cvPromise;
}

function loadImage(path: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Reference image failed: ${path}`));
    image.src = path;
  });
}

function drawSquare(source: CanvasImageSource, size = 480) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.fillStyle = "#000";
  context.fillRect(0, 0, size, size);
  context.drawImage(source, 0, 0, size, size);
  return canvas;
}

function extractOrb(cv: Cv, canvas: HTMLCanvasElement) {
  const rgba = cv.imread(canvas);
  const gray = new cv.Mat();
  const mask = cv.Mat.zeros(rgba.rows, rgba.cols, cv.CV_8UC1);
  const center = new cv.Point(rgba.cols / 2, rgba.rows / 2);
  cv.circle(mask, center, rgba.cols * 0.47, new cv.Scalar(255), -1);
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const orb = new cv.ORB(850, 1.2, 8, 20);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  orb.detectAndCompute(gray, mask, keypoints, descriptors);
  rgba.delete();
  gray.delete();
  mask.delete();
  orb.delete();
  return {
    keypoints,
    descriptors,
    width: canvas.width,
    height: canvas.height,
  };
}

function estimateMatchGeometry(
  cv: Cv,
  sourceKeypoints: any,
  targetKeypoints: any,
  matches: Array<{ queryIdx: number; trainIdx: number }>,
  sourceSize: { width: number; height: number },
  targetSize: { width: number; height: number },
) {
  if (matches.length < 8) return { inliers: 0, anchor: null };
  const sourcePoints: number[] = [];
  const targetPoints: number[] = [];
  for (const match of matches) {
    const source = sourceKeypoints.get(match.queryIdx).pt;
    const target = targetKeypoints.get(match.trainIdx).pt;
    sourcePoints.push(source.x, source.y);
    targetPoints.push(target.x, target.y);
  }
  const sourceMat = cv.matFromArray(
    matches.length,
    1,
    cv.CV_32FC2,
    sourcePoints,
  );
  const targetMat = cv.matFromArray(
    matches.length,
    1,
    cv.CV_32FC2,
    targetPoints,
  );
  const mask = new cv.Mat();
  let homography: any = null;
  let inliers = 0;
  let anchor: TrackedQuad | null = null;
  try {
    homography = cv.findHomography(
      sourceMat,
      targetMat,
      cv.RANSAC,
      5,
      mask,
    );
    for (let i = 0; i < mask.rows; i += 1) {
      if (mask.ucharPtr(i, 0)[0]) inliers += 1;
    }
    if (inliers >= 6 && homography && !homography.empty()) {
      const sourceCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        sourceSize.width,
        0,
        sourceSize.width,
        sourceSize.height,
        0,
        sourceSize.height,
      ]);
      const targetCorners = new cv.Mat();
      try {
        cv.perspectiveTransform(sourceCorners, targetCorners, homography);
        const values = targetCorners.data32F;
        const candidate: TrackedQuad = [
          {
            x: values[0] / targetSize.width,
            y: values[1] / targetSize.height,
          },
          {
            x: values[2] / targetSize.width,
            y: values[3] / targetSize.height,
          },
          {
            x: values[4] / targetSize.width,
            y: values[5] / targetSize.height,
          },
          {
            x: values[6] / targetSize.width,
            y: values[7] / targetSize.height,
          },
        ];
        if (validateTrackedQuad(candidate).valid) anchor = candidate;
      } finally {
        sourceCorners.delete();
        targetCorners.delete();
      }
    }
  } catch {
    inliers = 0;
    anchor = null;
  } finally {
    homography?.delete?.();
    mask.delete();
    sourceMat.delete();
    targetMat.delete();
  }
  return { inliers, anchor };
}

function matchReference(
  cv: Cv,
  frame: {
    keypoints: any;
    descriptors: any;
    width: number;
    height: number;
  },
  reference: IndexedReference,
) {
  if (frame.descriptors.empty() || reference.descriptors.empty()) {
    return { goodMatches: 0, inliers: 0, anchor: null };
  }
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  const good: Array<{ queryIdx: number; trainIdx: number }> = [];
  try {
    matcher.knnMatch(reference.descriptors, frame.descriptors, knn, 2);
    for (let i = 0; i < knn.size(); i += 1) {
      const pair = knn.get(i);
      if (pair.size() >= 2) {
        const first = pair.get(0);
        const second = pair.get(1);
        if (first.distance < second.distance * 0.76) {
          good.push({ queryIdx: first.queryIdx, trainIdx: first.trainIdx });
        }
      }
      pair.delete();
    }
  } finally {
    knn.delete();
    matcher.delete();
  }
  const geometry = estimateMatchGeometry(
    cv,
    reference.keypoints,
    frame.keypoints,
    good,
    reference,
    frame,
  );
  return { goodMatches: good.length, ...geometry };
}

export class LocalRecognizer {
  private cv: Cv | null = null;
  private references: IndexedReference[] = [];

  async initialize() {
    if (this.references.length) return;
    this.cv = await loadCv();
    const images = await Promise.all(
      AMINO_ACIDS.map((acid) => loadImage(acid.referencePath)),
    );
    this.references = images.map((image, index) => {
      const features = extractOrb(this.cv!, drawSquare(image));
      return { acid: AMINO_ACIDS[index], ...features };
    });
  }

  private referenceForId(id: AminoAcidId) {
    return this.references.find(({ acid }) => acid.id === id) ?? null;
  }

  async track(
    canvas: HTMLCanvasElement,
    id: AminoAcidId,
  ): Promise<LocalTrackingResult | null> {
    await this.initialize();
    const reference = this.referenceForId(id);
    if (!reference || !this.cv) return null;
    const frameCanvas =
      canvas.width === canvas.height ? canvas : drawSquare(canvas, 360);
    const frame = extractOrb(this.cv, frameCanvas);
    try {
      const matched = matchReference(this.cv, frame, reference);
      if (matched.inliers < 6) return null;
      return {
        id,
        goodMatches: matched.goodMatches,
        inliers: matched.inliers,
        anchor: matched.anchor,
      };
    } finally {
      frame.keypoints.delete();
      frame.descriptors.delete();
    }
  }

  async recognize(canvas: HTMLCanvasElement): Promise<FrameAssessment> {
    await this.initialize();
    const cv = this.cv!;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { result: null, quality: "too-dark" };
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const profile = profileImageData(pixels.data, pixels.width, pixels.height);
    let bright = 0;
    let saturated = 0;
    const samples = Math.max(1, Math.floor(pixels.data.length / 4));
    for (let i = 0; i < pixels.data.length; i += 16) {
      const r = pixels.data[i];
      const g = pixels.data[i + 1];
      const b = pixels.data[i + 2];
      if (r > 242 && g > 242 && b > 242) bright += 4;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 30) saturated += 4;
    }
    const quality = assessFrameQuality(
      profile,
      bright / samples,
      saturated / samples,
    );
    if (quality !== "ok") return { result: null, quality };

    const frameCanvas =
      canvas.width === 480 && canvas.height === 480
        ? canvas
        : drawSquare(canvas);
    const frame = extractOrb(cv, frameCanvas);
    try {
      const candidates = this.references
        .map((reference) => ({
          reference,
          colorDistance: themeColorDistance(
            profile,
            reference.acid.themeRgb,
          ),
        }))
        .sort((a, b) => a.colorDistance - b.colorDistance)
        .slice(0, 3)
        .map(({ reference, colorDistance }) => {
          const matched = matchReference(cv, frame, reference);
          let featureScore =
            Math.min(1, matched.inliers / 14) * 0.85 +
            Math.min(1, matched.goodMatches / 60) * 0.15;
          if (matched.inliers < 6) featureScore *= 0.4;
          const colorScore = 1 - colorDistance;
          return {
            id: reference.acid.id,
            score: featureScore * 0.55 + colorScore * 0.45,
            ...matched,
          };
        })
        .sort((a, b) => b.score - a.score);

      const winner = candidates[0];
      const runnerUp = candidates[1];
      if (!winner) return { result: null, quality };
      return {
        quality,
        result: {
          ...winner,
          margin: winner.score - (runnerUp?.score ?? 0),
          source: "local",
          quality,
        },
      };
    } finally {
      frame.keypoints.delete();
      frame.descriptors.delete();
    }
  }

  dispose() {
    this.references.forEach(({ keypoints, descriptors }) => {
      keypoints.delete();
      descriptors.delete();
    });
    this.references = [];
  }
}

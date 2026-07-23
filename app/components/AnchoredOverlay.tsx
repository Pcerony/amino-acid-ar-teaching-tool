"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AminoAcid } from "../data/aminoAcids";
import type { Molecule } from "../lib/molecule";
import {
  cssMatrixForQuad,
  type TrackedQuad,
} from "../lib/faceTracking";
import { MoleculeViewer } from "./MoleculeViewer";

const PLANE_SIZE = 240;

export function AnchoredOverlay({
  acid,
  molecule,
  quad,
  active,
  holding,
  onOpenLesson,
}: {
  acid: AminoAcid;
  molecule: Molecule;
  quad: TrackedQuad;
  active: boolean;
  holding: boolean;
  onOpenLesson: () => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [guideSize, setGuideSize] = useState(0);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const updateSize = () => setGuideSize(layer.getBoundingClientRect().width);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const transform = useMemo(() => {
    if (!guideSize) return "matrix3d(0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1)";
    const pixels = quad.map(({ x, y }) => ({
      x: x * guideSize,
      y: y * guideSize,
    }));
    return `matrix3d(${cssMatrixForQuad(pixels, PLANE_SIZE).join(",")})`;
  }, [guideSize, quad]);

  return (
    <div
      ref={layerRef}
      className={`ar-anchor-layer ${holding ? "is-holding" : "is-tracked"}`}
      aria-live="polite"
    >
      <button
        className="ar-anchor-plane"
        type="button"
        style={{
          "--acid-color": acid.theme,
          transform,
        } as React.CSSProperties}
        onClick={onOpenLesson}
        aria-label={`${acid.nameJa}の学習カードをひらく`}
      >
        <span className="ar-anchor-ring" aria-hidden="true" />
        <span className="ar-molecule-shell">
          <MoleculeViewer
            molecule={molecule}
            theme={acid.theme}
            active={active}
          />
        </span>
        <span className="ar-anchor-name">{acid.nameJa}</span>
        <span className="ar-anchor-code">{acid.code}</span>
      </button>
    </div>
  );
}

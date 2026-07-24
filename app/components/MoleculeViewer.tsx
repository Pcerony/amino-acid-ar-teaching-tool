"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Molecule,
  type MoleculeElement,
  projectMolecule,
} from "../lib/molecule";

const ATOM_SCALE: Record<MoleculeElement, number> = {
  H: 0.1,
  C: 0.2,
  N: 0.23,
  O: 0.23,
  S: 0.25,
};

function MoleculeFallback({
  molecule,
  theme,
}: {
  molecule: Molecule;
  theme: string;
}) {
  const points = useMemo(
    () => projectMolecule(molecule, { yaw: -0.48, pitch: 0.38 }),
    [molecule],
  );
  return (
    <svg
      className="molecule-fallback"
      viewBox="0 0 100 100"
      role="img"
      aria-label="分子構造の平面表示"
    >
      {molecule.bonds.flatMap((bond, bondIndex) => {
        const from = points[bond.atoms[0]];
        const to = points[bond.atoms[1]];
        const dx = (to.x - from.x) * 100;
        const dy = (to.y - from.y) * 100;
        const length = Math.max(Math.hypot(dx, dy), Number.EPSILON);
        const offsetX = (-dy / length) * 1.2;
        const offsetY = (dx / length) * 1.2;
        const offsets =
          bond.order === 1 ? [0] : bond.order === 2 ? [-1, 1] : [-1.5, 0, 1.5];
        return offsets.map((offset, lineIndex) => (
          <line
            key={`${bondIndex}-${lineIndex}`}
            x1={from.x * 100 + offsetX * offset}
            y1={from.y * 100 + offsetY * offset}
            x2={to.x * 100 + offsetX * offset}
            y2={to.y * 100 + offsetY * offset}
            stroke={theme}
            strokeOpacity="0.72"
            strokeWidth={bond.order === 1 ? 2.6 : 1.7}
            strokeLinecap="round"
          />
        ));
      })}
      {molecule.atoms.map((atom, index) => {
        const point = points[index];
        const radius = atom.element === "H" ? 2.1 : 3.4;
        return (
          <g key={`${atom.element}-${index}`}>
            <circle
              cx={point.x * 100}
              cy={point.y * 100}
              r={radius}
              fill={theme}
              stroke="rgba(255,255,255,.92)"
              strokeWidth="0.8"
            />
            {atom.element !== "C" && atom.element !== "H" && (
              <text
                x={point.x * 100}
                y={point.y * 100 + 1.5}
                textAnchor="middle"
                fontSize="4.6"
                fontWeight="800"
                fill="#fff"
              >
                {atom.element}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function MoleculeViewer({
  molecule,
  theme,
  active,
}: {
  molecule: Molecule;
  theme: string;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const controlsRef = useRef<{ start: () => void; stop: () => void } | null>(
    null,
  );
  const [fallback, setFallback] = useState(false);
  const [threeReady, setThreeReady] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    if (active) controlsRef.current?.start();
    else controlsRef.current?.stop();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let animationFrame = 0;
    let lastFrameAt = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let sphereGeometry: import("three").SphereGeometry | null = null;
    let bondGeometry: import("three").CylinderGeometry | null = null;
    const materials: import("three").Material[] = [];
    let renderOnce = () => {};

    const stop = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (!disposed) renderOnce();
    };

    setFallback(false);
    setThreeReady(false);
    void import("three")
      .then((THREE) => {
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.setSize(220, 220, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-2.35, 2.35, 2.35, -2.35, 0.1, 100);
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.AmbientLight(0xffffff, 1.55));
        const directional = new THREE.DirectionalLight(0xffffff, 2.1);
        directional.position.set(3, 4, 6);
        scene.add(directional);

        const group = new THREE.Group();
        scene.add(group);
        const raw = molecule.atoms.map(({ position }) =>
          new THREE.Vector3(...position),
        );
        const bounds = new THREE.Box3().setFromPoints(raw);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const scale = 3.2 / Math.max(size.x, size.y, size.z, 1);
        const positions = raw.map((position) =>
          position.clone().sub(center).multiplyScalar(scale),
        );

        sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
        bondGeometry = new THREE.CylinderGeometry(0.075, 0.075, 1, 8);
        const base = new THREE.Color(theme);
        const materialForElement = new Map<MoleculeElement, import("three").MeshStandardMaterial>();
        const elementLightness: Record<MoleculeElement, number> = {
          C: 0,
          H: 0.25,
          N: -0.08,
          O: 0.12,
          S: -0.16,
        };
        for (const element of Object.keys(ATOM_SCALE) as MoleculeElement[]) {
          const color = base.clone().offsetHSL(0, element === "H" ? -0.12 : 0, elementLightness[element]);
          const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.48,
            metalness: 0.02,
          });
          materials.push(material);
          materialForElement.set(element, material);
        }
        const bondMaterial = new THREE.MeshStandardMaterial({
          color: base.clone().offsetHSL(0, -0.1, 0.16),
          roughness: 0.52,
          metalness: 0,
        });
        materials.push(bondMaterial);

        molecule.atoms.forEach((atom, index) => {
          const mesh = new THREE.Mesh(
            sphereGeometry!,
            materialForElement.get(atom.element)!,
          );
          mesh.position.copy(positions[index]);
          mesh.scale.setScalar(ATOM_SCALE[atom.element]);
          group.add(mesh);
        });

        const up = new THREE.Vector3(0, 1, 0);
        const cameraAxis = new THREE.Vector3(0, 0, 1);
        molecule.bonds.forEach((bond) => {
          const from = positions[bond.atoms[0]];
          const to = positions[bond.atoms[1]];
          const direction = to.clone().sub(from);
          const length = direction.length();
          if (!length) return;
          const perpendicular = direction
            .clone()
            .cross(cameraAxis)
            .normalize()
            .multiplyScalar(0.09);
          const offsets =
            bond.order === 1
              ? [0]
              : bond.order === 2
                ? [-0.7, 0.7]
                : [-1, 0, 1];
          for (const offset of offsets) {
            const mesh = new THREE.Mesh(bondGeometry!, bondMaterial);
            mesh.position
              .copy(from)
              .add(to)
              .multiplyScalar(0.5)
              .addScaledVector(perpendicular, offset);
            mesh.quaternion.setFromUnitVectors(
              up,
              direction.clone().normalize(),
            );
            mesh.scale.set(
              bond.order === 1 ? 1 : 0.72,
              length,
              bond.order === 1 ? 1 : 0.72,
            );
            group.add(mesh);
          }
        });

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const render = (now: number) => {
          if (disposed || document.hidden || !activeRef.current) {
            animationFrame = 0;
            return;
          }
          animationFrame = window.requestAnimationFrame(render);
          if (now - lastFrameAt < 1000 / 20) return;
          if (!reducedMotion && lastFrameAt) {
            group.rotation.y += ((now - lastFrameAt) / 1000) * 0.22;
          }
          lastFrameAt = now;
          renderer!.render(scene, camera);
        };
        renderOnce = () => {
          if (!disposed && !document.hidden) renderer!.render(scene, camera);
        };
        const start = () => {
          if (!animationFrame && !document.hidden && activeRef.current) {
            animationFrame = window.requestAnimationFrame(render);
          }
        };
        const handleVisibility = () => {
          if (document.hidden) stop();
          else start();
        };
        const handleContextLost = (event: Event) => {
          event.preventDefault();
          if (disposed) return;
          if (animationFrame) window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
          setThreeReady(false);
          setFallback(true);
        };
        document.addEventListener("visibilitychange", handleVisibility);
        canvas.addEventListener("webglcontextlost", handleContextLost, false);
        controlsRef.current = { start, stop };
        if (activeRef.current) start();
        else renderOnce();
        setThreeReady(true);
        setFallback(false);

        cleanup = () => {
          document.removeEventListener("visibilitychange", handleVisibility);
          canvas.removeEventListener("webglcontextlost", handleContextLost);
          stop();
          controlsRef.current = null;
          disposed = true;
          sphereGeometry?.dispose();
          bondGeometry?.dispose();
          materials.forEach((material) => material.dispose());
          renderer?.dispose();
          renderer?.forceContextLoss();
        };
      })
      .catch(() => {
        if (!disposed) {
          setThreeReady(false);
          setFallback(true);
        }
      });

    let cleanup = () => {
      disposed = true;
      stop();
      controlsRef.current = null;
      sphereGeometry?.dispose();
      bondGeometry?.dispose();
      materials.forEach((material) => material.dispose());
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
    return () => cleanup();
  }, [molecule, theme]);

  return (
    <span className="molecule-viewer">
      <canvas
        ref={canvasRef}
        className="molecule-canvas"
        width="220"
        height="220"
        aria-label="3D分子構造"
        aria-hidden={!threeReady || fallback}
      />
      {(!threeReady || fallback) && (
        <MoleculeFallback molecule={molecule} theme={theme} />
      )}
    </span>
  );
}

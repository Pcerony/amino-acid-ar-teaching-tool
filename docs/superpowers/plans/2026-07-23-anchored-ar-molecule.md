# Anchored AR Molecule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有八种氨基酸识别页面中加入单面透视追踪、环形贴面信息和准确的 Three.js 3D 分子模型，并保持中端手机上的可控性能。

**Architecture:** 现有 OpenCV.js 八选一识别负责确认类别；确认后切换为只匹配当前参考图的单目标追踪，并输出归一化四角。纯函数模块验证和平滑四角，再生成 CSS `matrix3d` 将环形信息与 Three.js 画布贴到目标面。真实分子坐标由 PubChem 3D conformer 离线生成，运行时不请求网络。

**Tech Stack:** TypeScript、React 19、OpenCV.js、Three.js、Node test runner、Vite/Vinext、GitHub Pages

---

## 文件结构

- Create: `app/data/molecules.ts`：八种氨基酸的离线原子、化学键和 3D 坐标。
- Create: `app/lib/molecule.ts`：分子数据校验、尺寸归一化和二维降级投影。
- Create: `scripts/fetch-molecules.mjs`：从 PubChem 获取并确定性生成 `molecules.ts`。
- Create: `app/lib/faceTracking.ts`：四边形验证、平滑、保持状态和 CSS 透视矩阵。
- Modify: `app/lib/localRecognizer.ts`：返回 RANSAC 四角并支持当前目标单独追踪。
- Create: `app/components/MoleculeViewer.tsx`：按需加载 Three.js 的轻量球棍模型和二维降级。
- Create: `app/components/AnchoredOverlay.tsx`：环形构图、名称、缩写和贴面矩阵。
- Modify: `app/AminoAcidScanner.tsx`：寻找/锁定状态切换、动态频率和学习卡片入口。
- Modify: `app/globals.css`：AR 环、贴面层、紧凑学习入口和降级样式。
- Modify: `package.json`、`package-lock.json`：加入 Three.js 与分子数据生成命令。
- Create: `tests/molecules.test.mjs`：分子式、索引、化学键和投影测试。
- Create: `tests/face-tracking.test.mjs`：透视映射、四边形过滤和平滑状态测试。
- Create: `tests/ar-contract.test.mjs`：识别器追踪接口和 AR 组件契约测试。
- Create: `tests/performance-contract.test.mjs`：分析频率、像素比与生命周期预算测试。

### Task 1: 生成并验证真实分子数据

**Files:**
- Create: `scripts/fetch-molecules.mjs`
- Create: `app/data/molecules.ts`
- Create: `app/lib/molecule.ts`
- Create: `tests/molecules.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 写分子数据失败测试**

创建 `tests/molecules.test.mjs`，覆盖八种分子、分子式、键索引、重复键和二维投影：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { AMINO_ACID_IDS } from "../app/data/aminoAcids.ts";
import { MOLECULES } from "../app/data/molecules.ts";
import {
  formulaForAtoms,
  projectMolecule,
  validateMolecule,
} from "../app/lib/molecule.ts";

const FORMULAS = {
  alanine: "C3H7NO2",
  valine: "C5H11NO2",
  leucine: "C6H13NO2",
  isoleucine: "C6H13NO2",
  methionine: "C5H11NO2S",
  phenylalanine: "C9H11NO2",
  tryptophan: "C11H12N2O2",
  proline: "C5H9NO2",
};

test("contains one valid offline 3D molecule for every printed face", () => {
  assert.deepEqual(Object.keys(MOLECULES).sort(), [...AMINO_ACID_IDS].sort());
  for (const id of AMINO_ACID_IDS) {
    const molecule = MOLECULES[id];
    assert.deepEqual(validateMolecule(molecule), []);
    assert.equal(formulaForAtoms(molecule.atoms), FORMULAS[id]);
  }
});

test("projects every atom into a finite normalized 2D fallback", () => {
  for (const molecule of Object.values(MOLECULES)) {
    const points = projectMolecule(molecule, { yaw: -0.48, pitch: 0.38 });
    assert.equal(points.length, molecule.atoms.length);
    for (const point of points) {
      assert.ok(Number.isFinite(point.x));
      assert.ok(Number.isFinite(point.y));
      assert.ok(point.x >= 0 && point.x <= 1);
      assert.ok(point.y >= 0 && point.y <= 1);
    }
  }
});
```

- [ ] **Step 2: 运行测试并确认缺少模块**

Run:

```bash
node --test tests/molecules.test.mjs
```

Expected: FAIL，错误包含 `Cannot find module 'app/data/molecules.ts'`。

- [ ] **Step 3: 实现纯分子工具**

创建 `app/lib/molecule.ts`：

```ts
export type MoleculeAtom = {
  element: "C" | "H" | "N" | "O" | "S";
  position: readonly [number, number, number];
};

export type MoleculeBond = {
  atoms: readonly [number, number];
  order: 1 | 2 | 3;
};

export type Molecule = {
  cid: number;
  atoms: readonly MoleculeAtom[];
  bonds: readonly MoleculeBond[];
};

const ELEMENT_ORDER = ["C", "H", "N", "O", "S"] as const;

export function formulaForAtoms(atoms: readonly MoleculeAtom[]) {
  const counts = new Map<string, number>();
  for (const atom of atoms) {
    counts.set(atom.element, (counts.get(atom.element) ?? 0) + 1);
  }
  return ELEMENT_ORDER.flatMap((element) => {
    const count = counts.get(element) ?? 0;
    return count ? `${element}${count === 1 ? "" : count}` : [];
  }).join("");
}

export function validateMolecule(molecule: Molecule) {
  const errors: string[] = [];
  const seen = new Set<string>();
  molecule.bonds.forEach((bond, index) => {
    const [a, b] = bond.atoms;
    if (a === b) errors.push(`bond ${index} connects an atom to itself`);
    if (a < 0 || b < 0 || a >= molecule.atoms.length || b >= molecule.atoms.length) {
      errors.push(`bond ${index} has an invalid atom index`);
    }
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) errors.push(`bond ${index} duplicates ${key}`);
    seen.add(key);
  });
  return errors;
}

export function projectMolecule(
  molecule: Molecule,
  rotation: { yaw: number; pitch: number },
) {
  const rotated = molecule.atoms.map(({ position: [x, y, z] }) => {
    const x1 = x * Math.cos(rotation.yaw) + z * Math.sin(rotation.yaw);
    const z1 = -x * Math.sin(rotation.yaw) + z * Math.cos(rotation.yaw);
    const y1 = y * Math.cos(rotation.pitch) - z1 * Math.sin(rotation.pitch);
    return { x: x1, y: y1 };
  });
  const xs = rotated.map(({ x }) => x);
  const ys = rotated.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, Number.EPSILON);
  const height = Math.max(maxY - minY, Number.EPSILON);
  return rotated.map(({ x, y }) => ({
    x: (x - minX) / width,
    y: 1 - (y - minY) / height,
  }));
}
```

- [ ] **Step 4: 编写确定性 PubChem 生成脚本**

创建 `scripts/fetch-molecules.mjs`，使用下列固定名称和预期 CID：

```js
const COMPOUNDS = {
  alanine: ["L-alanine", 5950],
  valine: ["L-valine", 6287],
  leucine: ["L-leucine", 6106],
  isoleucine: ["L-isoleucine", 6306],
  methionine: ["L-methionine", 6137],
  phenylalanine: ["L-phenylalanine", 6140],
  tryptophan: ["L-tryptophan", 6305],
  proline: ["L-proline", 145742],
};
```

脚本必须：

1. 请求 `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/<name>/SDF?record_type=3d`。
2. 解析 V2000 原子和化学键区块。
3. 把 SDF 的一基索引转换成 TypeScript 的零基索引。
4. 核对响应 CID 与固定 CID。
5. 按 `COMPOUNDS` 顺序生成稳定的 `app/data/molecules.ts`。
6. 使用 `writeFile` 写入文件，并在文件头标注自动生成来源。

在 `package.json` 增加：

```json
"molecules:generate": "node scripts/fetch-molecules.mjs"
```

- [ ] **Step 5: 生成离线数据**

Run:

```bash
npm run molecules:generate
```

Expected: 输出八个 PubChem CID，生成 `app/data/molecules.ts`。

- [ ] **Step 6: 运行测试并确认通过**

Run:

```bash
node --test tests/molecules.test.mjs
```

Expected: 2 tests PASS。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json scripts/fetch-molecules.mjs app/data/molecules.ts app/lib/molecule.ts tests/molecules.test.mjs
git commit -m "feat: add validated amino acid molecule data"
```

### Task 2: 实现透视锚点与追踪平滑

**Files:**
- Create: `app/lib/faceTracking.ts`
- Create: `tests/face-tracking.test.mjs`

- [ ] **Step 1: 写失败测试**

创建 `tests/face-tracking.test.mjs`：

```js
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
  const source = [[0, 0], [300, 0], [300, 300], [0, 300]];
  source.forEach(([x, y], index) => {
    const point = applyProjectiveMatrix(matrix, x, y);
    assert.ok(Math.abs(point.x - target[index].x) < 0.001);
    assert.ok(Math.abs(point.y - target[index].y) < 0.001);
  });
});

test("rejects tiny, non-convex, and far-outside quads", () => {
  assert.equal(validateTrackedQuad(square).valid, true);
  assert.equal(validateTrackedQuad(square.map((p) => ({ x: p.x * 0.1, y: p.y * 0.1 }))).valid, false);
  assert.equal(validateTrackedQuad([square[0], square[2], square[1], square[3]]).valid, false);
  assert.equal(validateTrackedQuad(square.map((p) => ({ x: p.x + 2, y: p.y }))).valid, false);
});

test("smooths movement, holds briefly, then reports loss", () => {
  const smoother = new AnchorSmoother({ alpha: 0.35, holdMs: 400 });
  assert.equal(smoother.push(square, 0).state, "tracked");
  const moved = square.map((p) => ({ x: p.x + 0.1, y: p.y }));
  const smoothed = smoother.push(moved, 100);
  assert.ok(smoothed.quad[0].x > 0.2 && smoothed.quad[0].x < 0.3);
  assert.equal(smoother.push(null, 350).state, "holding");
  assert.equal(smoother.push(null, 501).state, "lost");
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
node --test tests/face-tracking.test.mjs
```

Expected: FAIL，缺少 `app/lib/faceTracking.ts`。

- [ ] **Step 3: 实现几何和状态**

创建 `app/lib/faceTracking.ts`，导出：

```ts
export type Point2 = { x: number; y: number };
export type TrackedQuad = readonly [Point2, Point2, Point2, Point2];
export type AnchorState = {
  state: "tracked" | "holding" | "lost";
  quad: TrackedQuad | null;
};

export function validateTrackedQuad(
  quad: readonly Point2[],
): { valid: boolean; area: number };

export function cssMatrixForQuad(
  quadPixels: readonly Point2[],
  sourceSize: number,
): readonly number[];

export function applyProjectiveMatrix(
  matrix: readonly number[],
  x: number,
  y: number,
): Point2;

export class AnchorSmoother {
  constructor(options?: { alpha?: number; holdMs?: number });
  push(quad: TrackedQuad | null, now: number): AnchorState;
  reset(): void;
}
```

`validateTrackedQuad` 使用鞋带公式计算面积，要求：

- 恰好四点。
- 归一化面积在 `0.035` 到 `1.5` 之间。
- 四个连续叉积同号。
- 每个坐标位于 `[-0.25, 1.25]`。

`AnchorSmoother` 使用 `previous + alpha * (next - previous)`，并在丢失后
`holdMs` 内返回最后四角。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```bash
node --test tests/face-tracking.test.mjs
```

Expected: 3 tests PASS。

- [ ] **Step 5: 提交**

```bash
git add app/lib/faceTracking.ts tests/face-tracking.test.mjs
git commit -m "feat: add planar AR anchor tracking"
```

### Task 3: 让 OpenCV 识别器输出并追踪目标四角

**Files:**
- Modify: `app/lib/localRecognizer.ts`
- Create: `tests/ar-contract.test.mjs`

- [ ] **Step 1: 写追踪接口失败测试**

创建 `tests/ar-contract.test.mjs`：

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local recognizer exposes normalized planar anchors and target-only tracking", async () => {
  const source = await readFile(
    new URL("../app/lib/localRecognizer.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /anchor:\s*TrackedQuad\s*\|\s*null/);
  assert.match(source, /perspectiveTransform/);
  assert.match(source, /async track\(/);
  assert.match(source, /referenceForId/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
node --test tests/ar-contract.test.mjs
```

Expected: FAIL，断言找不到 `anchor: TrackedQuad | null`。

- [ ] **Step 3: 扩展 RANSAC 结果**

修改 `app/lib/localRecognizer.ts`：

- 导入 `TrackedQuad` 和 `validateTrackedQuad`。
- 把 `countInliers` 改为 `estimateMatchGeometry`。
- 在 `findHomography` 成功后，用 `cv.perspectiveTransform` 投影
  `(0,0)`、`(480,0)`、`(480,480)`、`(0,480)`。
- 将投影坐标除以帧宽高得到归一化四角。
- 只有内点不少于 6 且 `validateTrackedQuad` 有效时返回四角。

扩展结果：

```ts
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
  anchor: TrackedQuad;
};
```

在 `LocalRecognizer` 中增加：

```ts
private referenceForId(id: AminoAcidId) {
  return this.references.find(({ acid }) => acid.id === id) ?? null;
}

async track(
  canvas: HTMLCanvasElement,
  id: AminoAcidId,
): Promise<LocalTrackingResult | null>;
```

`track` 只匹配 `referenceForId(id)`，内点少于 6或四角无效时返回 `null`。

- [ ] **Step 4: 运行契约与现有识别测试**

Run:

```bash
node --test tests/ar-contract.test.mjs tests/recognizer-contract.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add app/lib/localRecognizer.ts tests/ar-contract.test.mjs
git commit -m "feat: expose target pose from local recognition"
```

### Task 4: 构建轻量 Three.js 分子查看器

**Files:**
- Create: `app/components/MoleculeViewer.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/ar-contract.test.mjs`

- [ ] **Step 1: 安装 Three.js**

Run:

```bash
npm install three
npm install --save-dev @types/three
```

Expected: `package.json` 出现 `three` 和 `@types/three`。

- [ ] **Step 2: 先扩展失败测试**

在 `tests/ar-contract.test.mjs` 增加：

```js
test("molecule viewer lazy-loads Three and enforces the mobile render budget", async () => {
  const source = await readFile(
    new URL("../app/components/MoleculeViewer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /import\("three"\)/);
  assert.match(source, /Math\.min\(window\.devicePixelRatio,\s*1\.25\)/);
  assert.match(source, /powerPreference:\s*"low-power"/);
  assert.match(source, /antialias:\s*false/);
  assert.match(source, /projectMolecule/);
});
```

- [ ] **Step 3: 运行并确认失败**

Run:

```bash
node --test tests/ar-contract.test.mjs
```

Expected: FAIL，缺少 `MoleculeViewer.tsx`。

- [ ] **Step 4: 实现查看器**

创建 `app/components/MoleculeViewer.tsx`：

```tsx
"use client";

export function MoleculeViewer({
  molecule,
  theme,
  active,
}: {
  molecule: Molecule;
  theme: string;
  active: boolean;
}) {
  // canvasRef、fallback state、visibility lifecycle
}
```

实现要求：

- `useEffect` 内执行 `import("three")`。
- `WebGLRenderer` 使用 `{ alpha: true, antialias: false, powerPreference: "low-power" }`。
- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))`。
- 共享一个 `SphereGeometry(1, 12, 8)`。
- 共享一个 `CylinderGeometry(0.12, 0.12, 1, 8)`。
- 原子大小：H `0.16`、C `0.28`、N/O/S `0.31`。
- 双键和三键使用平行圆柱体，不能用一根粗柱替代。
- 用包围盒中心归一化模型，使最长轴为 3.2 个场景单位。
- 只使用 `AmbientLight` 和 `DirectionalLight`。
- 自转速度为每秒约 0.22 弧度。
- 最高 30 FPS；`active === false` 或 `document.hidden` 时停止请求新帧。
- 初始化失败时使用 `projectMolecule` 生成 SVG 球棍投影。
- cleanup 释放 renderer、材质、几何和事件监听。

- [ ] **Step 5: 运行测试**

Run:

```bash
node --test tests/ar-contract.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json app/components/MoleculeViewer.tsx tests/ar-contract.test.mjs
git commit -m "feat: render lightweight 3D amino acid models"
```

### Task 5: 构建环形贴面 AR 组件

**Files:**
- Create: `app/components/AnchoredOverlay.tsx`
- Modify: `app/globals.css`
- Modify: `tests/ar-contract.test.mjs`

- [ ] **Step 1: 写组件失败测试**

在 `tests/ar-contract.test.mjs` 增加：

```js
test("anchored overlay uses the selected ring layout and projective matrix", async () => {
  const source = await readFile(
    new URL("../app/components/AnchoredOverlay.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /cssMatrixForQuad/);
  assert.match(source, /MoleculeViewer/);
  assert.match(source, /aria-label=.*学習カード/);
  assert.match(source, /ar-anchor-ring/);
});
```

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
node --test tests/ar-contract.test.mjs
```

Expected: FAIL，缺少 `AnchoredOverlay.tsx`。

- [ ] **Step 3: 实现贴面组件**

创建 `app/components/AnchoredOverlay.tsx`：

```tsx
export function AnchoredOverlay({
  acid,
  molecule,
  quad,
  active,
  onOpenLesson,
}: {
  acid: AminoAcid;
  molecule: Molecule;
  quad: TrackedQuad;
  active: boolean;
  onOpenLesson: () => void;
}) {
  // ResizeObserver 读取 guide 尺寸；
  // 将归一化四角转成像素；
  // 使用 cssMatrixForQuad 生成 matrix3d。
}
```

DOM 结构：

```tsx
<button className="ar-anchor-plane" style={{ transform }} onClick={onOpenLesson}>
  <span className="ar-anchor-ring" />
  <MoleculeViewer molecule={molecule} theme={acid.theme} active={active} />
  <span className="ar-anchor-name">{acid.nameJa}</span>
  <span className="ar-anchor-code">{acid.code}</span>
</button>
```

要求：

- 逻辑平面固定为 `240 × 240`。
- `transformOrigin: "0 0"`。
- 不在 React render 中读取布局。
- 使用 `ResizeObserver` 更新 guide 尺寸。
- 环、名称、缩写和画布全部处于同一个透视容器。
- AR 按钮提供日文 `aria-label`，点击展开学习卡片。

- [ ] **Step 4: 添加环形与状态样式**

在 `app/globals.css` 增加：

- `.ar-anchor-plane`：绝对定位、透明背景、无默认按钮边框。
- `.ar-anchor-ring`：细白环，左下部分透明，减少遮挡。
- `.ar-anchor-name`：环下缘日文名称。
- `.ar-anchor-code`：紧凑缩写标签。
- `.is-holding`：降低不透明度。
- `.is-entering`：只使用 opacity 和 transform，不触发布局动画。
- `prefers-reduced-motion`：停止非必要淡入动画；分子查看器也不自转。

- [ ] **Step 5: 运行测试**

Run:

```bash
node --test tests/ar-contract.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add app/components/AnchoredOverlay.tsx app/globals.css tests/ar-contract.test.mjs
git commit -m "feat: add projective ring AR overlay"
```

### Task 6: 接入寻找、锁定、保持和学习卡片状态

**Files:**
- Modify: `app/AminoAcidScanner.tsx`
- Create: `tests/performance-contract.test.mjs`
- Modify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: 写状态与性能失败测试**

创建 `tests/performance-contract.test.mjs`：

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scanner uses separate search and target-tracking cadences", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /SEARCH_INTERVAL_MS\s*=\s*250/);
  assert.match(source, /TRACK_INTERVAL_MS\s*=\s*110/);
  assert.match(source, /SLOW_TRACK_INTERVAL_MS\s*=\s*166/);
  assert.match(source, /recognizer\.track/);
  assert.match(source, /AnchorSmoother/);
});

test("scanner pauses expensive work while the lesson is expanded or the page is hidden", async () => {
  const source = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /document\.hidden/);
  assert.match(source, /panelExpanded/);
  assert.match(source, /stopScanTimer/);
});
```

在 `tests/rendered-html.test.mjs` 增加对 `くわしく見る` 和 AR 组件容器的断言。

- [ ] **Step 2: 运行并确认失败**

Run:

```bash
node --test tests/performance-contract.test.mjs tests/rendered-html.test.mjs
```

Expected: 新增断言 FAIL。

- [ ] **Step 3: 重构扫描循环**

修改 `app/AminoAcidScanner.tsx`：

```ts
const SEARCH_INTERVAL_MS = 250;
const TRACK_INTERVAL_MS = 110;
const SLOW_TRACK_INTERVAL_MS = 166;
```

使用递归 `setTimeout` 替代固定 `setInterval`，每次任务完成后再安排下一次，确保不并发。

新增引用：

```ts
const trackedIdRef = useRef<AminoAcidId | null>(null);
const anchorSmootherRef = useRef(new AnchorSmoother({ alpha: 0.35, holdMs: 400 }));
const analysisDurationRef = useRef<number[]>([]);
```

流程：

- `trackedIdRef` 为空时调用 `recognizer.recognize`。
- 稳定确认后设置目标并优先使用识别帧返回的 `anchor`。
- 已锁定时调用 `recognizer.track(canvas, trackedId)`。
- 平均最近 8 次追踪耗时大于 90ms 时使用 `SLOW_TRACK_INTERVAL_MS`。
- 追踪连续丢失超过 400ms 后清除目标、结果和 AR 锚点，恢复寻找。
- 学习卡片完全展开时停止追踪；收起后恢复。
- 页面隐藏时停止定时器和 3D 动画。

- [ ] **Step 4: 接入 AR 和紧凑学习入口**

- 引入 `MOLECULES`、`AnchoredOverlay`、`AnchorSmoother`。
- 识别锁定后渲染 `AnchoredOverlay`。
- `LessonPanel` 默认渲染为紧凑入口，点击 AR 或入口后 `panelExpanded = true`。
- 关闭卡片只收起，不清除当前识别；“重新扫描”按钮才清除目标。
- 移除识别成功后固定在屏幕中央的视觉重点。

- [ ] **Step 5: 运行目标测试**

Run:

```bash
node --test tests/performance-contract.test.mjs tests/rendered-html.test.mjs tests/consensus.test.mjs
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add app/AminoAcidScanner.tsx tests/performance-contract.test.mjs tests/rendered-html.test.mjs
git commit -m "feat: integrate adaptive single-face AR tracking"
```

### Task 7: 完整验证、手机视觉检查和发布

**Files:**
- Modify: `README.md`
- Modify as required by verification: files from Tasks 1–6

- [ ] **Step 1: 更新中文文档**

在 `README.md` 记录：

- AR 锁定与贴面信息。
- 八种离线 3D 分子模型。
- 本地识别与隐私边界。
- 性能降级策略。
- 真实球体手机测试步骤。
- 回退标签 `pre-ar-v1.0.0`。

- [ ] **Step 2: 运行完整自动验证**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build:pages
```

Expected:

- 所有 Node tests PASS。
- ESLint 0 errors。
- TypeScript 0 errors。
- GitHub Pages 静态构建 exit 0。

- [ ] **Step 3: 启动静态预览**

Run:

```bash
python3 -m http.server 4173 --directory pages-dist
```

Expected: `http://localhost:4173/` 返回 200。

- [ ] **Step 4: 手机视口视觉检查**

使用浏览器在 `390 × 844` 与 `430 × 932` 检查：

- 空闲页面没有文字重叠。
- `?demo=tryptophan` 展示环形 AR 构图和完整色氨酸模型。
- 学习卡片默认紧凑，点击后展开。
- 3D 模型画布非空，名称和缩写未超出环。
- WebGL 禁用时二维投影非空。
- 页面隐藏后动画与扫描定时器停止。

- [ ] **Step 5: 真实参考图回归**

依次上传 `public/references/*.png`，确认八张图均显示对应日文名称、缩写和分子。

- [ ] **Step 6: 提交验证修正**

```bash
git add README.md app tests package.json package-lock.json scripts
git commit -m "docs: document anchored AR teaching mode"
```

- [ ] **Step 7: 推送并检查 GitHub Pages**

```bash
git push origin main
gh run watch --repo Pcerony/amino-acid-ar-teaching-tool
```

Expected: Pages workflow conclusion 为 `success`。

- [ ] **Step 8: 验证公开页面**

打开：

```text
https://pcerony.github.io/amino-acid-ar-teaching-tool/
```

确认 HTTP 200、摄像头入口可见、参考图上传识别成功，并记录真实球体仍需用户在手机上完成最终光照和曲面测试。

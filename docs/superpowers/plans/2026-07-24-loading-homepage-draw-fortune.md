# 加载体验、儿童首页与抽福玩法实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有 AR 识别、贴面跟随和 3D 分子模型的前提下，加入真实加载进度、儿童教具首页和固定分子星座抽福玩法。

**Architecture:** 保留 `AminoAcidScanner` 作为唯一的摄像头与识别生命周期拥有者，只新增 `scannerMode` 区分普通扫描与抽福结果展示。加载进度使用独立的纯逻辑模块和轻量 `LoadingScreen`，参考图在首屏后后台预加载，OpenCV/Three 继续按现有路径懒加载。20 种抽福文案放在本地数据文件，星座点线从现有 `MOLECULES` 的原子/键投影生成，避免重复维护化学结构。

**Tech Stack:** React 19, TypeScript, Vinext/Next client component, CSS, Node test runner, OpenCV.js/Three.js existing lazy paths, Playwright CLI for visual QA.

---

## 文件边界

- Create: `app/lib/loadingProgress.ts` — 加载阶段、真实进度合并与失败状态的纯函数。
- Create: `app/components/LoadingScreen.tsx` — 不引入 OpenCV/Three 的轻量加载界面。
- Create: `app/lib/constellation.ts` — 从分子投影生成适合儿童阅读的星点和连接。
- Create: `app/data/fortunes.ts` — 20 种氨基酸的固定日文抽福内容。
- Create: `app/components/FortuneCard.tsx` — 抽福结果卡与星座图。
- Modify: `app/AminoAcidScanner.tsx` — 首页入口、加载生命周期、普通/抽福模式和结果操作。
- Modify: `app/globals.css` — 浅色首页、进度条、分子星座和响应式结果卡样式。
- Create: `tests/loading-progress.test.mjs` — 进度合并与失败继续逻辑。
- Create: `tests/fortunes.test.mjs` — 20 项内容、固定绑定和星座图完整性。
- Create: `tests/fortune-contract.test.mjs` — 模式分流与懒加载契约。
- Modify: `tests/rendered-html.test.mjs` — 首页日文入口和加载文案契约。
- Modify: `tests/content.test.mjs`、`tests/performance-contract.test.mjs` — 数据覆盖与性能边界。
- Modify: `README.md` — 记录抽福玩法和加载策略。

### 必须保持的现有边界

- 不在首页创建 `MoleculeViewer` 或主动 import `three`。
- 不在抽福模式创建第二个 `MediaStream`、第二个 `LocalRecognizer` 或第二套扫描定时器。
- 不改变 `LocalRecognizer`、`RecognitionConsensus`、`AnchorSmoother`、`MOLECULES` 的识别和模型数据契约。

---

### Task 1: 建立加载进度纯逻辑

**Files:** `app/lib/loadingProgress.ts`, `tests/loading-progress.test.mjs`

- [ ] **Step 1: 写失败测试，锁定阶段和进度规则**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { LOADING_STAGES, initialLoadingState, updateLoadingStage, overallLoadingPercent } from "../app/lib/loadingProgress.ts";

test("keeps four named stages in order", () => {
  assert.deepEqual(LOADING_STAGES.map((stage) => stage.id), ["shell", "art", "molecule", "camera"]);
  assert.equal(initialLoadingState().percent, 0);
});

test("weights progress and continues after an optional failure", () => {
  const readyShell = updateLoadingStage(initialLoadingState(), "shell", { progress: 1, status: "ready" });
  const state = updateLoadingStage(readyShell, "art", { progress: 0.5, status: "loading" });
  const degraded = updateLoadingStage(state, "art", { progress: 1, status: "failed", message: "図案を読み込めません" });
  assert.equal(overallLoadingPercent(degraded), 50);
  assert.equal(degraded.failedStage, "art");
  assert.equal(degraded.canContinue, true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/loading-progress.test.mjs`

Expected: FAIL with module-not-found/export error for `app/lib/loadingProgress.ts`.

- [ ] **Step 3: 写最小纯逻辑实现**

`LoadingStageId` 固定为 `shell | art | molecule | camera`；四阶段各占 25%，`updateLoadingStage` 把进度限制在 0–1，失败状态保留错误并设 `canContinue: true`。`overallLoadingPercent` 只从阶段状态计算，不使用计时器或随机数。

```ts
export type LoadingStageId = "shell" | "art" | "molecule" | "camera";
export type LoadingStageStatus = "pending" | "loading" | "ready" | "failed";
export type LoadingStage = { id: LoadingStageId; label: string; weight: number };
export type LoadingState = {
  stages: Record<LoadingStageId, { progress: number; status: LoadingStageStatus; message?: string }>;
  percent: number;
  failedStage: LoadingStageId | null;
  canContinue: boolean;
};
export const LOADING_STAGES: readonly LoadingStage[] = [
  { id: "shell", label: "ページを準備中", weight: 0.25 },
  { id: "art", label: "図案を準備中", weight: 0.25 },
  { id: "molecule", label: "分子を準備中", weight: 0.25 },
  { id: "camera", label: "カメラを準備中", weight: 0.25 },
];
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/loading-progress.test.mjs`

Expected: PASS。

---

### Task 2: 添加固定抽福数据与分子星座投影

**Files:** `app/lib/constellation.ts`, `app/data/fortunes.ts`, `tests/fortunes.test.mjs`, `tests/content.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 20 项覆盖和静态绑定**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { AMINO_ACID_IDS } from "../app/data/aminoAcids.ts";
import { FORTUNES } from "../app/data/fortunes.ts";

test("every amino acid has one fixed Japanese fortune entry", () => {
  assert.deepEqual(Object.keys(FORTUNES).sort(), [...AMINO_ACID_IDS].sort());
  for (const id of AMINO_ACID_IDS) {
    const entry = FORTUNES[id];
    assert.match(entry.constellationName, /座$/);
    assert.ok(entry.fortune.length > 8);
    assert.ok(entry.tryToday.length > 4);
    assert.ok(entry.takeCare.length > 4);
    assert.ok(entry.moleculeHint.length > 8);
    assert.ok(entry.stars.length >= 4);
    assert.ok(entry.links.length >= 3);
  }
});

test("fortune objects are stable and do not depend on date", () => {
  assert.equal(JSON.stringify(FORTUNES.glycine), JSON.stringify(FORTUNES.glycine));
});
```

- [ ] **Step 2: 运行测试确认数据模块缺失导致失败**

Run: `node --test tests/fortunes.test.mjs`

Expected: FAIL with module-not-found for `app/data/fortunes.ts`.

- [ ] **Step 3: 实现星座投影纯函数**

`constellationFromMolecule(molecule)` 调用现有 `projectMolecule(molecule, { yaw: -0.48, pitch: 0.38 })`，将点压缩到 `0.12..0.88`，保留 4–9 个均匀星点，依据分子键生成去重连接；小分子也必须至少 4 个星点。

```ts
export type Constellation = { stars: Array<{ x: number; y: number }>; links: Array<[number, number]> };
export function constellationFromMolecule(molecule: Molecule): Constellation {
  const points = projectMolecule(molecule, { yaw: -0.48, pitch: 0.38 });
  const step = Math.max(1, Math.ceil(points.length / 8));
  const stars = points.filter((_, index) => index % step === 0).slice(0, 9).map(({ x, y }) => ({ x: 0.12 + x * 0.76, y: 0.12 + y * 0.76 }));
  const seen = new Set<string>();
  const links = molecule.bonds.flatMap((bond) => {
    const from = Math.floor(bond.atoms[0] / step);
    const to = Math.floor(bond.atoms[1] / step);
    if (from === to || from >= stars.length || to >= stars.length) return [];
    const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [[from, to] as [number, number]];
  });
  return { stars, links };
}
```

- [ ] **Step 4: 添加 20 条固定日文内容并组合星座图**

`app/data/fortunes.ts` 导出 `FortuneEntry` 和 `FORTUNES: Record<AminoAcidId, FortuneEntry>`。每项包含 `constellationName`、`constellationTitle`、`meaning`、`fortune`、`tryToday`、`takeCare`、`moleculeHint`，以及从 `MOLECULES[id]` 生成的 `stars`/`links`。日文使用鼓励式短句，必须保留 `学習用のイメージ` 语境标记。

- [ ] **Step 5: 运行内容与星座测试确认通过**

Run: `node --test tests/fortunes.test.mjs tests/content.test.mjs`

Expected: PASS；20 个 id 完整匹配，所有点线坐标有效。

---

### Task 3: 添加抽福结果卡并接入普通/抽福模式

**Files:** `app/components/FortuneCard.tsx`, `app/AminoAcidScanner.tsx`, `app/globals.css`, `tests/fortune-contract.test.mjs`, `tests/rendered-html.test.mjs`

- [ ] **Step 1: 写失败契约测试**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scanner exposes a distinct fortune mode without a second camera loop", async () => {
  const source = await readFile(new URL("../app/AminoAcidScanner.tsx", import.meta.url), "utf8");
  assert.match(source, /scannerMode/);
  assert.match(source, /抽福をはじめる/);
  assert.match(source, /FORTUNES/);
  assert.match(source, /FortuneCard/);
  assert.doesNotMatch(source, /new LocalRecognizer\(\).*new LocalRecognizer/);
});
```

Update `tests/rendered-html.test.mjs` to require `カメラでスキャンする`, `抽福をはじめる`, and `アミノ酸をみる` in the server-rendered shell.

- [ ] **Step 2: 运行测试确认当前实现失败**

Run: `node --test tests/fortune-contract.test.mjs tests/rendered-html.test.mjs`

Expected: FAIL because current scanner has no `scannerMode`, `FORTUNES`, or fortune entry buttons.

- [ ] **Step 3: 实现 `FortuneCard`**

Props are `{ acid, fortune, onOpenLesson, onRetry, onHome }`. Render a compact constellation SVG from `fortune.stars`/`fortune.links`, `aria-label="分子星座"`, `学習用のイメージ`, the fixed fortune fields, and three buttons: `分子をくわしく見る`, `もう一度抽福`, `ホームへ`.

- [ ] **Step 4: 接入 `AminoAcidScanner` 的模式状态**

Add `type ScannerMode = "scan" | "fortune"` and `const [scannerMode, setScannerMode] = useState<ScannerMode>("scan")`. Change `startCamera` to accept `mode: ScannerMode = "scan"`; `startFortune` calls `startCamera("fortune")`. Reuse `applyStableResult`, existing stream, recognizer, consensus, and scan timer. Render `<FortuneCard>` only when `scannerMode === "fortune" && result`; keep `LessonPanel` as the 3D/details action. Reset mode on stop, rescan, pagehide, and home. Support `?demo=tryptophan&mode=fortune` for visual QA.

- [ ] **Step 5: 运行模式与内容回归**

Run: `node --test tests/fortune-contract.test.mjs tests/rendered-html.test.mjs tests/content.test.mjs tests/molecules.test.mjs`

Expected: PASS；普通模式不显示运势卡，抽福模式引用固定 `FORTUNES`，20 个 3D 分子仍完整。

---

### Task 4: 重做首页并加入真实加载进度

**Files:** `app/components/LoadingScreen.tsx`, `app/AminoAcidScanner.tsx`, `app/globals.css`, `tests/loading-progress.test.mjs`, `tests/rendered-html.test.mjs`

- [ ] **Step 1: 写加载屏幕契约测试**

Add assertions that the scanner source includes `LoadingScreen`, `LOADING_STAGES`, `页面を準備中`, and `あとで試す`; assert `LoadingScreen.tsx` does not import `three`, `@techstark/opencv-js`, or `LocalRecognizer`.

- [ ] **Step 2: 运行测试确认当前加载屏幕缺失导致失败**

Run: `node --test tests/loading-progress.test.mjs tests/rendered-html.test.mjs`

Expected: FAIL on missing `LoadingScreen`/stage labels.

- [ ] **Step 3: 实现轻量 `LoadingScreen`**

Props are `{ state: LoadingState; onContinue: () => void }`. Render semantic `role="status"`, current Japanese label, percent, `<progress max={100}>`, four stage labels, and `あとで試す` only when `state.failedStage` is non-null. The component must not import images, Three, OpenCV, or camera code.

- [ ] **Step 4: 实现真实启动进度和后台参考图预加载**

On scanner mount, mark `shell` ready after first paint, then create one `Image` per `acid.referencePath` and update `art` after each resolve/reject. Mark `molecule` ready from the already imported static `MOLECULES` object. Mark `camera` ready after checking `navigator.mediaDevices?.getUserMedia` without requesting permission. A rejected optional resource marks the stage failed but leaves `canContinue` true. Never await this process before rendering the homepage and never use a timer to fake progress.

- [ ] **Step 5: 替换首页结构和样式**

When `phase === "idle"` and no active camera, render the confirmed light home panel: abstract constellation visual, `カメラでスキャンする` primary button calling `startCamera("scan")`, `抽福をはじめる` secondary button calling `startCamera("fortune")`, and `アミノ酸をみる` entry. Preserve photo upload as fallback. Scope pale coral/mint/sky/yellow styles to the home/loading/fortune classes so camera AR styles remain stable.

- [ ] **Step 6: 运行视觉与服务器渲染验证**

Run: `node --test tests/loading-progress.test.mjs tests/rendered-html.test.mjs`. Then use a local dev server and Playwright CLI at 390px and 1280px to verify the primary scan button is largest, no text overlaps, progress is visible during bootstrap, and `?demo=tryptophan&mode=fortune` renders the fortune card while `?demo=tryptophan` does not.

---

### Task 5: 内容、性能与发布回归

**Files:** `README.md`, `tests/fortune-contract.test.mjs`, `tests/performance-contract.test.mjs`

- [ ] **Step 1: 锁定性能边界**

Add contracts that the homepage does not import `three` directly, `LoadingScreen.tsx` does not import OpenCV/Three, there remains one `new LocalRecognizer()` creation path, and background preload is limited to the 20 known `referencePath` values without calling `getUserMedia`.

- [ ] **Step 2: 更新 README**

Document four-stage loading feedback, ordinary scan versus fortune scan, and the fact that every amino acid has one fixed local fortune/learning hint.

- [ ] **Step 3: 运行完整验证**

The OneDrive workspace can stall TypeScript/build processes, so copy tracked source into `/tmp/amino-acid-ar-verify-20260724` and run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build:pages
npm run recognition:audit
```

Expected: all tests pass, all 20 fortune/molecule entries remain complete, Pages build succeeds, and recognition audit remains 20/20 plus 120/120 variants.

- [ ] **Step 4: 提交、部署和线上检查**

```bash
git add app tests README.md docs/superpowers/plans/2026-07-24-loading-homepage-draw-fortune.md
git commit -m "feat: add loading feedback and amino acid draw fortune"
git push origin main
gh run watch "$(gh run list --repo Pcerony/amino-acid-ar-teaching-tool --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --repo Pcerony/amino-acid-ar-teaching-tool --exit-status
```

After deployment, check the public Pages URL and both demo URLs; the normal scan demo must not show the fortune card, and the fortune demo must show it without a second camera/recognizer loop.

## Risk controls

- 如果后台预加载 20 张图影响弱网首屏，允许首页继续使用；不得把预加载改成阻塞式等待。
- 如果 3D/OpenCV 失败，只显示对应错误并保留资料/抽福文案，不改变识别核心阈值。
- 如果抽福卡过长，移动端先显示星座、提示和三个操作按钮，学习卡通过 `分子をくわしく見る` 展开。
- 不把抽福寓意写成医学、营养或科学结论；每张结果卡保留 `学習用のイメージ` 标记。

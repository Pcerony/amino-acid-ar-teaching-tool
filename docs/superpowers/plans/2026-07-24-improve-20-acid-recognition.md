# 20 种氨基酸识别准确率修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留手机端性能与现有贴面 AR 稳定性的前提下，让完整 20 种氨基酸都能稳定进入特征匹配，并通过真实参考图与增强样本验证识别准确率。

**Architecture:** 保留现有“颜色预筛选 → ORB 特征匹配 → RANSAC 单应矩阵 → 多帧确认”链路，但把候选筛选从手工主题色改为“参考图实测颜色画像 + 主题色弱权重”的组合，并将候选上限从 3 个提高到 8 个。对低置信度结果增加受冷却时间控制的全量特征复核，避免相似青绿色花瓣图案在预筛选阶段互相排除，同时不让每一帧都匹配 20 个目标。特征分数保留低匹配数时的灵敏度，并增加高内点数支持，避免精确图案与颜色相近的误匹配因早期分数封顶而出现极小 margin。

**Tech Stack:** TypeScript, OpenCV.js ORB/RANSAC, Canvas ImageData, Node test runner, Sharp（仅用于离线参考图审计脚本）。

---

## 根因证据

当前 [localRecognizer.ts](/Users/heisei/Library/CloudStorage/OneDrive-个人/Desktop/蛋白质/amino-acid-ar/app/lib/localRecognizer.ts) 在 `recognize()` 中使用 `themeColorDistance(profile, reference.acid.themeRgb)` 排序，然后 `.slice(0, 3)`，只有前三个颜色候选会进入 ORB。新增 12 张图的 `themeRgb` 是手工 UI 配色，并不等于参考图的实际颜色画像。

用当前 20 张 `public/references/*.png` 的透明像素过滤和同一套 HSV 距离计算，得到以下可复现结果：

| 参考图 | 原图颜色画像 | 当前主题色排名 | 结果 |
|---|---:|---:|---|
| serine | hue 181.0 / sat 0.404 / value 0.829 | 第 4 | 永远不会进入当前前三候选 |
| threonine | hue 178.8 / sat 0.425 / value 0.802 | 第 5 | 永远不会进入当前前三候选 |
| tyrosine | hue 179.1 / sat 0.544 / value 0.791 | 第 6 | 永远不会进入当前前三候选 |
| histidine | hue 177.3 / sat 0.501 / value 0.671 | 第 7 | 永远不会进入当前前三候选 |

原有 8 张图都在前三名内，因此“从 8 种扩大到 20 种后明显下降”与该预筛选回归完全吻合。扩展后的多张青绿色图还会提高 ORB 误匹配和 `margin` 变小的概率；该部分需要在修复预筛选后用混淆矩阵验证，不能只靠调低阈值。

修复候选集后，精确的 threonine 参考图仍出现过一次边界问题：自身为 536 个 RANSAC 内点、glycine 颜色近邻为 47 个内点，但旧的 `inliers / 14` 特征项已经同时封顶，导致 margin 仅约 0.0038，上传流程会误触发云端兜底。现已加入高内点支持项（`inliers / 120` 的小权重），在不降低低端设备识别门槛的前提下恢复几何证据的区分度。

## 文件边界

- 修改 `app/lib/color.ts`：增加颜色画像距离、候选排序和几何支持分数纯函数，保留现有主题色距离 API。
- 修改 `app/lib/localRecognizer.ts`：索引参考图颜色画像、调用 8 项候选排序、低置信度时受冷却控制地扩展搜索。
- 新建 `tests/reference-color.test.mjs`：验证所有新增颜色画像都不会被候选上限排除。
- 新建 `scripts/audit-recognition.mjs`：离线读取 20 张参考图，输出颜色排名、候选覆盖率和混淆矩阵输入；不在课堂运行。
- 修改 `tests/recognizer-contract.test.mjs`、`tests/performance-contract.test.mjs`：锁定候选上限、画像索引和全量复核冷却策略。
- 修改 `README.md`：记录画像预筛选、8 项常规候选和低置信度复核的性能策略。

### Task 1: 为当前回归写失败测试

**Files:**
- Create: `tests/reference-color.test.mjs`
- Modify: `app/lib/color.ts:83-135`
- Modify: `app/lib/localRecognizer.ts:271-430`

- [x] **Step 1: 暴露纯画像距离和候选排序函数的最小接口**

先在测试中按目标接口导入：

~~~js
import { AMINO_ACIDS } from "../app/data/aminoAcids.ts";
import {
  colorProfileDistance,
  rankReferenceCandidates,
} from "../app/lib/color.ts";
~~~

测试只使用纯对象，不启动摄像头或 OpenCV。

- [x] **Step 2: 写 20 项候选覆盖回归测试**

测试使用 20 张当前参考图的实测画像作为查询，并确保每个标签都在 8 项候选中；重点锁住此前会失败的 4 个标签：

~~~js
const measuredProfiles = {
  glycine: [177.1, 0.497, 0.801], alanine: [11.7, 0.46, 0.987],
  valine: [15.2, 0.637, 0.965], leucine: [31.9, 0.629, 0.986],
  isoleucine: [44.2, 0.752, 0.938], methionine: [31.2, 0.516, 0.948],
  phenylalanine: [8.1, 0.453, 0.981], tryptophan: [326.7, 0.432, 0.803],
  proline: [355.3, 0.403, 0.889], serine: [181, 0.404, 0.829],
  threonine: [178.8, 0.425, 0.802], cysteine: [126.2, 0.228, 0.81],
  tyrosine: [179.1, 0.544, 0.791], asparagine: [178, 0.371, 0.842],
  glutamine: [210.6, 0.498, 0.848], "aspartic-acid": [266.3, 0.337, 0.845],
  "glutamic-acid": [267, 0.249, 0.776], lysine: [135.4, 0.184, 0.865],
  arginine: [176.6, 0.37, 0.798], histidine: [177.3, 0.501, 0.671],
};
const referenceProfiles = AMINO_ACIDS.map((acid) => {
  const [hue, saturation, value] = measuredProfiles[acid.id];
  return {
    id: acid.id,
    themeRgb: acid.themeRgb,
    colorProfile: { hue, saturation, value, validPixels: 1 },
  };
});

test("keeps every reference in the recognition shortlist", () => {
  for (const reference of referenceProfiles) {
    const ranked = rankReferenceCandidates(
      reference.colorProfile,
      referenceProfiles,
      8,
    );
    assert.equal(
      colorProfileDistance(reference.colorProfile, reference.colorProfile),
      0,
    );
    assert.ok(ranked.some((candidate) => candidate.id === reference.id));
  }
});
~~~

- [x] **Step 3: 运行测试确认当前实现失败**

Run: `node --test tests/reference-color.test.mjs`

Expected: FAIL，因为当前模块没有 `colorProfileDistance`/`rankReferenceCandidates`，且当前逻辑只取 3 个主题色候选。

### Task 2: 用参考图颜色画像替代手工主题色预筛选

**Files:**
- Modify: `app/lib/color.ts:3-135`
- Modify: `app/lib/localRecognizer.ts:18-430`

- [x] **Step 1: 增加画像对画像的距离函数**

在 `color.ts` 中把 HSV 距离抽成纯函数，主题色 API 只负责把 RGB 转成画像：

~~~ts
export function colorProfileDistance(
  profile: ColorProfile,
  target: Pick<ColorProfile, "hue" | "saturation" | "value">,
) {
  const hue = hueDistance(profile.hue, target.hue) / 180;
  const saturation = Math.abs(profile.saturation - target.saturation);
  const value = Math.abs(profile.value - target.value);
  return Math.min(1, hue * 0.65 + saturation * 0.2 + value * 0.15);
}

export function themeColorDistance(
  profile: ColorProfile,
  rgb: readonly [number, number, number],
) {
  return colorProfileDistance(profile, rgbToHsv(rgb[0], rgb[1], rgb[2]));
}
~~~

- [x] **Step 2: 索引参考图时保存画像**

扩展 `IndexedReference`：

~~~ts
type IndexedReference = {
  acid: AminoAcid;
  colorProfile: ColorProfile;
  keypoints: any;
  descriptors: any;
  width: number;
  height: number;
};
~~~

在 `initialize()` 中对同一个 `drawSquare(image)` 画布读取 `ImageData`，调用 `profileImageData()`，再把该画布交给 `extractOrb()`，避免重复解码：

~~~ts
const square = drawSquare(image);
const context = square.getContext("2d", { willReadFrequently: true });
if (!context) throw new Error("Reference canvas is unavailable");
const pixels = context.getImageData(0, 0, square.width, square.height);
const colorProfile = profileImageData(
  pixels.data,
  pixels.width,
  pixels.height,
);
const features = extractOrb(this.cv!, square);
return { acid: AMINO_ACIDS[index], colorProfile, ...features };
~~~

- [x] **Step 3: 实现排序函数，混合实测画像和主题色**

实测画像作为主要信号，主题色只作为较小的语义先验，避免 UI 颜色偏差把正确目标排掉：

~~~ts
export type ReferenceColorEntry = {
  id: AminoAcidId;
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
~~~

- [x] **Step 4: 将 `recognize()` 的 `.slice(0, 3)` 替换为排序函数的 8 项候选**

在 ORB 匹配前构建轻量排序条目，再映射回已索引的 `IndexedReference`；保持 ORB、RANSAC、分数公式和多帧 consensus 不变：

~~~ts
const shortlist = rankReferenceCandidates(
  profile,
  this.references.map(({ acid, colorProfile }) => ({
    id: acid.id,
    themeRgb: acid.themeRgb,
    colorProfile,
  })),
  COLOR_CANDIDATE_LIMIT,
).map(({ id }) => this.referenceForId(id)!);
~~~

- [x] **Step 5: 运行回归测试确认通过**

Run: `node --test tests/reference-color.test.mjs tests/color.test.mjs tests/recognizer-contract.test.mjs`

Expected: PASS；serine、threonine、tyrosine、histidine 均进入候选集合。

### Task 3: 增加低置信度全量复核，处理相似花瓣背景

**Files:**
- Modify: `app/lib/localRecognizer.ts:271-390`
- Modify: `tests/recognizer-contract.test.mjs`
- Modify: `tests/performance-contract.test.mjs`

- [x] **Step 1: 先增加策略契约测试**

锁定常规候选为 8，且全量复核必须有冷却时间，避免低光/遮挡时每一帧都匹配 20 个目标：

~~~js
assert.match(source, /COLOR_CANDIDATE_LIMIT\\s*=\\s*8/);
assert.match(source, /FULL_SWEEP_COOLDOWN_MS\\s*=\\s*700/);
assert.match(source, /rankReferenceCandidates/);
~~~

- [x] **Step 2: 实现受控全量复核**

在 `LocalRecognizer` 中加入 `lastFullSweepAt`，常规只匹配 8 项；当最佳结果满足任一条件时，且距离上次全量复核至少 700ms，才把其余参考也加入本帧：

~~~ts
const weakWinner =
  !winner || winner.inliers < 8 || winner.score < 0.56 || winner.margin < 0.025;
const canFullSweep = performance.now() - this.lastFullSweepAt >= 700;
const referencesToMatch = weakWinner && canFullSweep
  ? this.references
  : shortlist;
if (weakWinner && canFullSweep) this.lastFullSweepAt = performance.now();
~~~

全量复核仍使用已缓存的 ORB descriptors，不重新索引图片；已完成的 8 项结果会被复用，只补匹配剩余 12 项，避免一次弱结果产生 28 次重复匹配。每帧只允许一次，并继续由 `analysisDurationRef` 自动降速。

- [x] **Step 3: 运行性能与策略测试**

Run: `node --test tests/recognizer-contract.test.mjs tests/performance-contract.test.mjs`

Expected: PASS；测试确认全量复核存在冷却，不改变已锁定目标的单目标 `track()` 路径。

### Task 4: 建立 20 张图的离线识别审计

**Files:**
- Create: `scripts/audit-recognition.mjs`
- Modify: `tests/reference-color.test.mjs`
- Modify: `package.json`（增加 `recognition:audit` 脚本）

- [x] **Step 1: 写入参考图颜色画像审计**

脚本使用 Sharp 将每张 `public/references/*.png` 解码为 RGBA，复用 `profileImageData()`，输出 CSV/表格字段：`id,hue,saturation,value,themeRank,profileRank,shortlistIncluded`。脚本退出码在任一标签不在 8 项候选时为 1。

- [x] **Step 2: 增加受控增强样本**

对每张参考图生成不落盘的 6 种输入：亮度 `0.75/1.0/1.25`、饱和度 `0.85/1.0`、轻微旋转 `±8°`。脚本使用以下 Sharp 管线生成 RGBA 缓冲区，不写入 `public/`：

~~~js
const { data, info } = await sharp(path)
  .modulate({ brightness, saturation })
  .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
~~~

颜色审计只验证候选覆盖；ORB 的最终 top-1、内点和上传置信门槛通过本地开发页逐张上传 20 张原图验证，避免把纯颜色相似误认为正确识别。

- [x] **Step 3: 记录修复前后基线**

Run: `npm run recognition:audit`

修复前应能复现至少 4 张图被排除；修复后验收标准为：

- 20/20 原始参考图进入候选集合；
- 20/20 原始参考图 top-1 识别正确（本地开发页逐张上传验证）；
- 增强样本 top-1 ≥ 95%，且没有单一标签持续被误判为同一个邻近颜色标签；
- 常规搜索的候选数为 8，只有弱结果才触发全量复核。

### Task 5: 文档、完整验证与发布

**Files:**
- Modify: `README.md:性能策略`
- Modify: `tests/content.test.mjs`
- Modify: `tests/molecules.test.mjs`（仅确认模型回归未受识别改动影响）

- [x] **Step 1: 更新性能说明**

说明参考图画像用于候选筛选、常规 8 项 ORB、低置信度 700ms 冷却全量复核；保留“识别后只追踪一个目标”的性能承诺。

- [x] **Step 2: 运行完整验证**

Run:

~~~bash
npm test
npm run lint
npx tsc --noEmit
npm run build:pages
npm run recognition:audit
~~~

Expected: 全部命令成功，20/20 参考图审计通过，Pages 构建产物包含 20 张参考图。

- [x] **Step 3: 提交并部署**

~~~bash
git add app/lib/color.ts app/lib/localRecognizer.ts tests scripts package.json README.md
git commit -m "fix: restore recognition accuracy for twenty amino acids"
git push origin main
~~~

等待 GitHub Actions 的 Pages workflow 成功后，再用线上页面随机验证 `serine`、`threonine`、`tyrosine`、`histidine` 四个此前被排除的目标。

## 风险与回滚边界

- 如果全量复核使低端手机单帧耗时超过现有慢速阈值，保留“画像 + 8 项候选”修复，暂不启用全量复核；准确率主回归由画像索引解决。
- 不降低 `RecognitionConsensus` 的三帧确认、`score` 或 `margin` 门槛来掩盖误匹配；这些门槛只有在混淆矩阵证明某类真实样本被稳定拒绝后才单独调整。
- 不改变 `track()` 的单目标路径、AnchorSmoother 或 3D 渲染生命周期，避免把识别准确率修复重新引入 AR 中断问题。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LOADING_STAGES,
  initialLoadingState,
  updateLoadingStage,
  overallLoadingPercent,
} from "../app/lib/loadingProgress.ts";

test("keeps four named stages in order with equal weights", () => {
  assert.deepEqual(
    LOADING_STAGES.map((stage) => stage.id),
    ["shell", "art", "molecule", "camera"],
  );
  assert.deepEqual(
    LOADING_STAGES.map((stage) => stage.label),
    ["ページを準備中", "図案を準備中", "分子を準備中", "カメラを準備中"],
  );
  assert.deepEqual(
    LOADING_STAGES.map((stage) => stage.weight),
    [0.25, 0.25, 0.25, 0.25],
  );
});

test("keeps loading stage metadata immutable", () => {
  assert.equal(Object.isFrozen(LOADING_STAGES), true);
  assert.equal(Object.isFrozen(LOADING_STAGES[0]), true);
  assert.throws(() => {
    LOADING_STAGES[0].weight = 0.5;
  }, TypeError);
  assert.equal(LOADING_STAGES[0].weight, 0.25);
});

test("starts every stage at zero", () => {
  const state = initialLoadingState();

  assert.equal(state.percent, 0);
  assert.equal(state.failedStage, null);
  assert.equal(state.canContinue, false);
  for (const stage of LOADING_STAGES) {
    assert.deepEqual(state.stages[stage.id], {
      progress: 0,
      status: "pending",
    });
  }
});

test("clamps stage progress and derives the weighted percent from state", () => {
  const state = updateLoadingStage(initialLoadingState(), "shell", {
    progress: 0.5,
    status: "loading",
  });

  assert.equal(state.stages.shell.progress, 0.5);
  assert.equal(state.percent, overallLoadingPercent(state));
  assert.equal(state.percent, 12.5);
  assert.equal(
    updateLoadingStage(state, "art", {
      progress: -0.4,
      status: "loading",
    }).stages.art.progress,
    0,
  );
  assert.equal(
    updateLoadingStage(state, "art", {
      progress: 1.4,
      status: "loading",
    }).stages.art.progress,
    1,
  );
});

test("preserves a failed-stage message and allows continuing", () => {
  const shellReady = updateLoadingStage(initialLoadingState(), "shell", {
    progress: 1,
    status: "ready",
  });
  const state = updateLoadingStage(shellReady, "art", {
    progress: 0.5,
    status: "loading",
  });
  const degraded = updateLoadingStage(state, "art", {
    progress: 1,
    status: "failed",
    message: "図案を読み込めません",
  });

  assert.equal(overallLoadingPercent(degraded), 50);
  assert.equal(degraded.percent, overallLoadingPercent(degraded));
  assert.equal(degraded.stages.art.message, "図案を読み込めません");
  assert.equal(degraded.failedStage, "art");
  assert.equal(degraded.canContinue, true);

  const stillDegraded = updateLoadingStage(degraded, "art", {
    progress: 1,
    status: "failed",
  });
  assert.equal(stillDegraded.stages.art.message, "図案を読み込めません");
});

test("does not turn a loading message into a failure message", () => {
  const shellReady = updateLoadingStage(initialLoadingState(), "shell", {
    progress: 1,
    status: "ready",
  });
  const loading = updateLoadingStage(shellReady, "art", {
    progress: 0.5,
    status: "loading",
    message: "図案を読み込んでいます",
  });
  const failed = updateLoadingStage(loading, "art", {
    progress: 1,
    status: "failed",
  });

  assert.equal(failed.stages.art.message, undefined);
});

test("keeps the loading screen lightweight and wired to real stages", async () => {
  const scannerSource = await readFile(
    new URL("../app/AminoAcidScanner.tsx", import.meta.url),
    "utf8",
  );
  const loadingSource = await readFile(
    new URL("../app/components/LoadingScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.match(scannerSource, /LoadingScreen/);
  assert.match(scannerSource, /LOADING_STAGES/);
  assert.match(loadingSource, /ページを準備中/);
  assert.match(loadingSource, /あとで試す/);
  assert.match(loadingSource, /role="status"/);
  assert.match(loadingSource, /<progress/);
  assert.doesNotMatch(loadingSource, /(?:three|@techstark\/opencv-js|LocalRecognizer)/i);
});

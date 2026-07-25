export type LoadingStageId = "shell" | "art" | "molecule" | "camera";

export type LoadingStageStatus = "pending" | "loading" | "ready" | "failed";

export type LoadingStage = {
  readonly id: LoadingStageId;
  readonly label: string;
  readonly weight: number;
};

export type LoadingStageState = {
  progress: number;
  status: LoadingStageStatus;
  message?: string;
};

export type LoadingState = {
  stages: Record<LoadingStageId, LoadingStageState>;
  percent: number;
  failedStage: LoadingStageId | null;
  canContinue: boolean;
};

export type LoadingStageUpdate = {
  progress: number;
  status: LoadingStageStatus;
  message?: string;
};

export const LOADING_STAGES: readonly LoadingStage[] = Object.freeze([
  Object.freeze({ id: "shell", label: "ページを準備中", weight: 0.25 }),
  Object.freeze({ id: "art", label: "図案を準備中", weight: 0.25 }),
  Object.freeze({ id: "molecule", label: "分子を準備中", weight: 0.25 }),
  Object.freeze({ id: "camera", label: "カメラを準備中", weight: 0.25 }),
]);

function clampProgress(progress: number) {
  if (Number.isNaN(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}

export function overallLoadingPercent(state: LoadingState) {
  return LOADING_STAGES.reduce((total, stage) => {
    return total + clampProgress(state.stages[stage.id].progress) * stage.weight * 100;
  }, 0);
}

export function initialLoadingState(): LoadingState {
  const stages = LOADING_STAGES.reduce(
    (result, stage) => {
      result[stage.id] = { progress: 0, status: "pending" };
      return result;
    },
    {} as Record<LoadingStageId, LoadingStageState>,
  );

  return {
    stages,
    percent: 0,
    failedStage: null,
    canContinue: false,
  };
}

export function updateLoadingStage(
  state: LoadingState,
  stageId: LoadingStageId,
  update: LoadingStageUpdate,
): LoadingState {
  const previousStage = state.stages[stageId];
  const message =
    update.status === "failed"
      ? update.message ??
        (previousStage.status === "failed" ? previousStage.message : undefined)
      : update.message;
  const nextStage: LoadingStageState = {
    progress: clampProgress(update.progress),
    status: update.status,
    ...(message === undefined ? {} : { message }),
  };
  const stages = { ...state.stages, [stageId]: nextStage };
  const failedStage =
    LOADING_STAGES.find((stage) => stages[stage.id].status === "failed")?.id ??
    null;
  const nextState: LoadingState = {
    ...state,
    stages,
    failedStage,
    canContinue: failedStage !== null,
    percent: 0,
  };
  nextState.percent = overallLoadingPercent(nextState);
  return nextState;
}

import {
  LOADING_STAGES,
  type LoadingStageStatus,
  type LoadingState,
} from "../lib/loadingProgress";

type LoadingScreenProps = {
  state: LoadingState;
  onContinue: () => void;
};

const STATUS_LABEL: Record<LoadingStageStatus, string> = {
  pending: "まってね",
  loading: "じゅんび中",
  ready: "できたよ",
  failed: "あとで試せるよ",
};

/** A deliberately light-weight first paint. Keep camera and 3D dependencies out. */
export function LoadingScreen({ state, onContinue }: LoadingScreenProps) {
  const activeStage = LOADING_STAGES.find((stage) => {
    const status = state.stages[stage.id].status;
    return status === "loading" || status === "pending";
  });
  const headline = state.failedStage
    ? state.stages[state.failedStage].message ?? "図案の一部を読み込めませんでした"
    : activeStage?.label ?? "ページを準備中";
  const percent = Math.round(state.percent);

  return (
    <main className="loading-screen" aria-labelledby="loading-title">
      <section className="loading-card" role="status" aria-live="polite">
        <div className="loading-constellation" aria-hidden="true">
          <span className="loading-line loading-line-a" />
          <span className="loading-line loading-line-b" />
          <span className="loading-line loading-line-c" />
          <span className="loading-star loading-star-a" />
          <span className="loading-star loading-star-b" />
          <span className="loading-star loading-star-c" />
          <span className="loading-star loading-star-d" />
        </div>
        <p className="loading-kicker">アミノずかん</p>
        <h1 id="loading-title">分子を見つける<br />じゅんび中</h1>
        <p className="loading-status">{headline}</p>
        <div className="loading-progress-row">
          <progress
            value={percent}
            max={100}
            aria-label="読み込み進度"
          />
          <strong>{percent}%</strong>
        </div>
        <ol className="loading-stages" aria-label="読み込みの段階">
          {LOADING_STAGES.map((stage) => {
            const stageState = state.stages[stage.id];
            return (
              <li
                key={stage.id}
                className={`loading-stage loading-stage-${stageState.status}`}
              >
                <span className="loading-stage-mark" aria-hidden="true" />
                <span className="loading-stage-copy">
                  <span>{stage.label}</span>
                  <small>{STATUS_LABEL[stageState.status]}</small>
                </span>
              </li>
            );
          })}
        </ol>
        {state.failedStage && state.canContinue && (
          <button className="loading-continue" type="button" onClick={onContinue}>
            あとで試す
          </button>
        )}
      </section>
    </main>
  );
}

/** Keeps optional reference-art work visible without blocking the scanner home. */
export function LoadingProgressBanner({ state }: { state: LoadingState }) {
  const artStage = state.stages.art;
  if (artStage.status !== "loading" && artStage.status !== "failed") {
    return null;
  }
  const percent = Math.round(state.percent);
  const message =
    artStage.status === "failed"
      ? artStage.message ?? "図案をあとで読み込みます"
      : "図案を準備中";

  return (
    <div className={`loading-banner is-${artStage.status}`} role="status" aria-live="polite">
      <span>{message}</span>
      <progress value={percent} max={100} aria-label="読み込み進度" />
      <strong>{percent}%</strong>
    </div>
  );
}

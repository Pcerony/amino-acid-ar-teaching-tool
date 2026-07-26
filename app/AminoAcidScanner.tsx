"use client";

/* The same component is compiled for Vinext and GitHub Pages; plain img keeps
 * the static build's relative asset paths intact. */
/* eslint-disable @next/next/no-img-element */

import {
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AMINO_ACID_BY_ID,
  AMINO_ACID_IDS,
  AMINO_ACIDS,
  type AminoAcid,
  type AminoAcidId,
} from "./data/aminoAcids";
import { MOLECULES } from "./data/molecules";
import { FORTUNES } from "./data/fortunes";
import { AnchoredOverlay } from "./components/AnchoredOverlay";
import { FortuneCard } from "./components/FortuneCard";
import { MoleculeViewer } from "./components/MoleculeViewer";
import {
  LoadingProgressBanner,
  LoadingScreen,
} from "./components/LoadingScreen";
import {
  type CameraStartResult,
  getVideoDevices,
  setTrackTorch,
  startRearCamera,
  stopMediaStream,
  trackSupportsTorch,
  type CameraErrorKind,
} from "./lib/camera";
import { RecognitionConsensus } from "./lib/consensus";
import {
  AnchorSmoother,
  nextScanDelay,
  shouldReleaseTarget,
  type AnchorState,
  type TrackedQuad,
} from "./lib/faceTracking";
import {
  LocalRecognizer,
  type FrameAssessment,
} from "./lib/localRecognizer";
import { validateMolecule } from "./lib/molecule";
import {
  LOADING_STAGES,
  initialLoadingState,
  updateLoadingStage,
  type LoadingState,
} from "./lib/loadingProgress";

type ScannerPhase =
  | "idle"
  | "requesting"
  | "indexing"
  | "scanning"
  | "recognized"
  | "error";

type ScannerMode = "scan" | "fortune";

const SEARCH_INTERVAL_MS = 250;
const TRACK_INTERVAL_MS = 180;
const SLOW_TRACK_INTERVAL_MS = 250;
const TRACK_RELEASE_TIMEOUT_MS = 2400;
const DEMO_QUAD: TrackedQuad = [
  { x: 0.13, y: 0.14 },
  { x: 0.87, y: 0.19 },
  { x: 0.82, y: 0.87 },
  { x: 0.17, y: 0.82 },
];

const STATUS_TEXT: Record<ScannerPhase, string> = {
  idle: "カメラをむけてね",
  requesting: "カメラをじゅんび中",
  indexing: "20この形をおぼえています",
  scanning: "見つけています",
  recognized: "わかった！",
  error: "カメラを使えません",
};

const QUALITY_TEXT: Record<FrameAssessment["quality"], string> = {
  ok: "円の中に、球の1面を大きくうつしてね",
  "too-dark": "もう少し明るい場所で試してみよう",
  glare: "光が反射しない角度にしてね",
  "too-small": "もう少し近づけてみよう",
};

const CAMERA_ERROR_TEXT: Record<CameraErrorKind, string> = {
  denied:
    "カメラがオフになっています。ブラウザの設定で、カメラを「許可」にしてね。",
  missing: "この端末ではカメラを使えません。写真をえらんで調べられます。",
  busy: "ほかのアプリがカメラを使っています。閉じてから、もう一度ためしてね。",
  insecure: "カメラを使うには、安全なHTTPSのページで開いてね。",
  unknown: "カメラを始められませんでした。写真から調べてみよう。",
};

function RubyText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\{([^|{}]+)\|([^{}]+)\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    parts.push(
      <ruby key={`${match.index}-${match[1]}`}>
        {match[1]}
        <rp>（</rp>
        <rt>{match[2]}</rt>
        <rp>）</rp>
      </ruby>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function captureGuide(
  video: HTMLVideoElement,
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  outputSize = 480,
) {
  const stageRect = stage.getBoundingClientRect();
  const guideSize = Math.min(stageRect.width * 0.78, 390);
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return false;

  const scale = Math.max(
    stageRect.width / videoWidth,
    stageRect.height / videoHeight,
  );
  const displayedWidth = videoWidth * scale;
  const displayedHeight = videoHeight * scale;
  const offsetX = (stageRect.width - displayedWidth) / 2;
  const offsetY = (stageRect.height - displayedHeight) / 2;
  const sourceX = (stageRect.width / 2 - guideSize / 2 - offsetX) / scale;
  const sourceY = (stageRect.height / 2 - guideSize / 2 - offsetY) / scale;
  const sourceSize = guideSize / scale;

  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(
    video,
    Math.max(0, sourceX),
    Math.max(0, sourceY),
    Math.min(sourceSize, videoWidth),
    Math.min(sourceSize, videoHeight),
    0,
    0,
    outputSize,
    outputSize,
  );
  return true;
}

function drawUploadedImage(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
) {
  canvas.width = 480;
  canvas.height = 480;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    480,
    480,
  );
}

function LessonPanel({
  acid,
  expanded,
  onToggle,
  onClose,
}: {
  acid: AminoAcid;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className={`lesson-panel ${expanded ? "is-expanded" : ""}`}
      style={{ "--acid-color": acid.theme } as React.CSSProperties}
      aria-label={`${acid.nameJa}の学習カード`}
    >
      <div className="lesson-handle" aria-hidden="true" />
      <div className="lesson-heading">
        <div className="acid-mark">
          <img
            src={acid.referencePath}
            alt=""
          />
        </div>
        <div className="acid-name">
          <span className="section-label">なまえ</span>
          <h1>{acid.nameJa}</h1>
          <p>
            {acid.nameEn} <strong>{acid.code}</strong>
          </p>
          {!expanded && <span className="lesson-prompt">くわしく見る</span>}
        </div>
        <button
          className="icon-button panel-toggle"
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "学習カードを小さくする" : "学習カードを広げる"}
          title={expanded ? "小さくする" : "くわしく見る"}
        >
          {expanded ? <ChevronDown /> : <ChevronUp />}
        </button>
        <button
          className="icon-button panel-close"
          type="button"
          onClick={onClose}
          aria-label="学習カードを閉じる"
          title="閉じる"
        >
          <X />
        </button>
      </div>

      {expanded && (
        <div className="lesson-sections">
          <article>
            <h2>形のポイント</h2>
            <p>
              <RubyText text={acid.shape} />
            </p>
          </article>
          <article>
            <h2>体でのはたらき</h2>
            <p>
              <RubyText text={acid.role} />
            </p>
          </article>
          <article>
            <h2>おぼえ方</h2>
            <p>
              <RubyText text={acid.memory} />
            </p>
          </article>
        </div>
      )}
    </section>
  );
}

function HomeVisual() {
  const stars = [
    [22, 45],
    [36, 24],
    [51, 39],
    [68, 22],
    [78, 50],
    [62, 69],
    [38, 75],
  ] as const;
  const links = [
    [0, 1],
    [1, 2],
    [2, 3],
    [2, 4],
    [4, 5],
    [5, 6],
    [6, 0],
  ] as const;

  return (
    <div className="home-visual" aria-hidden="true">
      <span className="home-petal home-petal-a" />
      <span className="home-petal home-petal-b" />
      <span className="home-petal home-petal-c" />
      <svg className="home-constellation" viewBox="0 0 100 100" focusable="false">
        {links.map(([from, to]) => (
          <line
            key={`${from}-${to}`}
            x1={stars[from][0]}
            y1={stars[from][1]}
            x2={stars[to][0]}
            y2={stars[to][1]}
          />
        ))}
        {stars.map(([x, y], index) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={index === 2 ? 4 : 2.6} />
        ))}
      </svg>
    </div>
  );
}

function FortuneGuideModal({
  onStart,
  onClose,
}: {
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fortune-guide-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      <div className="fortune-guide-card">
        <header className="fortune-guide-header">
          <div>
            <span className="fortune-guide-kicker">あそびかた</span>
            <h2 id="guide-title">花てまりおみくじ</h2>
          </div>
          <button
            type="button"
            className="icon-button guide-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="fortune-guide-body">
          <div className="guide-step">
            <span className="step-badge">1</span>
            <div className="step-content">
              <h3>花てまりを ころがそう！</h3>
              <p>
                花てまり（サイコロ）を 床や 机の上に やさしく コロコロ転がしてね。
              </p>
            </div>
          </div>
          <div className="guide-step">
            <span className="step-badge">2</span>
            <div className="step-content">
              <h3>上になった形を カメラでうつそう！</h3>
              <p>
                ピタッと 止まったら、いちばん上を 向いている アミノ酸の形を カメラで パシャッ！
              </p>
            </div>
          </div>
        </div>
        <footer className="fortune-guide-footer">
          <button
            type="button"
            className="primary-button guide-start"
            onClick={onStart}
          >
            <Camera aria-hidden="true" />
            カメラをひらく
          </button>
        </footer>
      </div>
    </div>
  );
}

const ESSENTIAL_IDS = new Set<string>([
  "valine",
  "leucine",
  "isoleucine",
  "methionine",
  "phenylalanine",
  "tryptophan",
  "threonine",
  "lysine",
  "histidine",
]);

const HYDROPHILIC_IDS = new Set<string>([
  "serine",
  "threonine",
  "cysteine",
  "tyrosine",
  "asparagine",
  "glutamine",
  "aspartic-acid",
  "glutamic-acid",
  "lysine",
  "arginine",
  "histidine",
]);

type CatalogCategory = "all" | "essential" | "nonessential" | "hydrophilic" | "hydrophobic";

function AminoAcidList({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: AminoAcidId | null;
  onSelect: (id: AminoAcidId) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<CatalogCategory>("all");
  const [search, setSearch] = useState("");

  const filteredAcids = useMemo(() => {
    return AMINO_ACIDS.filter((acid) => {
      if (category === "essential" && !ESSENTIAL_IDS.has(acid.id)) return false;
      if (category === "nonessential" && ESSENTIAL_IDS.has(acid.id)) return false;
      if (category === "hydrophilic" && !HYDROPHILIC_IDS.has(acid.id)) return false;
      if (category === "hydrophobic" && HYDROPHILIC_IDS.has(acid.id)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = acid.nameJa.toLowerCase().includes(q);
        const matchCode = acid.code.toLowerCase().includes(q);
        const matchEn = acid.nameEn.toLowerCase().includes(q);
        return matchName || matchCode || matchEn;
      }
      return true;
    });
  }, [category, search]);

  const activeId = selectedId ?? filteredAcids[0]?.id ?? "glycine";
  const selected = AMINO_ACID_BY_ID[activeId] ?? AMINO_ACID_BY_ID["glycine"];
  const molecule = MOLECULES[selected.id];

  return (
    <section className="amino-list" aria-labelledby="amino-list-title">
      <header className="amino-list-heading">
        <div>
          <p className="home-kicker">20このなかま大図鑑</p>
          <h2 id="amino-list-title">アミノ酸をみる</h2>
        </div>
        <button
          className="icon-button amino-list-close"
          type="button"
          onClick={onClose}
          aria-label="アミノ酸リストを閉じる"
          title="閉じる"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="amino-catalog-toolbar">
        <div className="amino-category-tabs" role="tablist">
          <button
            type="button"
            className={`tab-btn ${category === "all" ? "is-active" : ""}`}
            onClick={() => setCategory("all")}
          >
            すべて ({AMINO_ACIDS.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${category === "essential" ? "is-active" : ""}`}
            onClick={() => setCategory("essential")}
          >
            ひつす (9)
          </button>
          <button
            type="button"
            className={`tab-btn ${category === "nonessential" ? "is-active" : ""}`}
            onClick={() => setCategory("nonessential")}
          >
            ひひつす (11)
          </button>
          <button
            type="button"
            className={`tab-btn ${category === "hydrophilic" ? "is-active" : ""}`}
            onClick={() => setCategory("hydrophilic")}
          >
            みずになじむ
          </button>
          <button
            type="button"
            className={`tab-btn ${category === "hydrophobic" ? "is-active" : ""}`}
            onClick={() => setCategory("hydrophobic")}
          >
            みずをはじく
          </button>
        </div>
        <div className="amino-search-box">
          <input
            type="text"
            placeholder="なまえや略称でさがす (例: Gly, アラニン)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="amino-catalog-body">
        <div className="amino-list-grid">
          {filteredAcids.map((acid) => (
            <button
              key={acid.id}
              className={`amino-list-item${activeId === acid.id ? " is-selected" : ""}`}
              type="button"
              onClick={() => onSelect(acid.id)}
              style={{ "--acid-color": acid.theme } as React.CSSProperties}
            >
              <span className="amino-list-dot" aria-hidden="true" />
              <span>{acid.nameJa}</span>
              <small>{acid.code}</small>
            </button>
          ))}
        </div>

        {selected && (
          <div className="amino-list-detail" aria-live="polite">
            <div className="amino-detail-header">
              <div>
                <h3>
                  {selected.nameJa}{" "}
                  <small>
                    ({selected.code} / {selected.nameEn})
                  </small>
                </h3>
                <p className="amino-detail-shape">{selected.shape}</p>
                <p className="amino-detail-role">{selected.role}</p>
              </div>
              <button
                className="secondary-button amino-detail-close"
                type="button"
                onClick={() => onSelect(selected.id)}
              >
                とじる
              </button>
            </div>
            <div className="amino-detail-media">
              <div className="amino-detail-media-card">
                <span className="amino-detail-media-title">教具カード</span>
                <img
                  src={selected.referencePath}
                  alt={selected.nameJa}
                  className="amino-detail-img"
                />
              </div>
              {molecule && (
                <div className="amino-detail-media-card">
                  <span className="amino-detail-media-title">3D 分子モデル</span>
                  <div className="amino-detail-3d">
                    <MoleculeViewer molecule={molecule} theme={selected.theme} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function AminoAcidScanner() {
  const [loadingState, setLoadingState] = useState<LoadingState>(() =>
    initialLoadingState(),
  );
  const [loadingDismissed, setLoadingDismissed] = useState(false);
  const [showAminoList, setShowAminoList] = useState(false);
  const [listSelectedId, setListSelectedId] = useState<AminoAcidId | null>(null);
  const [phase, setPhase] = useState<ScannerPhase>("idle");
  const [scannerMode, setScannerMode] = useState<ScannerMode>("scan");
  const [qualityText, setQualityText] = useState(QUALITY_TEXT.ok);
  const [resultId, setResultId] = useState<AminoAcidId | null>(null);
  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [showFortuneGuide, setShowFortuneGuide] = useState(false);
  const [cloudNotice, setCloudNotice] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [trackedQuad, setTrackedQuad] = useState<TrackedQuad | null>(null);
  const [anchorState, setAnchorState] = useState<AnchorState["state"]>("lost");

  useEffect(() => {
    void getVideoDevices().then((devices) => {
      setVideoDevices(devices);
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId);
      }
    });
  }, [selectedDeviceId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (e.key === "Escape") {
        if (showAminoList) setShowAminoList(false);
        else if (showFortuneGuide) setShowFortuneGuide(false);
        else if (panelExpanded) setPanelExpanded(false);
      } else if (e.key === "d" || e.key === "D") {
        if (!cameraActive) {
          setShowAminoList((prev) => !prev);
        }
      } else if (e.key === "f" || e.key === "F") {
        if (!cameraActive) {
          setShowFortuneGuide(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cameraActive, panelExpanded, showAminoList, showFortuneGuide]);
  const phaseRef = useRef<ScannerPhase>("idle");
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const recognizerRef = useRef<LocalRecognizer | null>(null);
  const consensusRef = useRef(
    new RecognitionConsensus<AminoAcidId>(3, 0.72, 0.008),
  );
  const scanTimerRef = useRef<number | null>(null);
  const loopGenerationRef = useRef(0);
  const scanGenerationRef = useRef(0);
  const cameraStartGenerationRef = useRef(0);
  const recognizerReadyRef = useRef(false);
  const recognizerInitializingRef = useRef(false);
  const uploadTokenRef = useRef(0);
  const uploadPendingRef = useRef(false);
  const activeAnalysisGenerationRef = useRef<number | null>(null);
  const restartScanAfterPendingRef = useRef<number | null>(null);
  const beginScanLoopRef = useRef<(() => void) | null>(null);
  const scanningRef = useRef(false);
  const trackedIdRef = useRef<AminoAcidId | null>(null);
  const panelExpandedRef = useRef(false);
  const anchorSmootherRef = useRef(
    new AnchorSmoother({ alpha: 0.35, holdMs: 2400 }),
  );
  const analysisDurationRef = useRef<number[]>([]);
  const lastIdentitySeenAtRef = useRef(0);
  const lastPoseSeenAtRef = useRef(0);
  const lastCloudAtRef = useRef(0);
  const cloudRequestTokenRef = useRef(0);
  const uncertainSinceRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = resultId ? AMINO_ACID_BY_ID[resultId] : null;
  const fortune = resultId ? FORTUNES[resultId] : null;
  const statusText = STATUS_TEXT[phase];
  const coreLoadingReady = (["shell", "molecule", "camera"] as const).every(
    (stageId) => {
      const stageState = loadingState.stages[stageId];
      return (
        stageState.progress >= 1 &&
        (stageState.status === "ready" || stageState.status === "failed")
      );
    },
  );
  const loadingVisible =
    !loadingDismissed && !coreLoadingReady;

  useEffect(() => {
    if (coreLoadingReady) setLoadingDismissed(true);
  }, [coreLoadingReady]);

  useEffect(() => {
    let cancelled = false;
    const updateStage = (
      stageId: (typeof LOADING_STAGES)[number]["id"],
      update: Parameters<typeof updateLoadingStage>[2],
    ) => {
      if (cancelled) return;
      setLoadingState((current) => updateLoadingStage(current, stageId, update));
    };

    const preloadReferenceArt = async () => {
      updateStage("art", { progress: 0, status: "loading" });
      let completed = 0;
      let failed = 0;
      await Promise.all(
        AMINO_ACIDS.map(
          (acid) =>
            new Promise<void>((resolve) => {
              const image = new Image();
              image.decoding = "async";
              const finish = (didFail: boolean) => {
                completed += 1;
                if (didFail) failed += 1;
                updateStage("art", {
                  progress: completed / AMINO_ACIDS.length,
                  status: "loading",
                });
                resolve();
              };
              image.onload = () => finish(false);
              image.onerror = () => finish(true);
              image.src = acid.referencePath;
            }),
        ),
      );
      if (failed) {
        updateStage("art", {
          progress: 1,
          status: "failed",
          message: `${failed}この図案をあとで読み込みます`,
        });
      } else {
        updateStage("art", { progress: 1, status: "ready" });
      }
    };

    const begin = () => {
      if (cancelled) return;
      updateStage("shell", { progress: 1, status: "ready" });
      const moleculeReady = AMINO_ACID_IDS.every((id) => {
        const molecule = MOLECULES[id];
        return Boolean(
          molecule &&
            molecule.atoms.length > 0 &&
            molecule.bonds.length > 0 &&
            validateMolecule(molecule).length === 0,
        );
      });
      updateStage(
        "molecule",
        moleculeReady
          ? { progress: 1, status: "ready" }
          : {
              progress: 1,
              status: "failed",
              message: "分子の図をあとで読み込みます",
            },
      );
      const cameraReady =
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia);
      updateStage(
        "camera",
        cameraReady
          ? { progress: 1, status: "ready" }
          : {
              progress: 1,
              status: "failed",
              message: "カメラが使えないときは写真で調べられます",
            },
      );
      void preloadReferenceArt();
    };

    const frame = window.requestAnimationFrame(begin);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const getRecognizer = useCallback(() => {
    if (!recognizerRef.current) {
      recognizerRef.current = new LocalRecognizer();
    }
    return recognizerRef.current;
  }, []);

  const isCurrentGeneration = useCallback(
    (generation: number) => scanGenerationRef.current === generation,
    [],
  );

  const isCurrentCameraStart = useCallback(
    (generation: number) => cameraStartGenerationRef.current === generation,
    [],
  );

  const isCurrentUpload = useCallback(
    (token: number, generation: number) =>
      uploadTokenRef.current === token && isCurrentGeneration(generation),
    [isCurrentGeneration],
  );

  const stopScanTimer = useCallback(() => {
    loopGenerationRef.current += 1;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    scanGenerationRef.current += 1;
    cameraStartGenerationRef.current += 1;
    cloudRequestTokenRef.current += 1;
    recognizerReadyRef.current = false;
    recognizerInitializingRef.current = false;
    uploadTokenRef.current += 1;
    uploadPendingRef.current = false;
    restartScanAfterPendingRef.current = null;
    stopScanTimer();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
    trackedIdRef.current = null;
    lastIdentitySeenAtRef.current = 0;
    lastPoseSeenAtRef.current = 0;
    analysisDurationRef.current = [];
    anchorSmootherRef.current.reset();
    setTrackedQuad(null);
    setAnchorState("lost");
    setResultId(null);
    setScannerMode("scan");
    setPanelExpanded(false);
    setCameraActive(false);
    setCloudNotice(false);
    setUploadedPreview(null);
    setShowAminoList(false);
    setListSelectedId(null);
    setErrorKind(null);
    consensusRef.current.reset(true);
    uncertainSinceRef.current = 0;
    lastCloudAtRef.current = 0;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchAvailable(false);
    setTorchEnabled(false);
    setPhase("idle");
  }, [stopScanTimer]);

  const applyStableResult = useCallback(
    (
      id: AminoAcidId,
      source: "local" | "cloud",
      anchor: TrackedQuad | null = null,
      generation?: number,
    ) => {
      if (generation !== undefined && !isCurrentGeneration(generation)) {
        return;
      }
      cloudRequestTokenRef.current += 1;
      const seenAt = Date.now();
      trackedIdRef.current = id;
      lastIdentitySeenAtRef.current = seenAt;
      lastPoseSeenAtRef.current = seenAt;
      setResultId(id);
      setPhase("recognized");
      setPanelExpanded(false);
      if (anchor) {
        const next = anchorSmootherRef.current.push(anchor, seenAt);
        setTrackedQuad(next.quad);
        setAnchorState(next.state);
      }
      if (source === "cloud") setCloudNotice(true);
    },
    [isCurrentGeneration],
  );

  const requestCloudFallback = useCallback(
    async (
      canvas: HTMLCanvasElement,
      manual = false,
      generation = scanGenerationRef.current,
      uploadToken?: number,
    ) => {
      if (
        !isCurrentGeneration(generation) ||
        (uploadToken !== undefined && uploadTokenRef.current !== uploadToken)
      ) {
        return;
      }
      const now = Date.now();
      if (!manual && now - lastCloudAtRef.current < 5000) return;
      lastCloudAtRef.current = now;
      const requestToken = ++cloudRequestTokenRef.current;
      try {
        const image = canvas.toDataURL("image/jpeg", 0.72);
        const response = await fetch("api/recognize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image }),
        });
        if (
          !isCurrentGeneration(generation) ||
          cloudRequestTokenRef.current !== requestToken ||
          (uploadToken !== undefined && uploadTokenRef.current !== uploadToken)
        ) {
          return;
        }
        if (!response.ok) return;
        const payload = (await response.json()) as {
          id?: AminoAcidId;
          confidence?: number;
        };
        if (
          !isCurrentGeneration(generation) ||
          cloudRequestTokenRef.current !== requestToken ||
          (uploadToken !== undefined && uploadTokenRef.current !== uploadToken)
        ) {
          return;
        }
        if (payload.id && (payload.confidence ?? 0) >= 0.68) {
          applyStableResult(payload.id, "cloud", null, generation);
        }
      } catch {
        // Local scanning continues when the optional fallback is unavailable.
      }
    },
    [applyStableResult, isCurrentGeneration],
  );

  const analyzeCurrentFrame = useCallback(async () => {
    if (
      !recognizerReadyRef.current ||
      uploadPendingRef.current ||
      scanningRef.current ||
      document.hidden ||
      panelExpandedRef.current ||
      (scannerMode === "fortune" && resultId !== null) ||
      !videoRef.current ||
      !stageRef.current
    ) {
      return;
    }
    const generation = scanGenerationRef.current;
    const trackedId = trackedIdRef.current;
    const canvas =
      analysisCanvasRef.current ??
      (analysisCanvasRef.current = document.createElement("canvas"));
    if (
      !captureGuide(
        videoRef.current,
        stageRef.current,
        canvas,
        trackedId ? 360 : 480,
      )
    ) {
      return;
    }
    if (!isCurrentGeneration(generation)) return;
    scanningRef.current = true;
    activeAnalysisGenerationRef.current = generation;
    try {
      const recognizer = getRecognizer();

      if (trackedId) {
        const startedAt = performance.now();
        const tracking = await recognizer.track(canvas, trackedId);
        if (!isCurrentGeneration(generation)) return;
        const durations = analysisDurationRef.current;
        durations.push(performance.now() - startedAt);
        analysisDurationRef.current = durations.slice(-8);
        const now = Date.now();
        if (tracking) lastIdentitySeenAtRef.current = now;
        if (tracking?.anchor) lastPoseSeenAtRef.current = now;
        const next = anchorSmootherRef.current.push(
          tracking?.anchor ?? null,
          now,
        );
        setAnchorState(next.state);
        setTrackedQuad(next.quad);
        const identityExpired = shouldReleaseTarget(
          lastIdentitySeenAtRef.current,
          now,
          TRACK_RELEASE_TIMEOUT_MS,
        );
        const poseExpired = shouldReleaseTarget(
          lastPoseSeenAtRef.current,
          now,
          TRACK_RELEASE_TIMEOUT_MS,
        );
        if ((!tracking || !tracking.anchor) && (identityExpired || poseExpired)) {
          trackedIdRef.current = null;
          lastIdentitySeenAtRef.current = 0;
          lastPoseSeenAtRef.current = 0;
          consensusRef.current.reset(true);
          anchorSmootherRef.current.reset();
          setTrackedQuad(null);
          setAnchorState("lost");
          setPhase("recognized");
          setQualityText(QUALITY_TEXT.ok);
        } else {
          setPhase("recognized");
        }
        return;
      }

      const assessment = await recognizer.recognize(canvas);
      if (!isCurrentGeneration(generation)) return;
      setQualityText(QUALITY_TEXT[assessment.quality]);
      const candidate =
        assessment.result && assessment.result.inliers >= 6
          ? assessment.result
          : null;
      const stable = consensusRef.current.push(candidate);
      if (stable) {
        uncertainSinceRef.current = 0;
        const anchor =
          assessment.result?.id === stable.id
            ? assessment.result.anchor
            : null;
        applyStableResult(stable.id, "local", anchor, generation);
      } else if (assessment.quality === "ok") {
        if (!uncertainSinceRef.current) uncertainSinceRef.current = Date.now();
        if (Date.now() - uncertainSinceRef.current > 2000) {
          void requestCloudFallback(canvas, false, generation);
        }
      } else {
        uncertainSinceRef.current = 0;
      }
    } catch {
      if (isCurrentGeneration(generation)) {
        setQualityText("形をじゅんびできません。写真から試してみよう");
      }
    } finally {
      if (activeAnalysisGenerationRef.current !== generation) return;
      activeAnalysisGenerationRef.current = null;
      scanningRef.current = false;
      const restartGeneration = restartScanAfterPendingRef.current;
      if (
        restartGeneration !== null &&
        isCurrentGeneration(restartGeneration) &&
        recognizerReadyRef.current &&
        phaseRef.current !== "indexing" &&
        streamRef.current &&
        !panelExpandedRef.current
      ) {
        restartScanAfterPendingRef.current = null;
        beginScanLoopRef.current?.();
      }
    }
  }, [
    applyStableResult,
    getRecognizer,
    isCurrentGeneration,
    requestCloudFallback,
  ]);

  const beginScanLoop = useCallback(() => {
    if (!recognizerReadyRef.current) return;
    if (uploadPendingRef.current) return;
    stopScanTimer();
    loopGenerationRef.current += 1;
    const loopGeneration = loopGenerationRef.current;
    const generation = scanGenerationRef.current;
    const tick = async () => {
      if (
        loopGenerationRef.current !== loopGeneration ||
        scanGenerationRef.current !== generation
      ) {
        return;
      }
      const startedAt = performance.now();
      await analyzeCurrentFrame();
      if (
        loopGenerationRef.current !== loopGeneration ||
        !isCurrentGeneration(generation)
      ) {
        return;
      }
      const analysisElapsed = performance.now() - startedAt;
      if (
        !streamRef.current ||
        document.hidden ||
        panelExpandedRef.current
      ) {
        scanTimerRef.current = null;
        return;
      }
      const durations = analysisDurationRef.current;
      const averageDuration = durations.length
        ? durations.reduce((total, value) => total + value, 0) /
          durations.length
        : 0;
      const targetInterval = trackedIdRef.current
        ? averageDuration > 90
          ? SLOW_TRACK_INTERVAL_MS
          : TRACK_INTERVAL_MS
        : SEARCH_INTERVAL_MS;
      const delay = nextScanDelay(targetInterval, analysisElapsed);
      scanTimerRef.current = window.setTimeout(tick, delay);
    };
    void tick();
  }, [analyzeCurrentFrame, isCurrentGeneration, stopScanTimer]);

  // Stale analysis can restart the latest loop without creating a second loop.
  useEffect(() => {
    beginScanLoopRef.current = beginScanLoop;
    return () => {
      if (beginScanLoopRef.current === beginScanLoop) {
        beginScanLoopRef.current = null;
      }
    };
  }, [beginScanLoop]);

  const queueOrBeginScanLoop = useCallback(() => {
    if (scanningRef.current) {
      restartScanAfterPendingRef.current = scanGenerationRef.current;
      return;
    }
    restartScanAfterPendingRef.current = null;
    beginScanLoop();
  }, [beginScanLoop]);

  const startCamera = useCallback(async (mode: ScannerMode = "scan") => {
    cameraStartGenerationRef.current += 1;
    const cameraGeneration = cameraStartGenerationRef.current;
    scanGenerationRef.current += 1;
    cloudRequestTokenRef.current += 1;
    recognizerReadyRef.current = false;
    recognizerInitializingRef.current = false;
    uploadTokenRef.current += 1;
    uploadPendingRef.current = false;
    restartScanAfterPendingRef.current = null;
    stopScanTimer();
    setScannerMode(mode);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    trackRef.current = null;
    // Reserve recognizer ownership while the camera is coming up as well as
    // while its model is initializing. An upload selected during this window
    // waits instead of starting a second recognizer operation.
    recognizerInitializingRef.current = true;
    setCameraActive(false);
    trackedIdRef.current = null;
    lastIdentitySeenAtRef.current = 0;
    lastPoseSeenAtRef.current = 0;
    anchorSmootherRef.current.reset();
    analysisDurationRef.current = [];
    setErrorKind(null);
    setResultId(null);
    setTrackedQuad(null);
    setAnchorState("lost");
    setCloudNotice(false);
    setUploadedPreview(null);
    consensusRef.current.reset(true);
    lastCloudAtRef.current = 0;
    setPhase("requesting");
    const camera = await startRearCamera(selectedDeviceId || undefined);
    if (!isCurrentCameraStart(cameraGeneration)) {
      if (camera.ok) stopMediaStream(camera.stream);
      return;
    }
    if (!camera.ok) {
      recognizerInitializingRef.current = false;
      setErrorKind(camera.kind);
      setPhase("error");
      return;
    }
    streamRef.current = camera.stream;
    trackRef.current = camera.track;
    setCameraActive(true);
    const discardCamera = () => {
      stopMediaStream(camera.stream);
      if (streamRef.current !== camera.stream) return;
      streamRef.current = null;
      trackRef.current = null;
      setCameraActive(false);
      if (videoRef.current?.srcObject === camera.stream) {
        videoRef.current.srcObject = null;
      }
    };
    if (videoRef.current) {
      videoRef.current.srcObject = camera.stream;
      try {
        await videoRef.current.play();
      } catch {
        if (
          !isCurrentCameraStart(cameraGeneration) ||
          streamRef.current !== camera.stream
        ) {
          discardCamera();
          return;
        }
        discardCamera();
        recognizerInitializingRef.current = false;
        setErrorKind("unknown");
        setQualityText("カメラを再生できませんでした。もう一度ためしてみよう");
        setPhase("error");
        return;
      }
      if (
        !isCurrentCameraStart(cameraGeneration) ||
        streamRef.current !== camera.stream
      ) {
        discardCamera();
        return;
      }
    }
    setTorchAvailable(trackSupportsTorch(camera.track));
    setPhase("indexing");
    recognizerInitializingRef.current = true;
    try {
      const recognizer = getRecognizer();
      await recognizer.initialize();
      if (
        !isCurrentCameraStart(cameraGeneration) ||
        streamRef.current !== camera.stream
      ) {
        discardCamera();
        return;
      }
      recognizerInitializingRef.current = false;
      recognizerReadyRef.current = true;
      if (uploadPendingRef.current) {
        setPhase("indexing");
        return;
      }
      setPhase("scanning");
      queueOrBeginScanLoop();
    } catch {
      if (
        isCurrentCameraStart(cameraGeneration) &&
        streamRef.current === camera.stream
      ) {
        recognizerReadyRef.current = false;
        recognizerInitializingRef.current = false;
        discardCamera();
        setErrorKind(null);
        setQualityText("分子の準備に失敗しました。もう一度ためしてみよう");
        setPhase("error");
      }
    }
  }, [
    getRecognizer,
    isCurrentCameraStart,
    queueOrBeginScanLoop,
    stopScanTimer,
  ]);

  const rescan = useCallback(() => {
    stopScanTimer();
    scanningRef.current = false;
    scanGenerationRef.current += 1;
    cloudRequestTokenRef.current += 1;
    recognizerInitializingRef.current = false;
    uploadTokenRef.current += 1;
    uploadPendingRef.current = false;
    restartScanAfterPendingRef.current = null;
    panelExpandedRef.current = false;
    trackedIdRef.current = null;
    lastIdentitySeenAtRef.current = 0;
    lastPoseSeenAtRef.current = 0;
    anchorSmootherRef.current.reset();
    analysisDurationRef.current = [];
    consensusRef.current.reset(true);
    setResultId(null);
    setTrackedQuad(null);
    setAnchorState("lost");
    setCloudNotice(false);
    setPanelExpanded(false);
    setQualityText(QUALITY_TEXT.ok);
    uncertainSinceRef.current = 0;
    lastCloudAtRef.current = 0;
    if (streamRef.current) {
      if (phase === "indexing" && !recognizerReadyRef.current) {
        setPhase("indexing");
      } else {
        setPhase("scanning");
        queueOrBeginScanLoop();
      }
    } else {
      setPhase("idle");
    }
  }, [phase, queueOrBeginScanLoop, stopScanTimer]);

  const toggleTorch = useCallback(async () => {
    const generation = scanGenerationRef.current;
    const track =
      trackRef.current ?? streamRef.current?.getVideoTracks()?.[0] ?? null;
    if (!track) return;
    const next = !torchEnabled;
    try {
      await setTrackTorch(track, next);
      if (!isCurrentGeneration(generation)) return;
      setTorchEnabled(next);
    } catch {
      if (!isCurrentGeneration(generation)) return;
      setTorchEnabled((prev) => !prev);
    }
  }, [isCurrentGeneration, torchEnabled]);

  const inspectUploadedFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      const uploadToken = ++uploadTokenRef.current;
      const generation = ++scanGenerationRef.current;
      cloudRequestTokenRef.current += 1;
      uploadPendingRef.current = true;
      restartScanAfterPendingRef.current = null;
      panelExpandedRef.current = false;
      stopScanTimer();
      trackedIdRef.current = null;
      lastIdentitySeenAtRef.current = 0;
      lastPoseSeenAtRef.current = 0;
      anchorSmootherRef.current.reset();
      consensusRef.current.reset(true);
      setResultId(null);
      setTrackedQuad(null);
      setAnchorState("lost");
      setCloudNotice(false);
      setPanelExpanded(false);
      setPhase("indexing");

      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      const isCurrent = () => isCurrentUpload(uploadToken, generation);
      const resumeCamera = () => {
        if (!isCurrent()) return;
        uploadPendingRef.current = false;
        if (!streamRef.current) {
          setPhase("idle");
        } else if (recognizerReadyRef.current) {
          setPhase("scanning");
          queueOrBeginScanLoop();
        } else {
          setPhase("indexing");
        }
      };
      const waitForTurn = async () => {
        while (scanningRef.current || recognizerInitializingRef.current) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 16);
          });
          if (!isCurrent()) return false;
        }
        return isCurrent();
      };

      image.onload = async () => {
        if (!isCurrent()) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const canvas =
          analysisCanvasRef.current ??
          (analysisCanvasRef.current = document.createElement("canvas"));
        try {
          drawUploadedImage(image, canvas);
          const preview = canvas.toDataURL("image/jpeg", 0.82);
          if (!isCurrent()) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setUploadedPreview(preview);
        } catch {
          URL.revokeObjectURL(objectUrl);
          if (!isCurrent()) return;
          setQualityText("この写真は開けませんでした");
          resumeCamera();
          return;
        }
        URL.revokeObjectURL(objectUrl);

        if (!(await waitForTurn()) || !isCurrent()) return;
        scanningRef.current = true;
        try {
          const recognizer = getRecognizer();
          const assessment = await recognizer.recognize(canvas);
          if (!isCurrent()) return;
          const uploadResult = assessment.result;
          const confidentUpload =
            uploadResult !== null &&
            uploadResult.score >= 0.72 &&
            (uploadResult.margin >= 0.045 ||
              (uploadResult.score >= 0.9 && uploadResult.margin >= 0.008));
          if (uploadResult && confidentUpload && uploadResult.inliers >= 6) {
            uploadPendingRef.current = false;
            applyStableResult(
              uploadResult.id,
              "local",
              uploadResult.anchor,
              generation,
            );
          } else {
            setQualityText("まだわかりません。面を正面からうつしてみよう");
            resumeCamera();
            await requestCloudFallback(canvas, true, generation, uploadToken);
          }
        } catch {
          if (!isCurrent()) return;
          resumeCamera();
          await requestCloudFallback(canvas, true, generation, uploadToken);
        } finally {
          scanningRef.current = false;
          const restartGeneration = restartScanAfterPendingRef.current;
          if (
            restartGeneration !== null &&
            isCurrentGeneration(restartGeneration) &&
            recognizerReadyRef.current &&
            !uploadPendingRef.current &&
            phaseRef.current !== "indexing" &&
            streamRef.current &&
            !panelExpandedRef.current
          ) {
            restartScanAfterPendingRef.current = null;
            beginScanLoopRef.current?.();
          }
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (!isCurrent()) return;
        setQualityText("この写真は開けませんでした");
        resumeCamera();
      };
      image.src = objectUrl;
    },
    [
      applyStableResult,
      getRecognizer,
      isCurrentGeneration,
      isCurrentUpload,
      queueOrBeginScanLoop,
      requestCloudFallback,
      stopScanTimer,
    ],
  );

  const manualSnapshot = useCallback(async () => {
    const generation = scanGenerationRef.current;
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video) return;
    const canvas =
      analysisCanvasRef.current ??
      (analysisCanvasRef.current = document.createElement("canvas"));

    let captured = false;
    if (stage && captureGuide(video, stage, canvas)) {
      captured = true;
    } else if (video.videoWidth && video.videoHeight) {
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, 480, 480);
        captured = true;
      }
    }

    if (captured || video.readyState >= 2) {
      if (!captured) {
        canvas.width = 480;
        canvas.height = 480;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context?.drawImage(video, 0, 0, 480, 480);
      }
      setQualityText("写真1まいで、形をかくにん中...");
      if (recognizerRef.current) {
        try {
          const assessment = await recognizerRef.current.recognize(canvas);
          if (!isCurrentGeneration(generation)) return;
          if (assessment.result) {
            applyStableResult(
              assessment.result.id,
              "local",
              assessment.result.anchor,
              generation,
            );
          } else {
            setQualityText("まだわかりません。面を正面からうつしてみよう");
          }
        } catch {
          if (!isCurrentGeneration(generation)) return;
          setQualityText("まだわかりません。面を正面からうつしてみよう");
        }
      }
      void requestCloudFallback(canvas, true, generation);
    }
  }, [applyStableResult, isCurrentGeneration, requestCloudFallback]);

  useEffect(() => {
    panelExpandedRef.current = panelExpanded;
    const isFortuneResultActive = Boolean(resultId && scannerMode === "fortune");
    if (
      panelExpanded ||
      isFortuneResultActive ||
      phase === "indexing" ||
      !recognizerReadyRef.current ||
      uploadPendingRef.current
    ) {
      stopScanTimer();
    } else if (
      recognizerReadyRef.current &&
      !uploadPendingRef.current &&
      streamRef.current &&
      (phase === "scanning" || phase === "recognized")
    ) {
      beginScanLoop();
    }
  }, [beginScanLoop, panelExpanded, phase, resultId, scannerMode, stopScanTimer]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) stopScanTimer();
      else if (
        recognizerReadyRef.current &&
        !uploadPendingRef.current &&
        streamRef.current &&
        (phaseRef.current === "scanning" || phaseRef.current === "recognized")
      ) {
        beginScanLoop();
      }
    };
    const handlePageHide = () => stopCamera();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      stopCamera();
      recognizerRef.current?.dispose();
    };
  }, [beginScanLoop, stopCamera, stopScanTimer]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    const mode: ScannerMode =
      params.get("mode") === "fortune" ? "fortune" : "scan";
    if (demo && demo in AMINO_ACID_BY_ID) {
      const generation = scanGenerationRef.current;
      window.setTimeout(() => {
        if (!isCurrentGeneration(generation)) return;
        const id = demo as AminoAcidId;
        setScannerMode(mode);
        trackedIdRef.current = id;
        const seenAt = Date.now();
        lastIdentitySeenAtRef.current = seenAt;
        lastPoseSeenAtRef.current = seenAt;
        const next = anchorSmootherRef.current.push(DEMO_QUAD, seenAt);
        setResultId(id);
        setTrackedQuad(next.quad);
        setAnchorState(next.state);
        setPhase("recognized");
      }, 0);
    }
  }, [isCurrentGeneration]);

  const stageClass = useMemo(
    () =>
      `scanner-stage phase-${phase}${result ? " has-result" : ""}${
        cameraActive ? " camera-active" : ""
      }${trackedQuad ? " has-anchor" : ""}`,
    [cameraActive, phase, result, trackedQuad],
  );

  return (
    <>
      {loadingVisible && (
        <LoadingScreen
          state={loadingState}
          onContinue={() => setLoadingDismissed(true)}
        />
      )}
      <main
        className={`scanner-app${loadingVisible ? " is-loading" : ""}`}
        aria-hidden={loadingVisible ? true : undefined}
      >
        <section className={stageClass} ref={stageRef}>
        <video
          ref={videoRef}
          className="camera-feed"
          muted
          playsInline
          aria-label="カメラの映像"
        />
        <div className="idle-visual" aria-hidden={phase !== "idle"}>
          {uploadedPreview ? (
            <div
              className="uploaded-preview"
              style={{ backgroundImage: `url(${uploadedPreview})` }}
            />
          ) : (
            <HomeVisual />
          )}
        </div>
        <div className="camera-shade" aria-hidden="true" />

        {phase === "idle" && !uploadedPreview && (
          <section className="home-copy" aria-labelledby="home-title">
            <p className="home-kicker">20この分子を見つけよう</p>
            <h1 id="home-title">アミノずかん</h1>
            <p>球の面をカメラに見せると、分子の形がわかるよ。</p>
          </section>
        )}

        <header className="scanner-header">
          <div className="brand">
            <ScanLine aria-hidden="true" />
            <span>アミノずかん</span>
          </div>
          {cameraActive && (
            <button
              className="icon-button"
              type="button"
              onClick={stopCamera}
              aria-label="カメラを止める"
              title="カメラを止める"
            >
              <Square />
            </button>
          )}
        </header>

        {!loadingVisible && <LoadingProgressBanner state={loadingState} />}

        <div className="status-pill" role="status" aria-live="polite">
          <span className={`status-dot status-${phase}`} />
          {statusText}
        </div>

        <div className="guide-wrap">
          <div className="scan-guide" aria-hidden="true">
            <span className="corner top-left" />
            <span className="corner top-right" />
            <span className="corner bottom-left" />
            <span className="corner bottom-right" />
            {phase === "scanning" && <span className="scan-sweep" />}
          </div>
          {result &&
            trackedQuad &&
            (scannerMode === "scan" || panelExpanded) && (
            <AnchoredOverlay
              acid={result}
              molecule={MOLECULES[result.id]}
              quad={trackedQuad}
              active={anchorState === "tracked" && !panelExpanded}
              holding={anchorState === "holding"}
              onOpenLesson={() => setPanelExpanded(true)}
            />
          )}
        </div>

        {result && fortune && scannerMode === "fortune" && !panelExpanded && (
          <FortuneCard
            acid={result}
            fortune={fortune}
            onOpenLesson={() => setPanelExpanded(true)}
            onRetry={rescan}
            onHome={stopCamera}
          />
        )}

        {phase === "idle" && showAminoList && (
          <AminoAcidList
            selectedId={listSelectedId}
            onSelect={setListSelectedId}
            onClose={() => {
              setShowAminoList(false);
              setListSelectedId(null);
            }}
          />
        )}

        <p className="quality-hint" aria-live="polite">
          {phase === "error" && errorKind
            ? CAMERA_ERROR_TEXT[errorKind]
            : qualityText}
        </p>

        {phase === "idle" && !showAminoList && (
          <div className="start-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => void startCamera("scan")}
            >
              <Camera aria-hidden="true" />
              カメラでスキャンする
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowFortuneGuide(true)}
            >
              <Sparkles aria-hidden="true" />
              花てまりおみくじ
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setListSelectedId(null);
                setShowAminoList(true);
              }}
            >
              <BookOpen aria-hidden="true" />
              アミノ酸をみる
            </button>
            {videoDevices.length > 1 &&
              typeof navigator !== "undefined" &&
              !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && (
                <div className="pc-camera-select">
                  <label htmlFor="device-select">カメラ選択:</label>
                  <select
                    id="device-select"
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                  >
                    {videoDevices.map((dev, idx) => (
                      <option key={dev.deviceId || idx} value={dev.deviceId}>
                        {dev.label || `カメラ ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            <div className="pc-hotkeys-bar">
              <span className="hotkey-pill"><kbd>Esc</kbd> 閉じる</span>
              <span className="hotkey-pill"><kbd>D</kbd> 図鑑</span>
              <span className="hotkey-pill"><kbd>F</kbd> おみくじ</span>
            </div>
            <p className="privacy-note">
              <ShieldCheck aria-hidden="true" />
              カメラの映像は、ふだん端末の中だけで調べます。
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="start-actions error-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => void startCamera("scan")}
            >
              <Camera aria-hidden="true" />
              カメラでスキャンする
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowFortuneGuide(true)}
            >
              <Sparkles aria-hidden="true" />
              花てまりおみくじ
            </button>
          </div>
        )}



        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={inspectUploadedFile}
          aria-label="調べる写真をえらぶ"
        />

        {result && (scannerMode === "scan" || panelExpanded) && (
          <LessonPanel
            acid={result}
            expanded={panelExpanded}
            onToggle={() => setPanelExpanded((value) => !value)}
            onClose={() => setPanelExpanded(false)}
          />
        )}

        {cloudNotice && (
          <p className="cloud-notice">
            この1まいだけ、オンラインでも形をたしかめました。
          </p>
        )}

        {showFortuneGuide && (
          <FortuneGuideModal
            onStart={() => {
              setShowFortuneGuide(false);
              void startCamera("fortune");
            }}
            onClose={() => setShowFortuneGuide(false)}
          />
        )}
        </section>
      </main>
    </>
  );
}

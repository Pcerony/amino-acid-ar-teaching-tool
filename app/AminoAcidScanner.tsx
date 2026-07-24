"use client";

/* The same component is compiled for Vinext and GitHub Pages; plain img keeps
 * the static build's relative asset paths intact. */
/* eslint-disable @next/next/no-img-element */

import {
  Aperture,
  Camera,
  ChevronDown,
  ChevronUp,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  RefreshCw,
  ScanLine,
  ShieldCheck,
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
  type AminoAcid,
  type AminoAcidId,
} from "./data/aminoAcids";
import { MOLECULES } from "./data/molecules";
import { AnchoredOverlay } from "./components/AnchoredOverlay";
import {
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

type ScannerPhase =
  | "idle"
  | "requesting"
  | "indexing"
  | "scanning"
  | "recognized"
  | "error";

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
  indexing: "8つの形をおぼえています",
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

export function AminoAcidScanner() {
  const [phase, setPhase] = useState<ScannerPhase>("idle");
  const [qualityText, setQualityText] = useState(QUALITY_TEXT.ok);
  const [resultId, setResultId] = useState<AminoAcidId | null>(null);
  const [errorKind, setErrorKind] = useState<CameraErrorKind | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cloudNotice, setCloudNotice] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [trackedQuad, setTrackedQuad] = useState<TrackedQuad | null>(null);
  const [anchorState, setAnchorState] =
    useState<AnchorState["state"]>("lost");
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
  const uncertainSinceRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = resultId ? AMINO_ACID_BY_ID[resultId] : null;
  const statusText = STATUS_TEXT[phase];

  const stopScanTimer = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopScanTimer();
    scanningRef.current = false;
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
    setPanelExpanded(false);
    setCameraActive(false);
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
    ) => {
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
    [],
  );

  const requestCloudFallback = useCallback(
    async (canvas: HTMLCanvasElement, manual = false) => {
      const now = Date.now();
      if (!manual && now - lastCloudAtRef.current < 5000) return;
      lastCloudAtRef.current = now;
      try {
        const image = canvas.toDataURL("image/jpeg", 0.72);
        const response = await fetch("api/recognize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ image }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          id?: AminoAcidId;
          confidence?: number;
        };
        if (payload.id && (payload.confidence ?? 0) >= 0.68) {
          applyStableResult(payload.id, "cloud");
        }
      } catch {
        // Local scanning continues when the optional fallback is unavailable.
      }
    },
    [applyStableResult],
  );

  const analyzeCurrentFrame = useCallback(async () => {
    if (
      scanningRef.current ||
      document.hidden ||
      panelExpandedRef.current ||
      !videoRef.current ||
      !stageRef.current
    ) {
      return;
    }
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
    scanningRef.current = true;
    try {
      const recognizer =
        recognizerRef.current ??
        (recognizerRef.current = new LocalRecognizer());

      if (trackedId) {
        const startedAt = performance.now();
        const tracking = await recognizer.track(canvas, trackedId);
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
        applyStableResult(stable.id, "local", anchor);
      } else if (assessment.quality === "ok") {
        if (!uncertainSinceRef.current) uncertainSinceRef.current = Date.now();
        if (Date.now() - uncertainSinceRef.current > 2000) {
          void requestCloudFallback(canvas);
        }
      } else {
        uncertainSinceRef.current = 0;
      }
    } catch {
      setQualityText("形をじゅんびできません。写真から試してみよう");
    } finally {
      scanningRef.current = false;
    }
  }, [applyStableResult, requestCloudFallback]);

  const beginScanLoop = useCallback(() => {
    stopScanTimer();
    const tick = async () => {
      const startedAt = performance.now();
      await analyzeCurrentFrame();
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
  }, [analyzeCurrentFrame, stopScanTimer]);

  const startCamera = useCallback(async () => {
    stopMediaStream(streamRef.current);
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
    setPhase("requesting");
    const camera = await startRearCamera();
    if (!camera.ok) {
      setErrorKind(camera.kind);
      setPhase("error");
      return;
    }
    streamRef.current = camera.stream;
    trackRef.current = camera.track;
    setCameraActive(true);
    if (videoRef.current) {
      videoRef.current.srcObject = camera.stream;
      await videoRef.current.play();
    }
    setTorchAvailable(trackSupportsTorch(camera.track));
    setPhase("indexing");
    try {
      const recognizer =
        recognizerRef.current ??
        (recognizerRef.current = new LocalRecognizer());
      await recognizer.initialize();
      setPhase("scanning");
      beginScanLoop();
    } catch {
      setPhase("scanning");
      setQualityText("形をじゅんびできません。写真から試してみよう");
    }
  }, [beginScanLoop]);

  const rescan = useCallback(() => {
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
    setPhase(streamRef.current ? "scanning" : "idle");
  }, []);

  const toggleTorch = useCallback(async () => {
    if (!trackRef.current) return;
    const next = !torchEnabled;
    try {
      await setTrackTorch(trackRef.current, next);
      setTorchEnabled(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchEnabled]);

  const inspectUploadedFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = async () => {
        const canvas =
          analysisCanvasRef.current ??
          (analysisCanvasRef.current = document.createElement("canvas"));
        drawUploadedImage(image, canvas);
        setUploadedPreview(canvas.toDataURL("image/jpeg", 0.82));
        URL.revokeObjectURL(objectUrl);
        setPhase("indexing");
        try {
          const recognizer =
            recognizerRef.current ??
            (recognizerRef.current = new LocalRecognizer());
          const assessment = await recognizer.recognize(canvas);
          const uploadResult = assessment.result;
          const confidentUpload =
            uploadResult !== null &&
            uploadResult.score >= 0.72 &&
            (uploadResult.margin >= 0.045 ||
              (uploadResult.score >= 0.9 && uploadResult.margin >= 0.008));
          if (uploadResult && confidentUpload && uploadResult.inliers >= 6) {
            applyStableResult(
              uploadResult.id,
              "local",
              uploadResult.anchor,
            );
          } else {
            setPhase(streamRef.current ? "scanning" : "idle");
            setQualityText("まだわかりません。面を正面からうつしてみよう");
            await requestCloudFallback(canvas, true);
          }
        } catch {
          setPhase(streamRef.current ? "scanning" : "idle");
          await requestCloudFallback(canvas, true);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setQualityText("この写真は開けませんでした");
      };
      image.src = objectUrl;
    },
    [applyStableResult, requestCloudFallback],
  );

  const manualSnapshot = useCallback(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    const canvas =
      analysisCanvasRef.current ??
      (analysisCanvasRef.current = document.createElement("canvas"));
    if (video && stage && captureGuide(video, stage, canvas)) {
      void requestCloudFallback(canvas, true);
      setQualityText("1まいの写真で、もう一度たしかめています");
    }
  }, [requestCloudFallback]);

  useEffect(() => {
    panelExpandedRef.current = panelExpanded;
    if (panelExpanded) {
      stopScanTimer();
    } else if (streamRef.current) {
      beginScanLoop();
    }
  }, [beginScanLoop, panelExpanded, stopScanTimer]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) stopScanTimer();
      else if (streamRef.current) beginScanLoop();
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
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo && demo in AMINO_ACID_BY_ID) {
      window.setTimeout(() => {
        const id = demo as AminoAcidId;
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
  }, []);

  const stageClass = useMemo(
    () =>
      `scanner-stage phase-${phase}${result ? " has-result" : ""}${
        cameraActive ? " camera-active" : ""
      }${trackedQuad ? " has-anchor" : ""}`,
    [cameraActive, phase, result, trackedQuad],
  );

  return (
    <main className="scanner-app">
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
            <img
              src="references/tryptophan.png"
              alt=""
            />
          )}
        </div>
        <div className="camera-shade" aria-hidden="true" />

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
          {result && trackedQuad && (
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

        <p className="quality-hint" aria-live="polite">
          {phase === "error" && errorKind
            ? CAMERA_ERROR_TEXT[errorKind]
            : qualityText}
        </p>

        {phase === "idle" && (
          <div className="start-actions">
            <button
              className="primary-button"
              type="button"
              onClick={startCamera}
            >
              <Camera aria-hidden="true" />
              カメラをはじめる
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              写真からしらべる
            </button>
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
              onClick={startCamera}
            >
              <RefreshCw aria-hidden="true" />
              もう一度ためす
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              写真からしらべる
            </button>
          </div>
        )}

        {cameraActive && (
          <nav className="camera-controls" aria-label="カメラの操作">
            {torchAvailable && (
              <button
                className={`control-button ${torchEnabled ? "is-active" : ""}`}
                type="button"
                onClick={toggleTorch}
                aria-label={torchEnabled ? "ライトを消す" : "ライトをつける"}
                title={torchEnabled ? "ライトを消す" : "ライトをつける"}
              >
                {torchEnabled ? <FlashlightOff /> : <Flashlight />}
              </button>
            )}
            <button
              className="control-button"
              type="button"
              onClick={manualSnapshot}
              aria-label="写真1まいで確認する"
              title="写真で確認"
            >
              <Aperture />
            </button>
            <button
              className="control-button"
              type="button"
              onClick={rescan}
              aria-label="もう一度見つける"
              title="もう一度"
            >
              <RefreshCw />
            </button>
          </nav>
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

        {result && (
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
      </section>
    </main>
  );
}

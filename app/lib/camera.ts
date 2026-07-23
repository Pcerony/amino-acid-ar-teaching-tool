export type CameraErrorKind =
  | "denied"
  | "missing"
  | "busy"
  | "insecure"
  | "unknown";

export type CameraStartResult =
  | { ok: true; stream: MediaStream; track: MediaStreamTrack }
  | { ok: false; kind: CameraErrorKind };

export async function startRearCamera(): Promise<CameraStartResult> {
  if (!globalThis.isSecureContext && location.hostname !== "localhost") {
    return { ok: false, kind: "insecure" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, kind: "missing" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 1280 },
      },
    });
    const [track] = stream.getVideoTracks();
    if (!track) {
      stopMediaStream(stream);
      return { ok: false, kind: "missing" };
    }
    return { ok: true, stream, track };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      return { ok: false, kind: "denied" };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return { ok: false, kind: "missing" };
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return { ok: false, kind: "busy" };
    }
    return { ok: false, kind: "unknown" };
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function trackSupportsTorch(track: MediaStreamTrack | null) {
  if (!track || !("getCapabilities" in track)) return false;
  const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
    torch?: boolean;
  };
  return capabilities.torch === true;
}

export async function setTrackTorch(
  track: MediaStreamTrack,
  enabled: boolean,
) {
  await track.applyConstraints({
    advanced: [{ torch: enabled } as MediaTrackConstraintSet],
  });
}

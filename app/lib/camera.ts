export type CameraErrorKind =
  | "denied"
  | "missing"
  | "busy"
  | "insecure"
  | "unknown";

export type CameraStartResult =
  | { ok: true; stream: MediaStream; track: MediaStreamTrack }
  | { ok: false; kind: CameraErrorKind };

export async function getVideoDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}

export async function startRearCamera(
  deviceId?: string,
): Promise<CameraStartResult> {
  if (!globalThis.isSecureContext && location.hostname !== "localhost") {
    return { ok: false, kind: "insecure" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, kind: "missing" };
  }

  const videoConstraints: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 1280 },
      };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
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
  if (!track || track.kind !== "video") return false;
  return true;
}

export async function setTrackTorch(
  track: MediaStreamTrack,
  enabled: boolean,
) {
  if (!track || track.kind !== "video") return;
  if (typeof track.applyConstraints === "function") {
    try {
      await track.applyConstraints({
        advanced: [{ torch: enabled } as MediaTrackConstraintSet],
      });
    } catch (err) {
      console.warn("Torch constraint not supported", err);
      throw err;
    }
  }
}

import { apiBlob, apiUpload, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(blob);
  });
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Could not encode photo"));
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => (blob ? resolve(blob) : fail()), "image/jpeg", quality);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const comma = dataUrl.indexOf(",");
      const bytes = atob(dataUrl.slice(comma + 1));
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) out[i] = bytes.charCodeAt(i);
      resolve(new Blob([out], { type: "image/jpeg" }));
    } catch {
      fail();
    }
  });
}

async function drawSourceToCanvas(source: Blob): Promise<HTMLCanvasElement> {
  const max = 480;
  let width = 0;
  let height = 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process photo");

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source);
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      width = Math.max(1, Math.round(bitmap.width * scale));
      height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return canvas;
    } catch {
      /* decode via HTMLImageElement */
    }
  }

  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that photo"));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    width = Math.max(1, Math.round(img.naturalWidth * scale));
    height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressIdentityPhoto(source: Blob): Promise<File> {
  const canvas = await drawSourceToCanvas(source);
  const blob = await canvasToJpegBlob(canvas, 0.82);
  return new File([blob], "identity.jpg", { type: "image/jpeg" });
}

export function cameraErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission was blocked. Allow the camera in the browser address bar, or use Choose file.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera was found. Plug one in or use Choose file.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The camera is in use by another app. Close it and try again.";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "This camera could not start with the requested settings. Try Choose file.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Camera unavailable. Use Choose file instead.";
}

export async function requestIdentityCamera(): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("Camera needs localhost or HTTPS. Use Choose file instead.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot open a camera. Use Choose file instead.");
  }
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } } },
    { audio: false, video: { facingMode: { ideal: "user" } } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Camera unavailable");
}

export function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (ok: boolean) => {
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("playing", onReady);
      if (ok) resolve();
      else reject(new Error("Camera started but no picture arrived"));
    };
    const onReady = () => {
      if (video.videoWidth > 1) finish(true);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
  });
}

export async function fetchPatientPhotoDataUrl(patientId: string): Promise<string | null> {
  try {
    const blob = await apiBlob(`/api/v1/patients/${patientId}/photo`);
    if (!blob.size) return null;
    return blobToDataUrl(blob);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    return null;
  }
}

export async function uploadPatientPhoto(patientId: string, file: File): Promise<Patient> {
  const fd = new FormData();
  fd.append("file", file, file.name || "identity.jpg");
  return apiUpload<Patient>(`/api/v1/patients/${patientId}/photo`, fd);
}

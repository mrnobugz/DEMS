import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import {
  blobToDataUrl,
  cameraErrorMessage,
  canvasToJpegBlob,
  compressIdentityPhoto,
  requestIdentityCamera,
  waitForVideoFrame,
} from "@/lib/patientPhoto";

export function PatientIdentityPhoto({
  value,
  onChange,
  label = "Identity photo",
  persistHint,
}: {
  value: string;
  onChange: (dataUrl: string, file: File | null) => void;
  label?: string;
  persistHint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!live) return;
    const video = videoRef.current;
    if (!video) {
      setError("Photo preview failed to open. Use Choose file.");
      setLive(false);
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;

    void (async () => {
      try {
        stream = await requestIdentityCamera();
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        await waitForVideoFrame(video);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (cancelled) return;
        stream?.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
        setReady(false);
        setLive(false);
        setError(cameraErrorMessage(err));
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      video.srcObject = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [live]);

  function closeCamera() {
    setReady(false);
    setLive(false);
  }

  async function applyBlob(blob: Blob) {
    setError("");
    setBusy(true);
    try {
      const file = await compressIdentityPhoto(blob);
      const url = await blobToDataUrl(file);
      onChange(url, file);
      closeCamera();
    } catch {
      setError("Could not use that image. Try a JPEG or PNG, or capture again.");
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) {
      setError("Wait for the live picture, then press Capture.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not capture photo");
      ctx.drawImage(video, 0, 0);
      const blob = await canvasToJpegBlob(canvas, 0.92);
      await applyBlob(blob);
    } catch {
      setBusy(false);
      setError("Could not capture that frame. Try again or use Choose file.");
    }
  }

  return (
    <section className="reg-section">
      <h4 className="reg-section__title">{label}</h4>
      <div className="id-photo">
        <div className={`id-photo__frame${live ? " is-live" : ""}`}>
          {live ? (
            <>
              <video
                ref={videoRef}
                className="id-photo__media"
                autoPlay
                muted
                playsInline
              />
              {!ready && <div className="id-photo__empty">Starting camera…</div>}
            </>
          ) : value ? (
            <img src={value} alt="Patient identity" className="id-photo__media" />
          ) : (
            <div className="id-photo__empty">No photo</div>
          )}
        </div>
        <div className="id-photo__actions">
          {live ? (
            <>
              <button
                type="button"
                className="btn-primary"
                disabled={!ready || busy}
                onClick={() => void capture()}
              >
                <Camera size={14} /> {busy ? "Saving…" : ready ? "Capture" : "Warming up…"}
              </button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={closeCamera}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setLive(true);
                }}
              >
                <Camera size={14} /> {value ? "Retake" : "Take photo"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={14} /> Choose file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void applyBlob(file);
                }}
              />
              {value && (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    onChange("", null);
                    closeCamera();
                  }}
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
              {value && persistHint && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                  <RotateCcw size={12} /> {persistHint}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </section>
  );
}

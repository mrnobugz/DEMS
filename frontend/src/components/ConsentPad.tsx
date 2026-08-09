import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { api, ApiError } from "@/lib/api";

type Consent = {
  id: string;
  procedure_name: string;
  signed_at?: string | null;
  signed_by_name?: string | null;
  guardian: boolean;
  has_signature: boolean;
  document_hash?: string | null;
  created_at?: string | null;
};

type Props = {
  patientId: string;
  patientName?: string;
  onMessage?: (msg: string) => void;
};

export function ConsentPad({ patientId, patientName, onMessage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [procedure, setProcedure] = useState("General treatment consent");
  const [signer, setSigner] = useState(patientName || "");
  const [guardian, setGuardian] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const rows = await api<Consent[]>(`/api/v1/clinical/patients/${patientId}/consents`);
    setConsents(rows);
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  useEffect(() => {
    if (patientName && !signer) setSigner(patientName);
  }, [patientName]);

  function ctx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const c = canvas.getContext("2d");
    if (!c) return null;
    c.lineWidth = 2;
    c.lineCap = "round";
    c.strokeStyle = "#041e5c";
    return c;
  }

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function clearPad() {
    const canvas = canvasRef.current;
    const c = ctx();
    if (!canvas || !c) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
  }

  function isBlank() {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const c = canvas.getContext("2d");
    if (!c) return true;
    const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return false;
    }
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (isBlank()) {
      setError("Signature required");
      return;
    }
    try {
      const signature_data = canvasRef.current!.toDataURL("image/png");
      await api(`/api/v1/clinical/patients/${patientId}/consents`, {
        method: "POST",
        body: JSON.stringify({
          procedure_name: procedure,
          signature_data,
          signed_by_name: signer || null,
          guardian,
        }),
      });
      clearPad();
      await load();
      onMessage?.("Consent captured");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Consent failed");
    }
  }

  return (
    <div className="glass-panel space-y-4 rounded-3xl p-5">
      <div>
        <h3 className="font-display text-lg font-bold">Consent capture</h3>
        <p className="text-sm text-muted">Signature pad · hashed document trail · audit logged</p>
      </div>

      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className="label">Procedure / consent type</label>
          <input
            className="input"
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Signed by</label>
            <input
              className="input"
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              required
            />
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={guardian}
              onChange={(e) => setGuardian(e.target.checked)}
            />
            Guardian / parent
          </label>
        </div>
        <div>
          <label className="label">Signature</label>
          <canvas
            ref={canvasRef}
            width={640}
            height={180}
            className="h-36 w-full touch-none rounded-2xl border border-brand-200 bg-white"
            onPointerDown={(e) => {
              drawing.current = true;
              const c = ctx();
              if (!c) return;
              const p = pointerPos(e);
              c.beginPath();
              c.moveTo(p.x, p.y);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const c = ctx();
              if (!c) return;
              const p = pointerPos(e);
              c.lineTo(p.x, p.y);
              c.stroke();
            }}
            onPointerUp={() => {
              drawing.current = false;
            }}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary">
            Save consent
          </button>
          <button type="button" className="btn-ghost" onClick={clearPad}>
            Clear pad
          </button>
        </div>
      </form>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-brand-800">Prior consents</h4>
        {consents.length === 0 ? (
          <p className="text-sm text-muted">No consents on file.</p>
        ) : (
          consents.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl border border-brand-100 bg-white/70 px-3 py-2 text-sm"
            >
              <div className="font-semibold">{c.procedure_name}</div>
              <div className="text-xs text-muted">
                {c.signed_by_name || "—"}
                {c.guardian ? " (guardian)" : ""}
                {c.signed_at ? ` · ${format(parseISO(c.signed_at), "MMM d, yyyy HH:mm")}` : ""}
                {c.has_signature ? " · signed" : " · unsigned"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

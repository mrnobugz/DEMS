/**
 * CS 3D Imaging Orthogonal Slicing analog: axial / coronal / sagittal sliders
 * plus a 3D view, curved panoramic strip, nerve overlay, and Objects panel.
 *
 * When a real CBCT voxel volume is not present, slices are a planning
 * reconstruction from mapped anatomy (not a diagnostic radiograph).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Mouth3DLazy } from "./Mouth3DLazy";
import { ObjectsPanel, type ObjectLayerKey } from "./ObjectsPanel";
import { PERMANENT_LOWER, PERMANENT_UPPER, archPoint } from "./teeth";

type Props = {
  /** Optional 2D scout / reconstructed panoramic still */
  scoutUrl?: string | null;
  implants?: string[];
  missing?: string[];
  endo?: string[];
  selected?: string | null;
  onSelect?: (fdi: string) => void;
};

function SliceView({
  label,
  slice,
  onSlice,
  plane,
  implants,
  showNerve,
}: {
  label: string;
  slice: number;
  onSlice: (n: number) => void;
  plane: "axial" | "coronal" | "sagittal";
  implants: string[];
  showNerve: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, w, h);

    // soft tissue halo
    const g = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.45);
    g.addColorStop(0, "#1e293b");
    g.addColorStop(1, "#0b1220");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    const t = slice / 100;
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;

    if (plane === "axial") {
      // U-arch that rises as we go from occlusal toward apex... actually axial through jaws
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const p = archPoint(i / 32, w * 0.7, h * 0.32, "down");
        const x = w / 2 + p.x;
        const y = h * 0.55 + p.y * (0.4 + t * 0.4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // teeth as small ellipses on the arch
      ctx.fillStyle = "#e2e8f0";
      for (let i = 0; i < 16; i++) {
        const p = archPoint(i / 15, w * 0.7, h * 0.32, "down");
        ctx.beginPath();
        ctx.ellipse(w / 2 + p.x, h * 0.55 + p.y * (0.4 + t * 0.4), 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (plane === "coronal") {
      // frontal: two arches stacked
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.38, w * 0.28, 18 + t * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.62, w * 0.26, 16 + t * 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#cbd5e1";
      for (let i = -6; i <= 6; i++) {
        ctx.fillRect(w / 2 + i * 14 - 4, h * 0.34, 8, 18);
        ctx.fillRect(w / 2 + i * 13 - 3, h * 0.58, 7, 16);
      }
    } else {
      // sagittal: side view of one side of the jaw
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(w * 0.25, h * 0.35);
      ctx.quadraticCurveTo(w * 0.7, h * 0.2, w * 0.8, h * 0.55);
      ctx.quadraticCurveTo(w * 0.55, h * 0.75, w * 0.28, h * 0.62);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(w * 0.3 + i * 18, h * 0.4, 10, 22);
      }
    }

    if (showNerve && plane !== "coronal") {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.22, h * 0.68);
      ctx.quadraticCurveTo(w * 0.5, h * 0.78, w * 0.8, h * 0.64);
      ctx.stroke();
    }

    if (implants.length) {
      ctx.fillStyle = "#a1a1aa";
      ctx.fillRect(w * 0.62, h * 0.42, 8, 28);
      ctx.fillRect(w * 0.62, h * 0.38, 10, 6);
    }

    // crosshair
    ctx.strokeStyle = "rgba(11,95,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }, [slice, plane, implants, showNerve]);

  const sliderId = `${plane}-slice`;
  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-slate-100">
        <label htmlFor={sliderId}>{label}</label>
        <span>{slice}</span>
      </div>
      <canvas ref={ref} width={320} height={220} className="h-40 w-full" aria-hidden />
      <div className="px-3 pb-3">
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          value={slice}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={slice}
          onChange={(e) => onSlice(Number(e.target.value))}
          className="h-11 w-full cursor-pointer"
        />
      </div>
    </div>
  );
}

export function VolumeWorkspace({
  scoutUrl,
  implants = [],
  missing = [],
  endo = [],
  selected,
  onSelect,
}: Props) {
  const [axial, setAxial] = useState(50);
  const [coronal, setCoronal] = useState(50);
  const [sagittal, setSagittal] = useState(50);
  const [objects, setObjects] = useState<Record<ObjectLayerKey, boolean>>({
    teeth: true,
    maxilla: true,
    mandible: true,
    canalArch: false,
    nerves: true,
    implants: true,
    crowns: false,
    endo: true,
    wire: false,
  });

  const toothSelectId = useId();
  const titleId = "mpr-heading";
  const panPoints = useMemo(() => {
    const ids = [...PERMANENT_UPPER, ...PERMANENT_LOWER];
    return ids.map((fdi, i) => {
      const p = archPoint((i % 16) / 15, 420, 40, i < 16 ? "down" : "up");
      return { fdi, x: 230 + p.x, y: (i < 16 ? 36 : 78) + p.y };
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 id={titleId} className="font-display text-lg font-bold text-brand-900">
          3D / MPR workspace
        </h2>
        <p className="mt-1 text-sm text-muted">Orthogonal slices, a curved panoramic strip, and an objects list.</p>
      </div>
      <p role="status" className="rounded-2xl border border-brand-100 bg-canvas px-4 py-3 text-sm text-ink">
        {scoutUrl
          ? "Planning sketch only. These slices are not a diagnostic CBCT, even when a 2D image is open beside this view. Do not measure or diagnose from this panel."
          : "Planning sketch only. These slices are not a diagnostic CBCT. No image is attached to this planning view. Do not measure or diagnose from this panel."}
      </p>
      <div>
        <label htmlFor={toothSelectId} className="text-sm">
          <span className="label">Tooth on this volume</span>
          <select
            id={toothSelectId}
            className="input"
            value={selected ?? ""}
            onChange={(e) => {
              if (e.target.value) onSelect?.(e.target.value);
            }}
          >
            <option value="">Select a tooth</option>
            {[...PERMANENT_UPPER, ...PERMANENT_LOWER].map((fdi) => (
              <option key={fdi} value={fdi}>
                {fdi}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm text-muted">
          Use this list to select a tooth. The strip below highlights the same tooth.
          {onSelect ? " The selection also fills the tooth field on Register study." : ""}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <SliceView label="Axial" slice={axial} onSlice={setAxial} plane="axial" implants={implants} showNerve={objects.nerves} />
          <SliceView label="Coronal" slice={coronal} onSlice={setCoronal} plane="coronal" implants={implants} showNerve={objects.nerves} />
          <SliceView label="Sagittal" slice={sagittal} onSlice={setSagittal} plane="sagittal" implants={implants} showNerve={objects.nerves} />
          <div className="overflow-hidden rounded-xl bg-slate-950">
            <div className="px-3 py-2 text-sm font-semibold text-slate-100">3D view</div>
            <Mouth3DLazy
              title="Volume 3D"
              height={220}
              eager
              selected={selected}
              onSelect={onSelect}
              layers={{
                nerves: objects.nerves,
                implants: objects.implants ? implants : [],
                missing: objects.teeth ? missing : [...PERMANENT_UPPER, ...PERMANENT_LOWER],
                endo: objects.endo ? endo : [],
                maxillaArch: objects.maxilla,
                mandibleArch: objects.mandible,
                canalArch: objects.canalArch,
              }}
              wire={objects.wire ? "both" : null}
            />
          </div>
        </div>
        <ObjectsPanel
          layers={objects}
          onToggle={(key) => setObjects((o) => ({ ...o, [key]: !o[key] }))}
        />
      </div>
      <div className="rounded-2xl bg-slate-950 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-100">Curved panoramic strip</p>
        <p className="mb-2 text-sm text-slate-200">Pointer map of the arch. Select a tooth from the list above to change it.</p>
        <svg viewBox="0 0 460 120" className="w-full" aria-hidden="true">
          <rect width="460" height="120" fill="#0b1220" rx="8" />
          <path d="M30 40 Q230 8 430 40" fill="none" stroke="#334155" strokeWidth="18" />
          <path d="M30 82 Q230 112 430 82" fill="none" stroke="#334155" strokeWidth="16" />
          {objects.nerves && (
            <path d="M40 90 Q230 118 420 90" fill="none" stroke="#facc15" strokeWidth="3" />
          )}
          {panPoints.map((p) => (
            <g key={p.fdi} onClick={() => onSelect?.(p.fdi)} style={{ cursor: "pointer" }}>
              <rect
                x={p.x - 6}
                y={p.y - 10}
                width={12}
                height={18}
                rx={2}
                fill={selected === p.fdi ? "#0b5fff" : "#e2e8f0"}
              />
              <text x={p.x} y={p.y + 16} textAnchor="middle" fontSize="6" fill="#94a3b8">
                {p.fdi}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

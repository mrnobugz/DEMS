/**
 * CS 3D Imaging analog for clinic departments: 3D is the primary surface.
 * Orthogonal (axial / coronal / sagittal + 3D), curved panoramic, and oblique
 * workspaces; measure / implant / nerve tools; tooth-linked studies; department
 * actions on the selected site.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { Mouth3DLazy } from "./Mouth3DLazy";
import { ObjectsPanel, type ObjectLayerKey } from "./ObjectsPanel";
import {
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  PRIMARY_LOWER,
  PRIMARY_UPPER,
  archPoint,
  archTeeth,
  type Dentition,
} from "./teeth";

export type ImagingDeptMode = "restorative" | "surgical" | "ortho" | "paediatric";

export type ImagingAction = {
  id: string;
  label: string;
  hint?: string;
};

type Study = {
  id: string;
  patient_id: string;
  study_type: string;
  tooth?: string | null;
  captured_at: string;
  has_content?: boolean;
};

type Tool = "select" | "measure" | "implant" | "nerve";
type Workspace = "orthogonal" | "curved" | "oblique";

const DEPT_ACTIONS: Record<ImagingDeptMode, ImagingAction[]> = {
  restorative: [
    { id: "case", label: "Open restorative case", hint: "Fill the case form with this tooth" },
    { id: "endo", label: "Mark endo / RCT", hint: "Highlight canal and set tooth for endo" },
    { id: "crown", label: "Plan crown", hint: "Set case type to crown on this tooth" },
    { id: "imaging", label: "Filter studies", hint: "Show CBCT / PA tagged to this tooth" },
  ],
  surgical: [
    { id: "extract", label: "Open extraction", hint: "Surgical case at this site" },
    { id: "implant", label: "Place implant", hint: "Virtual fixture on this FDI" },
    { id: "nerve", label: "Trace IAN", hint: "Show mandibular nerve canal" },
    { id: "followup", label: "Post-op follow-up", hint: "Jump to follow-up on matching case" },
  ],
  ortho: [
    { id: "arch", label: "Assign treated arch", hint: "Upper / lower from this tooth" },
    { id: "adjust", label: "Adjustment visit", hint: "Record wire/aligner stage" },
    { id: "tad", label: "Plan TAD / anchorage", hint: "Mark site for temporary anchorage" },
    { id: "wire", label: "Toggle archwire", hint: "Show brackets + wire on active arches" },
  ],
  paediatric: [
    { id: "profile", label: "Open paediatric profile", hint: "Child chart for this patient" },
    { id: "fluoride", label: "Fluoride varnish", hint: "Arm preventive treatment on this tooth" },
    { id: "sealant", label: "Fissure sealant", hint: "Primary molar sealant" },
    { id: "ssc", label: "Stainless steel crown", hint: "SSC on selected primary tooth" },
  ],
};

type Props = {
  mode: ImagingDeptMode;
  patientId?: string;
  selected?: string | null;
  onSelect: (fdi: string) => void;
  colors?: Record<string, string | undefined>;
  implants?: string[];
  missing?: string[];
  endo?: string[];
  wire?: "upper" | "lower" | "both" | null;
  dentition?: Dentition;
  onAction?: (actionId: string, tooth: string) => void;
  extraImplants?: string[];
};

function fdiList(dentition: Dentition) {
  return dentition === "primary"
    ? [...PRIMARY_UPPER, ...PRIMARY_LOWER]
    : [...PERMANENT_UPPER, ...PERMANENT_LOWER];
}

function toothFromSlice(
  plane: "axial" | "coronal" | "sagittal",
  nx: number,
  ny: number,
  dentition: Dentition,
): string {
  const { upper, lower } = archTeeth(dentition);
  const arch = ny < 0.52 ? upper : lower;
  const t = plane === "sagittal" ? 1 - ny : nx;
  const i = Math.round(Math.min(1, Math.max(0, t)) * (arch.length - 1));
  return arch[i]?.fdi ?? upper[0].fdi;
}

function SlicePane({
  label,
  slice,
  onSlice,
  plane,
  implants,
  showNerve,
  selected,
  tool,
  dentition,
  onSelect,
  onMeasure,
}: {
  label: string;
  slice: number;
  onSlice: (n: number) => void;
  plane: "axial" | "coronal" | "sagittal";
  implants: string[];
  showNerve: boolean;
  selected?: string | null;
  tool: Tool;
  dentition: Dentition;
  onSelect: (fdi: string) => void;
  onMeasure?: (units: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const measure = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * 0.48);
    g.addColorStop(0, "#1e293b");
    g.addColorStop(1, "#070b14");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.44, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    const t = slice / 100;
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    if (plane === "axial") {
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const p = archPoint(i / 32, w * 0.72, h * 0.34, "down");
        const x = w / 2 + p.x;
        const y = h * 0.55 + p.y * (0.35 + t * 0.45);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      const ids = dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
      ids.forEach((fdi, i) => {
        const p = archPoint(i / (ids.length - 1), w * 0.72, h * 0.34, "down");
        ctx.fillStyle = fdi === selected ? "#0b5fff" : "#e2e8f0";
        ctx.beginPath();
        ctx.ellipse(w / 2 + p.x, h * 0.55 + p.y * (0.35 + t * 0.45), 5, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (plane === "coronal") {
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.36, w * 0.3, 16 + t * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.64, w * 0.28, 14 + t * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      const n = dentition === "primary" ? 5 : 7;
      for (let i = -n; i <= n; i++) {
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(w / 2 + i * 14 - 4, h * 0.32, 8, 20);
        ctx.fillRect(w / 2 + i * 13 - 3, h * 0.58, 7, 18);
      }
    } else {
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(w * 0.22, h * 0.34);
      ctx.quadraticCurveTo(w * 0.72, h * 0.16 + t * 20, w * 0.82, h * 0.54);
      ctx.quadraticCurveTo(w * 0.52, h * 0.78, w * 0.24, h * 0.64);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      for (let i = 0; i < 8; i++) ctx.fillRect(w * 0.28 + i * 18, h * 0.4, 10, 22);
    }
    if (showNerve && plane !== "coronal") {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.7);
      ctx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.82, h * 0.66);
      ctx.stroke();
    }
    if (implants.length) {
      ctx.fillStyle = "#a1a1aa";
      ctx.fillRect(w * 0.6, h * 0.4, 8, 30);
      ctx.fillRect(w * 0.59, h * 0.36, 10, 6);
    }
    ctx.strokeStyle = "rgba(11,95,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.fillText(plane.toUpperCase(), 8, 16);
  }, [slice, plane, implants, showNerve, selected, dentition]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    if (tool === "measure") {
      const pt = { x: nx * canvas.width, y: ny * canvas.height };
      if (!measure.current) {
        measure.current = pt;
      } else {
        const d = Math.hypot(pt.x - measure.current.x, pt.y - measure.current.y);
        onMeasure?.(Number((d / canvas.width * 40).toFixed(1)));
        measure.current = null;
      }
      return;
    }
    onSelect(toothFromSlice(plane, nx, ny, dentition));
  }

  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
        <span>z={slice}</span>
      </div>
      <canvas
        ref={ref}
        width={360}
        height={240}
        className="h-44 w-full cursor-crosshair"
        onClick={onClick}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={slice}
        onChange={(e) => onSlice(Number(e.target.value))}
        className="w-full"
        aria-label={`${label} slice`}
      />
    </div>
  );
}

export function Clinical3DImaging({
  mode,
  patientId,
  selected,
  onSelect,
  colors = {},
  implants = [],
  missing = [],
  endo = [],
  wire = null,
  dentition = "permanent",
  onAction,
  extraImplants = [],
}: Props) {
  const [workspace, setWorkspace] = useState<Workspace>("orthogonal");
  const [tool, setTool] = useState<Tool>("select");
  const [axial, setAxial] = useState(50);
  const [coronal, setCoronal] = useState(48);
  const [sagittal, setSagittal] = useState(52);
  const [oblique, setOblique] = useState(0);
  const [cross, setCross] = useState(50);
  const [measureMm, setMeasureMm] = useState<number | null>(null);
  const [placedImplants, setPlacedImplants] = useState<string[]>(extraImplants);
  const [nerveOn, setNerveOn] = useState(mode === "surgical");
  const [wireOn, setWireOn] = useState(Boolean(wire));
  const [studies, setStudies] = useState<Study[]>([]);
  const [objects, setObjects] = useState<Record<ObjectLayerKey, boolean>>({
    teeth: true,
    nerves: mode === "surgical",
    implants: mode === "surgical",
    endo: mode === "restorative",
    wire: mode === "ortho",
  });

  useEffect(() => {
    setWireOn(Boolean(wire));
  }, [wire]);

  useEffect(() => {
    if (!patientId) {
      setStudies([]);
      return;
    }
    api<Study[]>(`/api/v1/imaging/studies?patient_id=${patientId}`)
      .then(setStudies)
      .catch(() => setStudies([]));
  }, [patientId]);

  const allImplants = useMemo(
    () => [...new Set([...implants, ...placedImplants])],
    [implants, placedImplants],
  );
  const linked = useMemo(
    () => (selected ? studies.filter((s) => s.tooth === selected) : studies),
    [studies, selected],
  );
  const effectiveWire = wireOn ? wire || "both" : null;
  const actions = DEPT_ACTIONS[mode];

  function handleSelect(fdi: string) {
    onSelect(fdi);
    if (tool === "implant") {
      setPlacedImplants((prev) => (prev.includes(fdi) ? prev : [...prev, fdi]));
      setObjects((o) => ({ ...o, implants: true }));
      onAction?.("implant", fdi);
    }
    if (tool === "nerve") {
      setNerveOn(true);
      setObjects((o) => ({ ...o, nerves: true }));
      onAction?.("nerve", fdi);
    }
  }

  const allFdi = fdiList(dentition);

  return (
    <section className="glass-panel space-y-3 rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            CS 3D Imaging · {mode}
          </p>
          <h3 className="font-display text-lg font-bold text-brand-900">
            3D volume workspace
          </h3>
          <p className="text-xs text-muted">
            Orthogonal · curved panoramic · oblique · measure · implant · nerve · click any
            plane or the 3D model to operate on a tooth
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["orthogonal", "curved", "oblique"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                workspace === w ? "bg-brand-500 text-white" : "border border-brand-100 bg-white text-muted"
              }`}
              onClick={() => setWorkspace(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["select", "measure", "implant", "nerve"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize ${
              tool === t ? "bg-slate-900 text-white" : "border border-brand-100 bg-white text-muted"
            }`}
            onClick={() => {
              setTool(t);
              if (t === "nerve") {
                setNerveOn(true);
                setObjects((o) => ({ ...o, nerves: true }));
              }
            }}
          >
            {t === "nerve" ? "Trace nerve" : t === "implant" ? "Place implant" : t}
          </button>
        ))}
        {measureMm != null && (
          <span className="self-center text-[11px] font-semibold text-brand-700">
            Indicative {measureMm} u (click two points on a slice)
          </span>
        )}
        {selected && (
          <span className="self-center text-[11px] font-bold text-brand-900">
            Site {selected}
          </span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
        {workspace === "orthogonal" && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 overflow-hidden rounded-xl bg-slate-950">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                3D view · orbit / zoom · tap tooth
              </div>
              <Mouth3DLazy
                eager
                title="Department 3D"
                height={320}
                dentition={dentition}
                colors={colors}
                selected={selected}
                onSelect={handleSelect}
                wire={objects.wire ? effectiveWire : null}
                layers={{
                  nerves: objects.nerves && nerveOn,
                  implants: objects.implants ? allImplants : [],
                  missing: objects.teeth ? missing : allFdi,
                  endo: objects.endo ? endo : [],
                }}
              />
            </div>
            <SlicePane
              label="Axial"
              slice={axial}
              onSlice={setAxial}
              plane="axial"
              implants={allImplants}
              showNerve={objects.nerves && nerveOn}
              selected={selected}
              tool={tool}
              dentition={dentition}
              onSelect={handleSelect}
              onMeasure={setMeasureMm}
            />
            <SlicePane
              label="Coronal"
              slice={coronal}
              onSlice={setCoronal}
              plane="coronal"
              implants={allImplants}
              showNerve={objects.nerves && nerveOn}
              selected={selected}
              tool={tool}
              dentition={dentition}
              onSelect={handleSelect}
              onMeasure={setMeasureMm}
            />
            <SlicePane
              label="Sagittal"
              slice={sagittal}
              onSlice={setSagittal}
              plane="sagittal"
              implants={allImplants}
              showNerve={objects.nerves && nerveOn}
              selected={selected}
              tool={tool}
              dentition={dentition}
              onSelect={handleSelect}
              onMeasure={setMeasureMm}
            />
          </div>
        )}

        {workspace === "curved" && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Curved panoramic · arch mapping
              </div>
              <svg viewBox="0 0 460 130" className="w-full">
                <rect width="460" height="130" fill="#070b14" />
                <path d="M28 42 Q230 6 432 42" fill="none" stroke="#334155" strokeWidth="20" />
                <path d="M28 88 Q230 118 432 88" fill="none" stroke="#334155" strokeWidth="18" />
                {objects.nerves && nerveOn && (
                  <path d="M40 96 Q230 122 420 96" fill="none" stroke="#facc15" strokeWidth="3" />
                )}
                {fdiList(dentition).map((fdi) => {
                  const upper = dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
                  const isUpper = upper.includes(fdi);
                  const row = isUpper
                    ? upper
                    : dentition === "primary"
                      ? PRIMARY_LOWER
                      : PERMANENT_LOWER;
                  const idx = Math.max(0, row.indexOf(fdi));
                  const p = archPoint(idx / Math.max(1, row.length - 1), 400, 28, isUpper ? "down" : "up");
                  return (
                    <g key={fdi} onClick={() => handleSelect(fdi)} style={{ cursor: "pointer" }}>
                      <rect
                        x={230 + p.x - 7}
                        y={(isUpper ? 38 : 86) + p.y - 11}
                        width={14}
                        height={20}
                        rx={2}
                        fill={selected === fdi ? "#0b5fff" : colors[fdi] || "#e2e8f0"}
                      />
                      <text x={230 + p.x} y={(isUpper ? 38 : 86) + p.y + 18} textAnchor="middle" fontSize="7" fill="#94a3b8">
                        {fdi}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <label className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-slate-400">
                Cross-section
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cross}
                  onChange={(e) => setCross(Number(e.target.value))}
                  className="flex-1"
                />
                {cross}
              </label>
            </div>
            <Mouth3DLazy
              eager
              height={260}
              dentition={dentition}
              colors={colors}
              selected={selected}
              onSelect={handleSelect}
              wire={objects.wire ? effectiveWire : null}
              layers={{
                nerves: objects.nerves && nerveOn,
                implants: objects.implants ? allImplants : [],
                missing: objects.teeth ? missing : allFdi,
                endo: objects.endo ? endo : [],
              }}
            />
          </div>
        )}

        {workspace === "oblique" && (
          <div className="grid gap-3 md:grid-cols-2">
            <SlicePane
              label={`Oblique sagittal (${oblique}°)`}
              slice={sagittal}
              onSlice={setSagittal}
              plane="sagittal"
              implants={allImplants}
              showNerve={objects.nerves && nerveOn}
              selected={selected}
              tool={tool}
              dentition={dentition}
              onSelect={handleSelect}
              onMeasure={setMeasureMm}
            />
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                3D · rotate around site
              </div>
              <Mouth3DLazy
                eager
                autoRotate
                height={260}
                dentition={dentition}
                colors={colors}
                selected={selected}
                onSelect={handleSelect}
                wire={objects.wire ? effectiveWire : null}
                layers={{
                  nerves: objects.nerves && nerveOn,
                  implants: objects.implants ? allImplants : [],
                  missing: objects.teeth ? missing : allFdi,
                  endo: objects.endo ? endo : [],
                }}
              />
              <label className="flex items-center gap-2 px-2 py-1 text-[10px] font-semibold text-slate-400">
                Tilt
                <input
                  type="range"
                  min={-45}
                  max={45}
                  value={oblique}
                  onChange={(e) => setOblique(Number(e.target.value))}
                  className="flex-1"
                />
              </label>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <ObjectsPanel
            layers={objects}
            onToggle={(key) => {
              setObjects((o) => ({ ...o, [key]: !o[key] }));
              if (key === "wire") setWireOn((v) => !v);
              if (key === "nerves") setNerveOn((v) => !v);
            }}
          />
          {selected && (
            <div className="rounded-2xl border border-brand-100 bg-white/80 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                Actions · tooth {selected}
              </p>
              <div className="flex flex-col gap-1">
                {actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="rounded-xl bg-brand-50 px-3 py-2 text-left text-xs font-semibold text-brand-900 hover:bg-brand-100"
                    onClick={() => {
                      if (a.id === "wire") setWireOn((v) => !v);
                      if (a.id === "nerve") {
                        setNerveOn(true);
                        setObjects((o) => ({ ...o, nerves: true }));
                      }
                      if (a.id === "implant") {
                        setPlacedImplants((p) => (selected && !p.includes(selected) ? [...p, selected] : p));
                        setObjects((o) => ({ ...o, implants: true }));
                      }
                      onAction?.(a.id, selected);
                    }}
                  >
                    {a.label}
                    {a.hint && <div className="font-normal text-muted">{a.hint}</div>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
          Linked studies {selected ? `· tooth ${selected}` : "· this patient"}
        </p>
        {linked.length === 0 ? (
          <p className="text-xs text-muted">
            {patientId
              ? "No imaging tagged yet — register a CBCT/PA in Imaging, or operate on the 3D reconstruction."
              : "Select a patient to load tagged CBCT / PA / OPG studies."}
          </p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {linked.map((s) => (
              <li key={s.id} className="rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold">
                {s.study_type}
                {s.tooth ? ` · ${s.tooth}` : ""} · {format(parseISO(s.captured_at), "MMM d")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

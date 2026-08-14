/**
 * CS 3D Imaging analog for clinic departments: 3D is the primary surface.
 * Orthogonal MPR with linked crosshairs, window/level, curved panoramic with
 * auto arch/nerve mapping, root-canal tracing, PDIP-lite implant planning,
 * measurements, render presets, and darkroom.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { Mouth3DLazy } from "./Mouth3DLazy";
import { ObjectsPanel, type ObjectLayerKey } from "./ObjectsPanel";
import type { ImplantPlan, RenderPreset } from "./Mouth3D";
import {
  crownSummary,
  proposeImplantFromCrown,
  proposeVirtualCrown,
  type CrownMaterial,
  type CrownMode,
  type CrownPlan,
} from "./virtualCrown";
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

export type ImagingActionMeta = {
  lengthMm?: number;
  angleDeg?: number;
  implant?: ImplantPlan & { fdi: string };
  clearanceMm?: number | null;
  crown?: CrownPlan;
};

type Study = {
  id: string;
  patient_id: string;
  study_type: string;
  tooth?: string | null;
  captured_at: string;
  has_content?: boolean;
};

type Tool = "select" | "window" | "length" | "angle" | "canal" | "crown" | "implant" | "nerve" | "probe";
type Workspace = "orthogonal" | "curved" | "oblique";
type Plane = "axial" | "coronal" | "sagittal";
type Pt = { x: number; y: number };

type LengthAnn = { id: string; kind: "length"; plane: Plane; a: Pt; b: Pt; mm: number };
type AngleAnn = { id: string; kind: "angle"; plane: Plane; a: Pt; b: Pt; c: Pt; deg: number };
type Ann = LengthAnn | AngleAnn;
type CanalTrace = { id: string; tooth: string; plane: Plane; pts: Pt[] };

const DEPT_ACTIONS: Record<ImagingDeptMode, ImagingAction[]> = {
  restorative: [
    { id: "case", label: "Open restorative case", hint: "Fill the case form with this tooth" },
    { id: "endo", label: "Mark endo / RCT", hint: "Highlight canal and set tooth for endo" },
    { id: "canal", label: "Trace root canal", hint: "CS canal tool — click along the canal on MPR" },
    { id: "auto-crown", label: "AI auto crown", hint: "Propose anatomic virtual crown (review before accepting)" },
    { id: "working-length", label: "Apply working length", hint: "Last length measurement → case notes" },
    { id: "crown", label: "Plan crown case", hint: "Set case type to crown on this tooth" },
  ],
  surgical: [
    { id: "extract", label: "Open extraction", hint: "Surgical case at this site" },
    { id: "implant", label: "Place implant", hint: "PDIP fixture on this FDI" },
    { id: "auto-crown", label: "AI auto crown", hint: "Virtual crown first — prosthetic-driven" },
    { id: "auto-crown-implant", label: "AI crown + implant", hint: "Crown proposal then fixture from emergence" },
    { id: "auto-arch", label: "AI map arches", hint: "Auto panoramic curves (maxilla + mandible)" },
    { id: "auto-nerve", label: "AI map IAN", hint: "Requires arches first — CS canal arch" },
    { id: "pdip", label: "Export PDIP plan", hint: "Download implant plan for lab review" },
    { id: "followup", label: "Post-op follow-up", hint: "Jump to follow-up on matching case" },
  ],
  ortho: [
    { id: "arch", label: "Assign treated arch", hint: "Upper / lower from this tooth" },
    { id: "adjust", label: "Adjustment visit", hint: "Record wire/aligner stage" },
    { id: "tad", label: "Plan TAD / anchorage", hint: "Mark site for temporary anchorage" },
    { id: "ceph", label: "Record angle", hint: "Last angular measure → malocclusion notes" },
    { id: "wire", label: "Toggle archwire", hint: "Show brackets + wire on active arches" },
  ],
  paediatric: [
    { id: "profile", label: "Open paediatric profile", hint: "Child chart for this patient" },
    { id: "fluoride", label: "Fluoride varnish", hint: "Arm preventive treatment on this tooth" },
    { id: "sealant", label: "Fissure sealant", hint: "Primary molar sealant" },
    { id: "ssc", label: "Stainless steel crown", hint: "SSC on selected primary tooth" },
    { id: "auto-crown", label: "AI auto SSC", hint: "Primary anatomic crown / SSC proposal" },
    { id: "fov0", label: "Paediatric FOV", hint: "Size-0 crop analog for small mouths" },
  ],
};

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "window", label: "W/L" },
  { id: "length", label: "Length" },
  { id: "angle", label: "Angle" },
  { id: "canal", label: "Canal" },
  { id: "crown", label: "Crown" },
  { id: "implant", label: "Implant" },
  { id: "nerve", label: "Nerve" },
  { id: "probe", label: "Probe" },
];

const DIAMETERS = [3.3, 3.5, 4.1, 4.8];
const LENGTHS = [8, 10, 11.5, 13];

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
  onAction?: (actionId: string, tooth: string, meta?: ImagingActionMeta) => void;
  extraImplants?: string[];
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function fdiList(dentition: Dentition) {
  return dentition === "primary"
    ? [...PRIMARY_UPPER, ...PRIMARY_LOWER]
    : [...PERMANENT_UPPER, ...PERMANENT_LOWER];
}

function toothFromSlice(plane: Plane, nx: number, ny: number, dentition: Dentition): string {
  const { upper, lower } = archTeeth(dentition);
  const arch = ny < 0.52 ? upper : lower;
  const t = plane === "sagittal" ? 1 - ny : nx;
  const i = Math.round(Math.min(1, Math.max(0, t)) * (arch.length - 1));
  return arch[i]?.fdi ?? upper[0].fdi;
}

function angleDeg(a: Pt, b: Pt, c: Pt) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const den = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (!den) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / den))) * 180) / Math.PI;
}

/** Indicative IAN clearance (mm) for mandibular posterior implants — not diagnostic. */
export function nerveClearance(fdi: string, length: number): number | null {
  const quad = Number(fdi[0]);
  const pos = Number(fdi[1]);
  if (quad !== 3 && quad !== 4) return null;
  if (pos < 4) return Number((9.5 - (length - 10) * 0.2).toFixed(1));
  const base = pos >= 6 ? 3.4 : 5.1;
  return Number(Math.max(0.4, base - (length - 10) * 0.35).toFixed(1));
}

function pxToMm(px: number, canvasW: number) {
  return Number(((px / canvasW) * 40).toFixed(1));
}

type SliceProps = {
  label: string;
  slice: number;
  onSlice: (n: number) => void;
  plane: Plane;
  implants: string[];
  implantPlans: Record<string, ImplantPlan>;
  crowns: CrownPlan[];
  showNerve: boolean;
  showMaxilla: boolean;
  showMandible: boolean;
  selected?: string | null;
  tool: Tool;
  dentition: Dentition;
  axial: number;
  coronal: number;
  sagittal: number;
  onCrosshair: (plane: Plane, nx: number, ny: number) => void;
  onSelect: (fdi: string) => void;
  onLength: (ann: LengthAnn) => void;
  onAngle: (ann: AngleAnn) => void;
  onCanal: (pts: Pt[], plane: Plane) => void;
  onWindow: (db: number, dc: number) => void;
  onProbe: (value: number) => void;
  anns: Ann[];
  canals: CanalTrace[];
  brightness: number;
  contrast: number;
  invert: boolean;
  slab: number;
  tightFov: boolean;
};

function SlicePane(p: SliceProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const draft = useRef<Pt[]>([]);
  const winDrag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, w, h);
    const radius = p.tightFov ? 0.32 : 0.44;
    const g = ctx.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * (radius + 0.04));
    g.addColorStop(0, "#1e293b");
    g.addColorStop(1, "#070b14");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * radius, h * (radius - 0.04), 0, 0, Math.PI * 2);
    ctx.fill();

    const t = p.slice / 100;
    const slabW = 1.5 + p.slab * 0.6;
    ctx.lineWidth = slabW;
    if (p.plane === "axial") {
      ctx.strokeStyle = "#64748b";
      ctx.beginPath();
      for (let i = 0; i <= 32; i++) {
        const pt = archPoint(i / 32, w * 0.72, h * 0.34, "down");
        const x = w / 2 + pt.x;
        const y = h * 0.55 + pt.y * (0.35 + t * 0.45);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (p.showMaxilla) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const ids = p.dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
      ids.forEach((fdi, i) => {
        const pt = archPoint(i / Math.max(1, ids.length - 1), w * 0.72, h * 0.34, "down");
        const planned = p.crowns.find((c) => c.fdi === fdi);
        ctx.fillStyle = fdi === p.selected ? "#0b5fff" : planned ? "#f59e0b" : "#e2e8f0";
        ctx.beginPath();
        ctx.ellipse(w / 2 + pt.x, h * 0.55 + pt.y * (0.35 + t * 0.45), planned ? 6 : 5, planned ? 8 : 7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (p.plane === "coronal") {
      ctx.strokeStyle = "#94a3b8";
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.36, w * 0.3, 16 + t * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.64, w * 0.28, 14 + t * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (p.showMaxilla) {
        ctx.strokeStyle = "#ef4444";
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.36, w * 0.3, 16 + t * 10, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.showMandible) {
        ctx.strokeStyle = "#f97316";
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.64, w * 0.28, 14 + t * 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const n = p.dentition === "primary" ? 5 : 7;
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
    if (p.showNerve && p.plane !== "coronal") {
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * 0.7);
      ctx.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.82, h * 0.66);
      ctx.stroke();
    }
    if (p.implants.length) {
      ctx.fillStyle = "#a1a1aa";
      const plan = p.selected ? p.implantPlans[p.selected] : undefined;
      const ih = 24 + ((plan?.length ?? 10) - 10) * 2;
      ctx.fillRect(w * 0.6, h * 0.4, 8, ih);
      ctx.fillRect(w * 0.59, h * 0.36, 10, 6);
    }

    const vx = p.plane === "axial" ? p.sagittal / 100 : p.plane === "coronal" ? p.sagittal / 100 : p.coronal / 100;
    const hy = p.plane === "axial" ? p.coronal / 100 : p.axial / 100;
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.plane === "sagittal" ? "#38bdf8" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(vx * w, 0);
    ctx.lineTo(vx * w, h);
    ctx.stroke();
    ctx.strokeStyle = p.plane === "axial" ? "#38bdf8" : "#facc15";
    ctx.beginPath();
    ctx.moveTo(0, hy * h);
    ctx.lineTo(w, hy * h);
    ctx.stroke();

    for (const a of p.anns.filter((x) => x.plane === p.plane)) {
      ctx.strokeStyle = "#22d3ee";
      ctx.fillStyle = "#22d3ee";
      ctx.lineWidth = 1.5;
      if (a.kind === "length") {
        ctx.beginPath();
        ctx.moveTo(a.a.x, a.a.y);
        ctx.lineTo(a.b.x, a.b.y);
        ctx.stroke();
        ctx.font = "10px sans-serif";
        ctx.fillText(`${a.mm} mm`, (a.a.x + a.b.x) / 2 + 4, (a.a.y + a.b.y) / 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(a.a.x, a.a.y);
        ctx.lineTo(a.b.x, a.b.y);
        ctx.lineTo(a.c.x, a.c.y);
        ctx.stroke();
        ctx.font = "10px sans-serif";
        ctx.fillText(`${a.deg}°`, a.b.x + 6, a.b.y - 4);
      }
    }
    for (const c of p.canals.filter((x) => x.plane === p.plane)) {
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      c.pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    ctx.fillText(p.plane.toUpperCase(), 8, 16);
  }, [p]);

  function local(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current!;
    const r = canvas.getBoundingClientRect();
    return {
      nx: (e.clientX - r.left) / r.width,
      ny: (e.clientY - r.top) / r.height,
      pt: {
        x: ((e.clientX - r.left) / r.width) * canvas.width,
        y: ((e.clientY - r.top) / r.height) * canvas.height,
      },
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    if (!canvas) return;
    const { nx, ny, pt } = local(e);
    if (p.tool === "window") {
      winDrag.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (p.tool === "probe") {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const pix = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
        p.onProbe(Math.round((pix[0] + pix[1] + pix[2]) / 3));
      }
      p.onSelect(toothFromSlice(p.plane, nx, ny, p.dentition));
      return;
    }
    if (p.tool === "length") {
      draft.current.push(pt);
      if (draft.current.length >= 2) {
        const [a, b] = draft.current;
        p.onLength({
          id: uid(),
          kind: "length",
          plane: p.plane,
          a,
          b,
          mm: pxToMm(Math.hypot(b.x - a.x, b.y - a.y), canvas.width),
        });
        draft.current = [];
      }
      return;
    }
    if (p.tool === "angle") {
      draft.current.push(pt);
      if (draft.current.length >= 3) {
        const [a, b, c] = draft.current;
        p.onAngle({
          id: uid(),
          kind: "angle",
          plane: p.plane,
          a,
          b,
          c,
          deg: Number(angleDeg(a, b, c).toFixed(1)),
        });
        draft.current = [];
      }
      return;
    }
    if (p.tool === "canal") {
      draft.current.push(pt);
      return;
    }
    p.onCrosshair(p.plane, nx, ny);
    p.onSelect(toothFromSlice(p.plane, nx, ny, p.dentition));
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (p.tool !== "window" || !winDrag.current) return;
    const db = Math.round((winDrag.current.y - e.clientY) * 0.4);
    const dc = Math.round((e.clientX - winDrag.current.x) * 0.4);
    winDrag.current = { x: e.clientX, y: e.clientY };
    p.onWindow(db, dc);
  }

  function onPointerUp() {
    winDrag.current = null;
  }

  function onDoubleClick() {
    if (p.tool === "canal" && draft.current.length >= 2) {
      p.onCanal(draft.current, p.plane);
      draft.current = [];
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {p.label}
        <span>z={p.slice}</span>
      </div>
      <canvas
        ref={ref}
        width={360}
        height={240}
        className="h-44 w-full cursor-crosshair"
        style={{
          filter: `brightness(${p.brightness}%) contrast(${p.contrast}%) invert(${p.invert ? 1 : 0})`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={p.slice}
        onChange={(e) => p.onSlice(Number(e.target.value))}
        className="w-full"
        aria-label={`${p.label} slice`}
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
  const [placedImplants, setPlacedImplants] = useState<string[]>(extraImplants);
  const [plans, setPlans] = useState<Record<string, ImplantPlan>>({});
  const [crowns, setCrowns] = useState<Record<string, CrownPlan>>({});
  const [crownMode, setCrownMode] = useState<CrownMode>(() => {
    try {
      return localStorage.getItem("dems.crownMode") === "manual" ? "manual" : "ai";
    } catch {
      return "ai";
    }
  });
  const [nerveOn, setNerveOn] = useState(mode === "surgical");
  const [wireOn, setWireOn] = useState(Boolean(wire));
  const [archMapped, setArchMapped] = useState(mode === "surgical" || mode === "ortho");
  const [studies, setStudies] = useState<Study[]>([]);
  const [objects, setObjects] = useState<Record<ObjectLayerKey, boolean>>({
    teeth: true,
    maxilla: mode === "surgical" || mode === "ortho",
    mandible: mode === "surgical" || mode === "ortho",
    canalArch: mode === "surgical",
    nerves: mode === "surgical",
    implants: mode === "surgical",
    crowns: mode === "restorative" || mode === "surgical" || mode === "paediatric",
    endo: mode === "restorative" || mode === "paediatric",
    wire: mode === "ortho",
  });
  const [anns, setAnns] = useState<Ann[]>([]);
  const [canals, setCanals] = useState<CanalTrace[]>([]);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(110);
  const [invert, setInvert] = useState(false);
  const [slab, setSlab] = useState(1);
  const [preset, setPreset] = useState<RenderPreset>(mode === "restorative" ? "transparent" : "teeth");
  const [darkroom, setDarkroom] = useState(false);
  const [tightFov, setTightFov] = useState(mode === "paediatric");
  const [probe, setProbe] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [layout, setLayout] = useState<"mpr" | "grid">("mpr");

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
  const lastLength = [...anns].reverse().find((a): a is LengthAnn => a.kind === "length");
  const lastAngle = [...anns].reverse().find((a): a is AngleAnn => a.kind === "angle");
  const activePlan = selected ? plans[selected] : undefined;
  const clearance = selected && activePlan ? nerveClearance(selected, activePlan.length) : null;
  const allFdi = fdiList(dentition);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }

  function mapArches() {
    setArchMapped(true);
    setObjects((o) => ({ ...o, maxilla: true, mandible: true }));
    setWorkspace("curved");
    flash("Arches mapped — maxilla + mandible (AI analog)");
  }

  function mapNerve() {
    if (!archMapped && !objects.maxilla && !objects.mandible) {
      flash("Map the panoramic arch first (CS 3D requirement)");
      return;
    }
    setNerveOn(true);
    setObjects((o) => ({ ...o, nerves: true, canalArch: true, mandible: true }));
    flash("IAN canals traced — Canal arch in Objects");
  }

  function placeImplant(fdi: string) {
    setPlacedImplants((prev) => (prev.includes(fdi) ? prev : [...prev, fdi]));
    setPlans((prev) => ({
      ...prev,
      [fdi]: prev[fdi] ?? { diameter: 4.1, length: 10, angle: 0 },
    }));
    setObjects((o) => ({ ...o, implants: true }));
  }

  function placeVirtualCrown(fdi: string, mode: CrownMode = crownMode, withImplant = false): CrownPlan {
    const plan = proposeVirtualCrown({
      fdi,
      dentition,
      missing,
      implants: allImplants,
      implant: plans[fdi],
      mode,
    });
    setCrowns((prev) => ({ ...prev, [fdi]: plan }));
    setObjects((o) => ({ ...o, crowns: true }));
    if (withImplant) {
      const fixture = proposeImplantFromCrown(plan);
      setPlacedImplants((prev) => (prev.includes(fdi) ? prev : [...prev, fdi]));
      setPlans((prev) => ({ ...prev, [fdi]: fixture }));
      setObjects((o) => ({ ...o, implants: true, crowns: true }));
      const driven = proposeVirtualCrown({
        fdi,
        dentition,
        missing: [...missing, fdi],
        implants: [...allImplants, fdi],
        implant: fixture,
        mode,
      });
      setCrowns((prev) => ({ ...prev, [fdi]: driven }));
      const pct = Math.round(driven.confidence * 100);
      flash(
        `AI crown + implant Ø${fixture.diameter}×${fixture.length} · crown ${driven.md}×${driven.bl} mm · ${pct}% — review`,
      );
      return driven;
    }
    const pct = Math.round(plan.confidence * 100);
    flash(
      mode === "ai"
        ? `AI crown ${plan.material.replace("_", " ")} · ${plan.md}×${plan.bl} mm · ${pct}% — review before accepting`
        : "Manual wax-up placed — adjust in the crown inspector",
    );
    return plan;
  }

  function exportPdip() {
    const payload = {
      module: "PDIP",
      patient_id: patientId ?? null,
      captured_at: new Date().toISOString(),
      implants: allImplants.map((fdi) => ({
        fdi,
        ...(plans[fdi] ?? { diameter: 4.1, length: 10, angle: 0 }),
        nerve_clearance_mm: nerveClearance(fdi, plans[fdi]?.length ?? 10),
        crown: crowns[fdi] ?? null,
      })),
      crowns: Object.values(crowns),
      note: "Indicative planning reconstruction — not a diagnostic CBCT export.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pdip-${patientId || "plan"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash("PDIP plan downloaded");
  }

  function handleSelect(fdi: string) {
    onSelect(fdi);
    if (tool === "implant") {
      placeImplant(fdi);
      onAction?.("implant", fdi, { implant: { fdi, ...(plans[fdi] ?? { diameter: 4.1, length: 10, angle: 0 }) } });
    }
    if (tool === "crown") {
      const crown = placeVirtualCrown(fdi, crownMode);
      onAction?.("auto-crown", fdi, { crown });
    }
    if (tool === "nerve") mapNerve();
  }

  function onCrosshair(plane: Plane, nx: number, ny: number) {
    if (plane === "axial") {
      setSagittal(Math.round(nx * 100));
      setCoronal(Math.round(ny * 100));
    } else if (plane === "coronal") {
      setSagittal(Math.round(nx * 100));
      setAxial(Math.round(ny * 100));
    } else {
      setCoronal(Math.round(nx * 100));
      setAxial(Math.round(ny * 100));
    }
  }

  function runAction(id: string, tooth: string) {
    if (id === "wire") setWireOn((v) => !v);
    if (id === "nerve" || id === "auto-nerve") mapNerve();
    if (id === "auto-arch") mapArches();
    if (id === "implant") placeImplant(tooth);
    if (id === "auto-crown") {
      const crown = placeVirtualCrown(tooth, "ai");
      onAction?.(id, tooth, {
        lengthMm: lastLength?.mm,
        angleDeg: lastAngle?.deg,
        implant: plans[tooth] ? { fdi: tooth, ...plans[tooth] } : undefined,
        clearanceMm: plans[tooth] ? nerveClearance(tooth, plans[tooth].length) : null,
        crown,
      });
      return;
    }
    if (id === "auto-crown-implant") {
      const crown = placeVirtualCrown(tooth, "ai", true);
      const fixture = proposeImplantFromCrown(crown);
      onAction?.(id, tooth, {
        implant: { fdi: tooth, ...fixture },
        clearanceMm: nerveClearance(tooth, fixture.length),
        crown,
      });
      return;
    }
    if (id === "crown" && !crowns[tooth]) placeVirtualCrown(tooth, crownMode);
    if (id === "canal") {
      setTool("canal");
      setPreset("transparent");
      setObjects((o) => ({ ...o, endo: true }));
      flash("Canal tool — click along the canal, double-click to finish");
    }
    if (id === "pdip") exportPdip();
    if (id === "fov0") {
      setTightFov((v) => !v);
      flash(tightFov ? "Adult FOV" : "Paediatric size-0 FOV crop");
    }
    if (id === "ceph") setTool("angle");
    onAction?.(id, tooth, {
      lengthMm: lastLength?.mm,
      angleDeg: lastAngle?.deg,
      implant: plans[tooth] ? { fdi: tooth, ...plans[tooth] } : undefined,
      clearanceMm: plans[tooth] ? nerveClearance(tooth, plans[tooth].length) : null,
      crown: crowns[tooth],
    });
  }

  const mouthLayers = {
    nerves: objects.nerves && nerveOn,
    implants: objects.implants ? allImplants : [],
    missing: objects.teeth ? missing : allFdi,
    endo: objects.endo ? [...endo, ...canals.map((c) => c.tooth)] : [],
    maxillaArch: objects.maxilla,
    mandibleArch: objects.mandible,
    canalArch: objects.canalArch && nerveOn,
    canalTeeth: canals.map((c) => c.tooth),
    implantPlans: plans,
    crowns: objects.crowns ? crowns : {},
  };

  const sliceShared = {
    implants: allImplants,
    implantPlans: plans,
    crowns: Object.values(crowns),
    showNerve: objects.nerves && nerveOn,
    showMaxilla: objects.maxilla,
    showMandible: objects.mandible,
    selected,
    tool,
    dentition,
    axial,
    coronal,
    sagittal,
    onCrosshair,
    onSelect: handleSelect,
    onLength: (a: LengthAnn) => setAnns((xs) => [...xs, a]),
    onAngle: (a: AngleAnn) => setAnns((xs) => [...xs, a]),
    onCanal: (pts: Pt[], plane: Plane) => {
      if (!selected) {
        flash("Select a tooth before finishing a canal trace");
        return;
      }
      setCanals((xs) => [...xs, { id: uid(), tooth: selected, plane, pts }]);
      setObjects((o) => ({ ...o, endo: true }));
      setPreset("transparent");
      onAction?.("canal", selected);
    },
    onWindow: (db: number, dc: number) => {
      setBrightness((b) => Math.min(180, Math.max(40, b + db)));
      setContrast((c) => Math.min(180, Math.max(40, c + dc)));
    },
    onProbe: setProbe,
    anns,
    canals,
    brightness,
    contrast,
    invert,
    slab,
    tightFov,
  };

  const mouth = (h: number, rotate = false) => (
    <Mouth3DLazy
      eager
      title="Department 3D"
      height={h}
      dentition={dentition}
      colors={colors}
      selected={selected}
      onSelect={handleSelect}
      wire={objects.wire ? effectiveWire : null}
      preset={preset}
      autoRotate={rotate}
      layers={mouthLayers}
    />
  );

  const body = (
    <section className={`space-y-3 ${darkroom ? "" : "glass-panel rounded-3xl p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
            CS 3D Imaging · {mode}
          </p>
          <h3 className="font-display text-lg font-bold text-brand-900">3D volume workspace</h3>
          <p className="text-xs text-muted">
            Linked MPR · W/L · auto arch/nerve · AI virtual crown · PDIP · canal trace
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
          <button
            type="button"
            className="rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-muted"
            onClick={() => setLayout((l) => (l === "mpr" ? "grid" : "mpr"))}
          >
            {layout === "mpr" ? "1+3" : "2×2"}
          </button>
          <button
            type="button"
            className="rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-semibold text-muted"
            onClick={() => setDarkroom((d) => !d)}
          >
            {darkroom ? "Exit darkroom" : "Darkroom"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              tool === t.id ? "bg-slate-900 text-white" : "border border-brand-100 bg-white text-muted"
            }`}
            onClick={() => {
              setTool(t.id);
              if (t.id === "nerve") mapNerve();
              if (t.id === "canal") {
                setPreset("transparent");
                flash("Click canal points on a slice, double-click to finish");
              }
              if (t.id === "crown") {
                flash(crownMode === "ai" ? "AI auto crown — click a tooth to propose" : "Manual wax-up — click a tooth");
              }
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="rounded-full border border-brand-100 bg-white px-3 py-1 text-[11px] font-semibold text-muted"
          onClick={mapArches}
        >
          Auto arch
        </button>
        <button
          type="button"
          className="rounded-full border border-brand-100 bg-white px-3 py-1 text-[11px] font-semibold text-muted"
          onClick={mapNerve}
        >
          Auto nerve
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
            crownMode === "ai" ? "bg-amber-500 text-white" : "border border-brand-100 bg-white text-muted"
          }`}
          onClick={() => {
            const next: CrownMode = crownMode === "ai" ? "manual" : "ai";
            setCrownMode(next);
            try {
              localStorage.setItem("dems.crownMode", next);
            } catch {
              /* ignore */
            }
            setTool("crown");
            flash(next === "ai" ? "AI auto crown — click a tooth" : "Manual wax-up — click a tooth");
          }}
        >
          {crownMode === "ai" ? "AI crown" : "Manual crown"}
        </button>
        {selected && (
          <button
            type="button"
            className="rounded-full bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white"
            onClick={() => {
              const crown = placeVirtualCrown(selected, crownMode, mode === "surgical" && crownMode === "ai");
              onAction?.("auto-crown", selected, { crown });
            }}
          >
            Auto crown{selected ? ` ${selected}` : ""}
          </button>
        )}
        {selected && <span className="self-center text-[11px] font-bold text-brand-900">Site {selected}</span>}
        {probe != null && (
          <span className="self-center text-[11px] font-semibold text-muted">GV {probe} (indicative)</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted">
        <label className="flex items-center gap-1">
          W
          <input type="range" min={40} max={180} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1">
          L
          <input type="range" min={40} max={180} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1">
          Slab
          <input type="range" min={1} max={8} value={slab} onChange={(e) => setSlab(Number(e.target.value))} />
          {slab}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
          Invert
        </label>
        <label className="flex items-center gap-1">
          Render
          <select
            className="input w-auto py-0 text-[11px]"
            value={preset}
            onChange={(e) => setPreset(e.target.value as RenderPreset)}
          >
            <option value="teeth">Teeth</option>
            <option value="bone">Bone</option>
            <option value="transparent">Transparent (canal)</option>
          </select>
        </label>
        <button
          type="button"
          className="text-brand-700"
          onClick={() => {
            setAnns([]);
            setCanals([]);
            setCrowns({});
            setBrightness(100);
            setContrast(110);
            setInvert(false);
            setAxial(50);
            setCoronal(48);
            setSagittal(52);
          }}
        >
          Reset
        </button>
      </div>
      {toast && <p className="text-xs font-semibold text-brand-700">{toast}</p>}

      <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
        {workspace === "orthogonal" && (
          <div className={`grid gap-3 ${layout === "mpr" ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
            <div className={layout === "mpr" ? "md:col-span-2 overflow-hidden rounded-xl bg-slate-950" : "overflow-hidden rounded-xl bg-slate-950"}>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                3D view · orbit / zoom · {preset}
              </div>
              {mouth(layout === "mpr" ? 320 : 240)}
            </div>
            <SlicePane label="Axial" slice={axial} onSlice={setAxial} plane="axial" {...sliceShared} />
            <SlicePane label="Coronal" slice={coronal} onSlice={setCoronal} plane="coronal" {...sliceShared} />
            <SlicePane label="Sagittal" slice={sagittal} onSlice={setSagittal} plane="sagittal" {...sliceShared} />
          </div>
        )}

        {workspace === "curved" && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Curved panoramic · reconstructed along mapped arch
              </div>
              <svg viewBox="0 0 460 130" className="w-full">
                <rect width="460" height="130" fill="#070b14" />
                {objects.maxilla && (
                  <path d="M28 42 Q230 6 432 42" fill="none" stroke="#ef4444" strokeWidth="3" />
                )}
                {objects.mandible && (
                  <path d="M28 88 Q230 118 432 88" fill="none" stroke="#f97316" strokeWidth="3" />
                )}
                <path d="M28 42 Q230 6 432 42" fill="none" stroke="#334155" strokeWidth="20" opacity={0.45} />
                <path d="M28 88 Q230 118 432 88" fill="none" stroke="#334155" strokeWidth="18" opacity={0.45} />
                {(objects.nerves || objects.canalArch) && nerveOn && (
                  <path d="M40 96 Q230 122 420 96" fill="none" stroke="#facc15" strokeWidth="3" />
                )}
                <line
                  x1={28 + (cross / 100) * 404}
                  y1={8}
                  x2={28 + (cross / 100) * 404}
                  y2={122}
                  stroke="#38bdf8"
                  strokeDasharray="4 3"
                />
                {fdiList(dentition).map((fdi) => {
                  const upper = dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
                  const isUpper = upper.includes(fdi);
                  const row = isUpper
                    ? upper
                    : dentition === "primary"
                      ? PRIMARY_LOWER
                      : PERMANENT_LOWER;
                  const idx = Math.max(0, row.indexOf(fdi));
                  const pt = archPoint(idx / Math.max(1, row.length - 1), 400, 28, isUpper ? "down" : "up");
                  return (
                    <g key={fdi} onClick={() => handleSelect(fdi)} style={{ cursor: "pointer" }}>
                      <rect
                        x={230 + pt.x - 7}
                        y={(isUpper ? 38 : 86) + pt.y - 11}
                        width={14}
                        height={20}
                        rx={2}
                        fill={
                          selected === fdi ? "#0b5fff" : crowns[fdi] ? "#f59e0b" : colors[fdi] || "#e2e8f0"
                        }
                      />
                      <text x={230 + pt.x} y={(isUpper ? 38 : 86) + pt.y + 18} textAnchor="middle" fontSize="7" fill="#94a3b8">
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
            <div className="grid grid-cols-5 gap-1">
              {[-2, -1, 0, 1, 2].map((off) => (
                <SlicePane
                  key={off}
                  label={`CS ${off > 0 ? "+" : ""}${off}`}
                  slice={Math.min(100, Math.max(0, cross + off * 8))}
                  onSlice={setCross}
                  plane="coronal"
                  {...sliceShared}
                />
              ))}
            </div>
            {mouth(240)}
          </div>
        )}

        {workspace === "oblique" && (
          <div className="grid gap-3 md:grid-cols-2">
            <SlicePane
              label={`Oblique sagittal (${oblique}°)`}
              slice={sagittal}
              onSlice={setSagittal}
              plane="sagittal"
              {...sliceShared}
            />
            <div className="overflow-hidden rounded-xl bg-slate-950">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                3D · rotate around site
              </div>
              {mouth(260, true)}
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
              if (key === "nerves" || key === "canalArch") setNerveOn((v) => !v);
              if (key === "maxilla" || key === "mandible") setArchMapped(true);
            }}
          />

          {allImplants.length > 0 && (
            <div className="rounded-2xl border border-brand-100 bg-white/80 p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                PDIP · implant {selected ?? allImplants[0]}
              </p>
              {(() => {
                const fdi = selected && allImplants.includes(selected) ? selected : allImplants[0];
                const plan = plans[fdi] ?? { diameter: 4.1, length: 10, angle: 0 };
                const clr = nerveClearance(fdi, plan.length);
                return (
                  <div className="space-y-2 text-xs">
                    <label className="block font-semibold">
                      Ø mm
                      <select
                        className="input mt-0.5"
                        value={plan.diameter}
                        onChange={(e) =>
                          setPlans((prev) => ({ ...prev, [fdi]: { ...plan, diameter: Number(e.target.value) } }))
                        }
                      >
                        {DIAMETERS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block font-semibold">
                      Length mm
                      <select
                        className="input mt-0.5"
                        value={plan.length}
                        onChange={(e) =>
                          setPlans((prev) => ({ ...prev, [fdi]: { ...plan, length: Number(e.target.value) } }))
                        }
                      >
                        {LENGTHS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block font-semibold">
                      Angulation {plan.angle}°
                      <input
                        type="range"
                        min={-25}
                        max={25}
                        value={plan.angle}
                        onChange={(e) =>
                          setPlans((prev) => ({ ...prev, [fdi]: { ...plan, angle: Number(e.target.value) } }))
                        }
                        className="w-full"
                      />
                    </label>
                    {clr != null && (
                      <p className={`font-semibold ${clr < 2 ? "text-red-600" : "text-brand-800"}`}>
                        IAN clearance {clr} mm {clr < 2 ? "· too close" : ""}
                      </p>
                    )}
                    <button type="button" className="btn-primary w-full text-[11px]" onClick={exportPdip}>
                      Export PDIP
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {selected && crowns[selected] && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                Virtual crown · {selected}
              </p>
              <p className="mb-2 text-[11px] font-semibold text-brand-900">{crownSummary(crowns[selected])}</p>
              <div className="space-y-2 text-xs">
                <label className="block font-semibold">
                  Material
                  <select
                    className="input mt-0.5"
                    value={crowns[selected].material}
                    onChange={(e) =>
                      setCrowns((prev) => ({
                        ...prev,
                        [selected]: { ...prev[selected], material: e.target.value as CrownMaterial },
                      }))
                    }
                  >
                    <option value="zirconia">Zirconia</option>
                    <option value="lithium_disilicate">Lithium disilicate</option>
                    <option value="pfm">PFM</option>
                    <option value="ssc">SSC</option>
                    <option value="waxup">Diagnostic wax-up</option>
                  </select>
                </label>
                <label className="block font-semibold">
                  MD {crowns[selected].md} mm
                  <input
                    type="range"
                    min={4}
                    max={12}
                    step={0.1}
                    value={crowns[selected].md}
                    onChange={(e) =>
                      setCrowns((prev) => ({
                        ...prev,
                        [selected]: { ...prev[selected], md: Number(e.target.value) },
                      }))
                    }
                    className="w-full"
                  />
                </label>
                <label className="block font-semibold">
                  BL {crowns[selected].bl} mm
                  <input
                    type="range"
                    min={4}
                    max={12}
                    step={0.1}
                    value={crowns[selected].bl}
                    onChange={(e) =>
                      setCrowns((prev) => ({
                        ...prev,
                        [selected]: { ...prev[selected], bl: Number(e.target.value) },
                      }))
                    }
                    className="w-full"
                  />
                </label>
                <label className="block font-semibold">
                  Height {crowns[selected].height} mm
                  <input
                    type="range"
                    min={4}
                    max={12}
                    step={0.1}
                    value={crowns[selected].height}
                    onChange={(e) =>
                      setCrowns((prev) => ({
                        ...prev,
                        [selected]: { ...prev[selected], height: Number(e.target.value) },
                      }))
                    }
                    className="w-full"
                  />
                </label>
                <label className="block font-semibold">
                  Rotation {crowns[selected].rotation}°
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    value={crowns[selected].rotation}
                    onChange={(e) =>
                      setCrowns((prev) => ({
                        ...prev,
                        [selected]: { ...prev[selected], rotation: Number(e.target.value) },
                      }))
                    }
                    className="w-full"
                  />
                </label>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={crowns[selected].extract}
                    onChange={(e) =>
                      setCrowns((prev) => ({
                        ...prev,
                        [selected]: { ...prev[selected], extract: e.target.checked },
                      }))
                    }
                  />
                  Virtual extraction
                </label>
                <ul className="space-y-0.5 font-normal text-muted">
                  {crowns[selected].reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-red-700"
                  onClick={() =>
                    setCrowns((prev) => {
                      const next = { ...prev };
                      delete next[selected];
                      return next;
                    })
                  }
                >
                  Remove crown
                </button>
              </div>
            </div>
          )}

          {anns.length > 0 && (
            <div className="rounded-2xl border border-brand-100 bg-white/80 p-3 text-xs">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">Measurements</p>
              <ul className="space-y-1">
                {anns.map((a) => (
                  <li key={a.id}>
                    {a.kind === "length" ? `${a.mm} mm` : `${a.deg}°`} · {a.plane}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                    onClick={() => runAction(a.id, selected)}
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-muted">
        <span>
          FOV {tightFov ? "Ø5 cm · size 0 analog" : "Ø8 cm"} · voxel recon · WL {brightness}/{contrast} · slab {slab}
          {clearance != null ? ` · IAN ${clearance} mm` : ""}
        </span>
        <span>Measurements are indicative — not diagnostic without a calibrated CBCT volume.</span>
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

  if (darkroom) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-slate-950 p-4 text-slate-100">
        <div className="[&_.text-brand-900]:text-white [&_.text-muted]:text-slate-400">{body}</div>
      </div>
    );
  }
  return body;
}

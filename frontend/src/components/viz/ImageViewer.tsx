/**
 * CS Imaging 8 analog: 2D review with windowing, drawings, indicative
 * measurements, tooth tags, and Darkroom (full-screen uncluttered) mode.
 * Measurements are relative/indicative — not diagnostic without calibration.
 */

import {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useRef,
  useState,
} from "react";

type Tool = "pan" | "length" | "angle" | "arrow" | "circle" | "tag";

type Ann =
  | { id: string; kind: "length"; a: Pt; b: Pt }
  | { id: string; kind: "angle"; a: Pt; b: Pt; c: Pt }
  | { id: string; kind: "arrow"; a: Pt; b: Pt }
  | { id: string; kind: "circle"; a: Pt; r: number }
  | { id: string; kind: "tag"; a: Pt; text: string };

type Pt = { x: number; y: number };

type ViewState = {
  zoom: number;
  x: number;
  y: number;
  brightness: number;
  contrast: number;
  invert: boolean;
  rotate: number;
};

const INITIAL: ViewState = { zoom: 1, x: 0, y: 0, brightness: 100, contrast: 100, invert: false, rotate: 0 };

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleDeg(a: Pt, b: Pt, c: Pt) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const den = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (!den) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, (v1.x * v2.x + v1.y * v2.y) / den))) * 180) / Math.PI;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] font-semibold text-muted">
      {label}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-24" />
      <span className="w-8 tabular-nums">{value}</span>
    </label>
  );
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: "pan", label: "Pan" },
  { id: "length", label: "Length" },
  { id: "angle", label: "Angle" },
  { id: "arrow", label: "Arrow" },
  { id: "circle", label: "Circle" },
  { id: "tag", label: "Tooth #" },
];

export function ImageViewer({
  src,
  alt,
  height = 460,
  toothHint,
  darkroomable = true,
}: {
  src: string;
  alt: string;
  height?: number;
  toothHint?: string | null;
  darkroomable?: boolean;
}) {
  const [view, setView] = useState<ViewState>(INITIAL);
  const [tool, setTool] = useState<Tool>("pan");
  const [anns, setAnns] = useState<Ann[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [darkroom, setDarkroom] = useState(false);
  const [showDrawings, setShowDrawings] = useState(true);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const localPt = useCallback((e: ReactPointerEvent) => {
    const el = stageRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * 100,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * 100,
    };
  }, []);

  function onWheel(e: ReactWheelEvent) {
    e.preventDefault();
    setView((v) => ({ ...v, zoom: Math.min(8, Math.max(0.4, v.zoom * (e.deltaY < 0 ? 1.12 : 0.9))) }));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (tool === "pan") {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: view.x, baseY: view.y };
      return;
    }
    const p = localPt(e);
    if (tool === "tag") {
      const text = window.prompt("Tooth number (FDI)", toothHint || "") || "";
      if (text) setAnns((a) => [...a, { id: uid(), kind: "tag", a: p, text }]);
      return;
    }
    const next = [...draft, p];
    if (tool === "length" || tool === "arrow") {
      if (next.length === 2) {
        setAnns((a) => [...a, { id: uid(), kind: tool, a: next[0], b: next[1] }]);
        setDraft([]);
      } else setDraft(next);
    } else if (tool === "circle") {
      if (next.length === 2) {
        setAnns((a) => [...a, { id: uid(), kind: "circle", a: next[0], r: dist(next[0], next[1]) }]);
        setDraft([]);
      } else setDraft(next);
    } else if (tool === "angle") {
      if (next.length === 3) {
        setAnns((a) => [...a, { id: uid(), kind: "angle", a: next[0], b: next[1], c: next[2] }]);
        setDraft([]);
      } else setDraft(next);
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) }));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const frame = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                tool === t.id ? "bg-brand-500 text-white" : "border border-brand-100 bg-white text-muted"
              }`}
              onClick={() => {
                setTool(t.id);
                setDraft([]);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Slider label="Zoom" value={Math.round(view.zoom * 100)} min={40} max={800}
          onChange={(v) => setView((s) => ({ ...s, zoom: v / 100 }))} />
        <Slider label="Brightness" value={view.brightness} min={20} max={220}
          onChange={(v) => setView((s) => ({ ...s, brightness: v }))} />
        <Slider label="Contrast" value={view.contrast} min={20} max={260}
          onChange={(v) => setView((s) => ({ ...s, contrast: v }))} />
        <button type="button" className={`btn-ghost text-xs ${view.invert ? "bg-brand-100" : ""}`}
          onClick={() => setView((s) => ({ ...s, invert: !s.invert }))}>Invert</button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setView((s) => ({ ...s, rotate: (s.rotate + 90) % 360 }))}>
          Rotate 90°
        </button>
        <button type="button" className={`btn-ghost text-xs ${showDrawings ? "bg-brand-100" : ""}`}
          onClick={() => setShowDrawings((v) => !v)}>Drawings</button>
        <button type="button" className="btn-ghost text-xs" onClick={() => { setAnns([]); setDraft([]); }}>
          Clear marks
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={() => setView(INITIAL)}>Reset</button>
        {darkroomable && (
          <button type="button" className="btn-ghost text-xs" onClick={() => setDarkroom((d) => !d)}>
            {darkroom ? "Exit darkroom" : "Darkroom"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted">
        Indicative measurements only · {tool === "length" ? "click two points" : tool === "angle" ? "click vertex last (3 points)" : tool === "pan" ? "drag to pan · wheel to zoom" : "click to place"}
      </p>
      <div
        className="touch-none select-none overflow-hidden rounded-2xl bg-black/90"
        style={{ height: darkroom ? "calc(100vh - 140px)" : height, cursor: tool === "pan" ? "grab" : "crosshair" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          ref={stageRef}
          className="relative h-full w-full"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom}) rotate(${view.rotate}deg)`,
            transformOrigin: "center center",
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="h-full w-full object-contain"
            style={{
              filter: `brightness(${view.brightness}%) contrast(${view.contrast}%) ${view.invert ? "invert(1)" : ""}`,
            }}
          />
          {showDrawings && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
              {anns.map((a) => (
                <Annotation key={a.id} a={a} />
              ))}
              {draft.length > 0 && (
                <circle cx={draft[0].x} cy={draft[0].y} r={0.8} fill="#22d3ee" />
              )}
            </svg>
          )}
        </div>
      </div>
    </div>
  );

  if (darkroom) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black p-4">
        <div className="mb-2 flex items-center justify-between text-white">
          <p className="text-sm font-semibold">{alt} · Darkroom</p>
          <button type="button" className="btn-ghost text-xs text-white" onClick={() => setDarkroom(false)}>
            Exit
          </button>
        </div>
        {frame}
      </div>
    );
  }

  return frame;
}

function Annotation({ a }: { a: Ann }) {
  if (a.kind === "length") {
    const mid = { x: (a.a.x + a.b.x) / 2, y: (a.a.y + a.b.y) / 2 };
    return (
      <g>
        <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke="#22d3ee" strokeWidth={0.6} />
        <circle cx={a.a.x} cy={a.a.y} r={0.7} fill="#22d3ee" />
        <circle cx={a.b.x} cy={a.b.y} r={0.7} fill="#22d3ee" />
        <text x={mid.x} y={mid.y - 1.2} fontSize={3} fill="#22d3ee" textAnchor="middle">
          {dist(a.a, a.b).toFixed(1)} u
        </text>
      </g>
    );
  }
  if (a.kind === "arrow") {
    return (
      <g>
        <defs>
          <marker id={`arr-${a.id}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#fbbf24" />
          </marker>
        </defs>
        <line x1={a.a.x} y1={a.a.y} x2={a.b.x} y2={a.b.y} stroke="#fbbf24" strokeWidth={0.7} markerEnd={`url(#arr-${a.id})`} />
      </g>
    );
  }
  if (a.kind === "circle") {
    return <circle cx={a.a.x} cy={a.a.y} r={a.r} fill="none" stroke="#34d399" strokeWidth={0.6} />;
  }
  if (a.kind === "angle") {
    return (
      <g>
        <polyline points={`${a.a.x},${a.a.y} ${a.b.x},${a.b.y} ${a.c.x},${a.c.y}`} fill="none" stroke="#fb7185" strokeWidth={0.6} />
        <text x={a.b.x + 1.5} y={a.b.y - 1} fontSize={3} fill="#fb7185">
          {angleDeg(a.a, a.b, a.c).toFixed(0)}°
        </text>
      </g>
    );
  }
  return (
    <g>
      <circle cx={a.a.x} cy={a.a.y} r={1.6} fill="#0b5fff" />
      <text x={a.a.x} y={a.a.y + 0.6} fontSize={2.2} fill="#fff" textAnchor="middle" fontWeight={700}>
        {a.text}
      </text>
    </g>
  );
}

export function CompareViewer({
  left,
  right,
  leftLabel,
  rightLabel,
  height = 420,
}: {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  height?: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { src: left, label: leftLabel },
        { src: right, label: rightLabel },
      ].map((side, i) => (
        <div key={i} className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{side.label}</p>
          <ImageViewer src={side.src} alt={side.label} height={height} darkroomable={false} />
        </div>
      ))}
    </div>
  );
}

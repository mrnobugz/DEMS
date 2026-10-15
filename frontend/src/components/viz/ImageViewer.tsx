/**
 * 2D review with windowing, drawings, indicative measurements, tooth tags,
 * and darkroom mode. Measurements are relative — not diagnostic without calibration.
 */

import {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useId,
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

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label} <span className="font-normal text-muted">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer"
      />
    </div>
  );
}

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "pan", label: "Pan", hint: "Drag to pan. Arrow keys pan when the image is focused. Plus and minus zoom." },
  { id: "length", label: "Length", hint: "Click two points. The length is indicative, not a calibrated measurement." },
  { id: "angle", label: "Angle", hint: "Click three points. The vertex is the second point." },
  { id: "arrow", label: "Arrow", hint: "Click the start, then the tip." },
  { id: "circle", label: "Circle", hint: "Click the center, then a point on the edge." },
  { id: "tag", label: "Tooth tag", hint: "Enter an FDI number, then click the image to place it." },
];

export function ImageViewer({
  src,
  alt,
  height = 460,
  toothHint,
  darkroomable = true,
  onAnnotationCount,
}: {
  src: string;
  alt: string;
  height?: number;
  toothHint?: string | null;
  darkroomable?: boolean;
  onAnnotationCount?: (count: number) => void;
}) {
  const [view, setView] = useState<ViewState>(INITIAL);
  const [tool, setTool] = useState<Tool>("pan");
  const [anns, setAnns] = useState<Ann[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [darkroom, setDarkroom] = useState(false);
  const [showDrawings, setShowDrawings] = useState(true);
  const [tagText, setTagText] = useState(toothHint || "");
  const [tagError, setTagError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const darkroomRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const keepMarksRef = useRef<HTMLButtonElement | null>(null);
  const countRef = useRef(onAnnotationCount);
  const baseId = useId();
  const tagErrorId = `${baseId}-tag-error`;
  const tagFieldId = `${baseId}-tag`;
  const darkroomTitleId = `${baseId}-darkroom-title`;
  countRef.current = onAnnotationCount;

  useEffect(() => {
    countRef.current?.(anns.length);
  }, [anns.length]);

  useEffect(() => {
    if (toothHint) setTagText(toothHint);
  }, [toothHint]);

  useEffect(() => {
    if (!confirmClear) return;
    keepMarksRef.current?.focus();
  }, [confirmClear]);

  useEffect(() => {
    if (!darkroom) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const root = darkroomRef.current;
    const stops = () =>
      Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    stops()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDarkroom(false);
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = stops();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    }

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      restoreFocus.current?.focus?.();
    };
  }, [darkroom]);

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
      const text = tagText.trim();
      if (!text) {
        setTagError("Enter an FDI tooth number, then click the image to place the tag.");
        return;
      }
      setTagError("");
      setAnns((a) => [...a, { id: uid(), kind: "tag", a: p, text }]);
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

  function onStageKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = 24;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setView((v) => ({ ...v, x: v.x - step }));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setView((v) => ({ ...v, x: v.x + step }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setView((v) => ({ ...v, y: v.y - step }));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setView((v) => ({ ...v, y: v.y + step }));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setView((v) => ({ ...v, zoom: Math.min(8, v.zoom * 1.12) }));
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setView((v) => ({ ...v, zoom: Math.max(0.4, v.zoom * 0.9) }));
    }
  }

  function onToolKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const ids = TOOLS.map((t) => t.id);
    const i = ids.indexOf(tool);
    if (i < 0) return;
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = ids.length - 1;
    else return;
    e.preventDefault();
    const next = ids[n]!;
    setTool(next);
    setDraft([]);
    setTagError("");
    queueMicrotask(() => document.getElementById(`${baseId}-tool-${next}`)?.focus());
  }

  function clearMarks() {
    setAnns([]);
    setDraft([]);
    setConfirmClear(false);
  }

  const toolHint = TOOLS.find((t) => t.id === tool)?.hint ?? "";
  const marksExist = anns.length > 0 || draft.length > 0;

  const viewer = (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label="Review tool"
        className="flex flex-wrap gap-2"
        onKeyDown={onToolKeyDown}
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            id={`${baseId}-tool-${t.id}`}
            type="button"
            role="radio"
            aria-checked={tool === t.id}
            tabIndex={tool === t.id ? 0 : -1}
            className={`admin-chip min-w-[44px] ${tool === t.id ? "admin-chip--on" : ""}`}
            onClick={() => {
              setTool(t.id);
              setDraft([]);
              setTagError("");
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted">{toolHint} Measurements on this image are indicative only.</p>
      {tool === "tag" && (
        <div className="max-w-xs">
          <label htmlFor={tagFieldId} className="text-sm">
            <span className="label">Tooth number (FDI)</span>
            <input
              id={tagFieldId}
              className="input"
              value={tagText}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={tagError ? true : undefined}
              aria-describedby={tagError ? tagErrorId : undefined}
              onChange={(e) => {
                setTagText(e.target.value);
                if (tagError) setTagError("");
              }}
            />
          </label>
          {tagError && (
            <p id={tagErrorId} className="mt-2 text-sm text-danger" role="alert">
              {tagError}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider
          label="Zoom"
          value={Math.round(view.zoom * 100)}
          min={40}
          max={800}
          onChange={(v) => setView((s) => ({ ...s, zoom: v / 100 }))}
        />
        <Slider
          label="Brightness"
          value={view.brightness}
          min={20}
          max={220}
          onChange={(v) => setView((s) => ({ ...s, brightness: v }))}
        />
        <Slider
          label="Contrast"
          value={view.contrast}
          min={20}
          max={260}
          onChange={(v) => setView((s) => ({ ...s, contrast: v }))}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost"
          aria-pressed={view.invert}
          onClick={() => setView((s) => ({ ...s, invert: !s.invert }))}
        >
          {view.invert ? "Invert on" : "Invert"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setView((s) => ({ ...s, rotate: (s.rotate + 90) % 360 }))}
        >
          Rotate 90°
        </button>
        <button
          type="button"
          className="btn-ghost"
          aria-pressed={showDrawings}
          onClick={() => setShowDrawings((v) => !v)}
        >
          {showDrawings ? "Drawings shown" : "Drawings hidden"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setView(INITIAL)}>
          Reset view
        </button>
        {!confirmClear && (
          <button
            type="button"
            className="btn-ghost"
            disabled={!marksExist}
            onClick={() => setConfirmClear(true)}
          >
            Clear marks
          </button>
        )}
        {darkroomable && (
          <button type="button" className="btn-ghost" onClick={() => setDarkroom((d) => !d)}>
            {darkroom ? "Exit darkroom" : "Darkroom"}
          </button>
        )}
      </div>
      {confirmClear && (
        <div
          role="group"
          aria-label="Confirm clear marks"
          className="rounded-2xl border border-brand-100 bg-canvas p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setConfirmClear(false);
            }
          }}
        >
          <p className="text-sm text-ink">
            Clear all marks on this image? Lengths, angles, arrows, and tooth tags leave this screen. They are not
            saved on the study.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={keepMarksRef} type="button" className="btn-primary" onClick={() => setConfirmClear(false)}>
              Keep marks
            </button>
            <button type="button" className="btn-ghost text-danger" onClick={clearMarks}>
              Clear all marks
            </button>
          </div>
        </div>
      )}
      <div
        className="touch-none select-none overflow-hidden rounded-2xl bg-black/90"
        style={{ height: darkroom ? "min(70vh, 640px)" : height, cursor: tool === "pan" ? "grab" : "crosshair" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          ref={stageRef}
          tabIndex={0}
          aria-label={`${alt}. Arrow keys pan. Plus and minus zoom.`}
          className="relative h-full w-full"
          onKeyDown={onStageKeyDown}
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
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {anns.map((a) => (
                <Annotation key={a.id} a={a} />
              ))}
              {draft.length > 0 && <circle cx={draft[0].x} cy={draft[0].y} r={0.8} fill="#22d3ee" />}
            </svg>
          )}
        </div>
      </div>
    </div>
  );

  if (!darkroom) return viewer;

  return (
    <div
      ref={darkroomRef}
      className="fixed inset-0 z-50 flex flex-col gap-4 overflow-auto bg-black p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={darkroomTitleId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={darkroomTitleId} className="text-sm font-semibold text-white">
          Darkroom · {alt}
        </h2>
        <button type="button" className="btn-ghost" onClick={() => setDarkroom(false)}>
          Exit darkroom
        </button>
      </div>
      {viewer}
    </div>
  );
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
        <line
          x1={a.a.x}
          y1={a.a.y}
          x2={a.b.x}
          y2={a.b.y}
          stroke="#fbbf24"
          strokeWidth={0.7}
          markerEnd={`url(#arr-${a.id})`}
        />
      </g>
    );
  }
  if (a.kind === "circle") {
    return <circle cx={a.a.x} cy={a.a.y} r={a.r} fill="none" stroke="#34d399" strokeWidth={0.6} />;
  }
  if (a.kind === "angle") {
    return (
      <g>
        <polyline
          points={`${a.a.x},${a.a.y} ${a.b.x},${a.b.y} ${a.c.x},${a.c.y}`}
          fill="none"
          stroke="#fb7185"
          strokeWidth={0.6}
        />
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
  onAnnotationCount,
}: {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
  height?: number;
  onAnnotationCount?: (count: number) => void;
}) {
  const counts = useRef([0, 0]);
  const reportRef = useRef(onAnnotationCount);
  reportRef.current = onAnnotationCount;

  const report = useCallback((index: number, n: number) => {
    counts.current[index] = n;
    reportRef.current?.((counts.current[0] ?? 0) + (counts.current[1] ?? 0));
  }, []);

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {[
        { src: left, label: leftLabel },
        { src: right, label: rightLabel },
      ].map((side, i) => (
        <div key={`${i}-${side.label}`} className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold text-ink">{side.label}</h3>
          <ImageViewer
            src={side.src}
            alt={side.label}
            height={height}
            darkroomable={false}
            onAnnotationCount={(n) => report(i, n)}
          />
        </div>
      ))}
    </div>
  );
}

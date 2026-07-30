import { useMemo, useState } from "react";
import type { ChartEntry } from "@/lib/types";

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

const CONDITIONS = [
  { code: "sound", label: "Sound", color: "#ffffff" },
  { code: "caries", label: "Caries", color: "#ef4444" },
  { code: "filling", label: "Filling", color: "#3b82f6" },
  { code: "crown", label: "Crown", color: "#f59e0b" },
  { code: "missing", label: "Missing", color: "#94a3b8" },
  { code: "rct", label: "RCT", color: "#8b5cf6" },
  { code: "planned", label: "Planned", color: "#0ea5e9" },
];

const STATUS_COLORS: Record<string, string> = {
  planned: "#0ea5e9",
  in_progress: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
  replaced: "#a855f7",
  recorded: "#3b82f6",
};

const SURFACES = ["M", "O", "D", "B", "L", "F", "I", "P"] as const;

export type OdontogramMark = {
  tooth: string;
  condition_code: string;
  condition_label: string;
  entry_kind: string;
  surfaces: string;
};

type Props = {
  entries: ChartEntry[];
  selected?: string | null;
  onSelect?: (tooth: string) => void;
  onMark?: (mark: OdontogramMark) => void;
  /** Prefer restoration status colors when present on chart entry.status */
  colorByStatus?: boolean;
};

export function Odontogram({ entries, selected, onSelect, onMark, colorByStatus = true }: Props) {
  const [tool, setTool] = useState(CONDITIONS[1]);
  const [surfaces, setSurfaces] = useState<string[]>(["O"]);

  const byTooth = useMemo(() => {
    const map = new Map<string, ChartEntry>();
    for (const e of entries) {
      const prev = map.get(e.tooth_number);
      if (!prev || new Date(e.created_at) > new Date(prev.created_at)) {
        map.set(e.tooth_number, e);
      }
    }
    return map;
  }, [entries]);

  function colorFor(tooth: string) {
    const e = byTooth.get(tooth);
    if (!e) return "#fff";
    if (colorByStatus && e.status && STATUS_COLORS[e.status]) {
      return STATUS_COLORS[e.status];
    }
    const found = CONDITIONS.find((c) => c.code === e.condition_code);
    return found?.color ?? (e.entry_kind === "planned" ? "#0ea5e9" : "#bfdbfe");
  }

  function toggleSurface(s: string) {
    setSurfaces((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function Tooth({ n }: { n: string }) {
    const active = selected === n;
    const entry = byTooth.get(n);
    return (
      <button
        type="button"
        title={`Tooth ${n}${entry?.surfaces ? ` · ${entry.surfaces}` : ""}`}
        onClick={() => {
          onSelect?.(n);
          if (onMark) {
            onMark({
              tooth: n,
              condition_code: tool.code,
              condition_label: tool.label,
              entry_kind: tool.code === "planned" ? "planned" : "existing",
              surfaces: surfaces.join(""),
            });
          }
        }}
        className={`odontogram-tooth flex h-11 w-8 flex-col items-center justify-center rounded-lg border text-[10px] font-bold transition ${
          active ? "border-brand-500 ring-2 ring-brand-300" : "border-brand-200"
        }`}
        style={{ background: colorFor(n), color: "#0a1628" }}
      >
        <span className="opacity-80">{n}</span>
        <span className="mt-0.5 text-[8px] font-semibold opacity-70">
          {entry?.surfaces || "·"}
        </span>
      </button>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-brand-900">Interactive Odontogram</h3>
          <p className="text-sm text-muted">
            FDI · surface-true charting · color by status when available
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => setTool(c)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                tool.code === c.code ? "bg-brand-500 text-white" : "bg-white text-muted border border-brand-100"
              }`}
            >
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-black/10"
                style={{ background: c.color }}
              />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-muted">Surfaces</span>
        {SURFACES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSurface(s)}
            className={`h-8 w-8 rounded-lg text-xs font-bold ${
              surfaces.includes(s)
                ? "bg-brand-500 text-white"
                : "border border-brand-200 bg-white text-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-3 overflow-x-auto">
        <div className="flex min-w-max justify-center gap-1">{UPPER.map((n) => <Tooth key={n} n={n} />)}</div>
        <div className="mx-auto h-px max-w-3xl bg-gradient-to-r from-transparent via-brand-300 to-transparent" />
        <div className="flex min-w-max justify-center gap-1">{LOWER.map((n) => <Tooth key={n} n={n} />)}</div>
      </div>
    </div>
  );
}

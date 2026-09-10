/**
 * Interactive odontogram — pick a procedure, click a tooth (and surfaces
 * when required). Anatomical 2D arch with type-specific glyphs and
 * per-surface marks.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChartEntry } from "@/lib/types";
import { ArchChart, type ArchToothMark } from "@/components/viz/ArchChart";
import { ToothSurfaceDiagram } from "@/components/viz/ToothSurfaceDiagram";
import { CHART_TOOLS, TOOTH_ACTIONS, type ChartTool } from "@/components/viz/chartActions";
import { TOOTH_STATUS_COLORS, isPosterior, type Dentition } from "@/components/viz/teeth";

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
  colorByStatus?: boolean;
  dentition?: Dentition;
  patientId?: string;
};

const TOOL_GROUPS: { title: string; ids: string[] }[] = [
  { title: "Chart", ids: ["select"] },
  { title: "Find", ids: ["caries", "missing"] },
  { title: "Treat", ids: ["filling", "crown", "rct", "sealant"] },
  { title: "Plan", ids: ["planned", "implant", "extract", "ortho"] },
];

function conditionColor(entry: ChartEntry, colorByStatus: boolean): string {
  return (
    (colorByStatus && entry.status && TOOTH_STATUS_COLORS[entry.status]) ||
    TOOTH_STATUS_COLORS[entry.condition_code] ||
    (entry.entry_kind === "planned" ? TOOTH_STATUS_COLORS.planned : "#93c5fd")
  );
}

export function Odontogram({
  entries,
  selected,
  onSelect,
  onMark,
  colorByStatus = true,
  dentition: dentitionProp = "permanent",
  patientId,
}: Props) {
  const navigate = useNavigate();
  const [tool, setTool] = useState<ChartTool>(CHART_TOOLS[0]);
  const [surfaces, setSurfaces] = useState<string[]>(["O"]);
  const [sheet, setSheet] = useState<string | null>(null);
  const [mode, setMode] = useState<Dentition>(dentitionProp);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hint, setHint] = useState("");

  useEffect(() => {
    setMode(dentitionProp);
  }, [dentitionProp]);

  useEffect(() => {
    if (!selected) return;
    const center = isPosterior(selected) ? "O" : "I";
    setSurfaces((prev) => {
      const next = prev.map((s) => (s === "O" || s === "I" ? center : s));
      return next.join("") === prev.join("") ? prev : next;
    });
  }, [selected]);

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

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.tooth_number, (map.get(e.tooth_number) || 0) + 1);
    }
    return map;
  }, [entries]);

  const marks = useMemo(() => {
    const map: Record<string, ArchToothMark> = {};
    for (const [tooth, e] of byTooth) {
      const n = counts.get(tooth) || 1;
      map[tooth] = {
        fill: conditionColor(e, colorByStatus),
        surfaces: e.surfaces || "",
        missing: e.condition_code === "missing" || e.condition_code === "extraction",
        planned: e.entry_kind === "planned" || e.status === "planned",
        crown: e.condition_code === "crown" || e.condition_code === "stainless_steel_crown",
        rct: e.condition_code === "rct" || e.condition_code === "pulpotomy" || e.condition_code === "pulpectomy",
        badge: e.surfaces || (n > 1 ? `×${n}` : undefined),
      };
    }
    return map;
  }, [byTooth, counts, colorByStatus]);

  const selectedEntry = selected ? byTooth.get(selected) : undefined;
  const hoverEntry = hovered ? byTooth.get(hovered) : undefined;
  const focusTooth = hovered || selected || null;
  const focusEntry = hoverEntry || selectedEntry;

  function apply(tooth: string) {
    onSelect?.(tooth);
    setHint("");
    if (tool.id === "select") {
      const existing = byTooth.get(tooth);
      if (existing?.surfaces) {
        setSurfaces([...existing.surfaces.toUpperCase()]);
      }
      setSheet(tooth);
      return;
    }
    if (tool.needsSurface && surfaces.length === 0) {
      setHint("Select surfaces on the 5-zone diagram, then click the tooth.");
      return;
    }
    onMark?.({
      tooth,
      condition_code: tool.condition_code,
      condition_label: tool.condition_label,
      entry_kind: tool.entry_kind,
      surfaces: tool.needsSurface ? surfaces.join("") : "",
    });
  }

  return (
    <div className="glass-panel odontogram">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Odontogram</h3>
          <p className="text-xs text-muted">
            {tool.id === "select"
              ? "Select a tooth for history and department actions"
              : `Armed: ${tool.label}${tool.needsSurface ? ` · ${surfaces.join("") || "pick surfaces"}` : ""} — click a tooth`}
          </p>
        </div>
        <div className="flex rounded-full border border-brand-100 bg-white p-0.5 text-xs font-semibold">
          {(["permanent", "primary"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`rounded-full px-3 py-1 capitalize ${
                mode === d ? "bg-brand-500 text-white" : "text-muted"
              }`}
              onClick={() => setMode(d)}
            >
              {d === "permanent" ? "Adult FDI" : "Primary"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 space-y-1.5">
        {TOOL_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-wrap items-center gap-1.5">
            <span className="w-10 text-[10px] font-bold uppercase tracking-wide text-muted">
              {group.title}
            </span>
            {CHART_TOOLS.filter((c) => group.ids.includes(c.id)).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setTool(c);
                  setHint("");
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  tool.id === c.id ? "bg-brand-500 text-white" : "border border-brand-100 bg-white text-muted"
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
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_168px]">
        <ArchChart
          dentition={mode}
          marks={marks}
          selected={selected}
          onSelect={apply}
          onHover={setHovered}
          height={400}
        />
        <div className="flex flex-col items-center gap-3">
          <ToothSurfaceDiagram
            fdi={selected}
            value={surfaces}
            onChange={setSurfaces}
            size={148}
          />
          <p className="text-center text-[10px] text-muted">
            {tool.needsSurface
              ? "Click MODBL zones, then the tooth"
              : "Whole-tooth procedure — surfaces optional"}
          </p>
          {focusTooth && (
            <div className="w-full rounded-xl border border-brand-100 bg-white px-3 py-2 text-xs">
              <p className="font-bold text-brand-900">Tooth {focusTooth}</p>
              {focusEntry ? (
                <>
                  <p className="text-brand-800">
                    {focusEntry.condition_label}
                    {focusEntry.surfaces ? ` · ${focusEntry.surfaces}` : ""}
                  </p>
                  <p className="capitalize text-muted">
                    {focusEntry.entry_kind} · {focusEntry.status.replaceAll("_", " ")}
                    {(counts.get(focusTooth) || 1) > 1
                      ? ` · ${counts.get(focusTooth)} findings`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="text-muted">No chart finding yet</p>
              )}
            </div>
          )}
        </div>
      </div>

      {hint && <p className="mt-2 text-xs font-semibold text-amber-700">{hint}</p>}

      <div className="odontogram-legend mt-3">
        <span className="odontogram-legend__item">
          <span className="odontogram-legend__swatch" style={{ background: "#ef4444" }} />
          Caries
        </span>
        <span className="odontogram-legend__item">
          <span className="odontogram-legend__swatch" style={{ background: "#3b82f6" }} />
          Filling
        </span>
        <span className="odontogram-legend__item">
          <span className="odontogram-legend__swatch" style={{ background: "#f59e0b" }} />
          Crown
        </span>
        <span className="odontogram-legend__item">
          <span className="odontogram-legend__swatch" style={{ background: "#8b5cf6" }} />
          RCT
        </span>
        <span className="odontogram-legend__item">
          <span className="odontogram-legend__swatch odontogram-legend__swatch--x" />
          Missing
        </span>
        <span className="odontogram-legend__item">
          <span className="odontogram-legend__swatch odontogram-legend__swatch--dash" />
          Planned
        </span>
      </div>

      {sheet && (
        <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-bold text-brand-900">Tooth {sheet} — actions</h4>
            <button type="button" className="btn-ghost text-xs" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TOOTH_ACTIONS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="rounded-xl bg-white px-3 py-2 text-left text-xs shadow-sm hover:bg-brand-50"
                onClick={() => {
                  if (patientId) navigate(a.href(patientId, sheet));
                  setSheet(null);
                }}
                disabled={!patientId && a.id !== "imaging"}
              >
                <div className="font-semibold text-brand-900">{a.label}</div>
                <div className="text-muted">{a.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

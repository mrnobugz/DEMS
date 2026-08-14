/**
 * Interactive odontogram — Carestream SoftDent charting pattern:
 * 1. Pick a procedure on the toolbar
 * 2. Click a tooth (and surfaces when the procedure requires them)
 * 3. Optional action sheet maps the tooth into a department operation
 *
 * Anatomical 2D arch is the baseline; the 5-zone surface glyph is the
 * pointing device for surface-true codes.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChartEntry } from "@/lib/types";
import { ArchChart } from "@/components/viz/ArchChart";
import { ToothSurfaceDiagram } from "@/components/viz/ToothSurfaceDiagram";
import { CHART_TOOLS, TOOTH_ACTIONS, type ChartTool } from "@/components/viz/chartActions";
import { TOOTH_STATUS_COLORS, type Dentition } from "@/components/viz/teeth";

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

export function Odontogram({
  entries,
  selected,
  onSelect,
  onMark,
  colorByStatus = true,
  dentition = "permanent",
  patientId,
}: Props) {
  const navigate = useNavigate();
  const [tool, setTool] = useState<ChartTool>(CHART_TOOLS[0]);
  const [surfaces, setSurfaces] = useState<string[]>(["O"]);
  const [sheet, setSheet] = useState<string | null>(null);

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

  const colors = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const [tooth, e] of byTooth) {
      map[tooth] =
        (colorByStatus && e.status && TOOTH_STATUS_COLORS[e.status]) ||
        TOOTH_STATUS_COLORS[e.condition_code] ||
        (e.entry_kind === "planned" ? TOOTH_STATUS_COLORS.planned : "#bfdbfe");
    }
    return map;
  }, [byTooth, colorByStatus]);

  const badges = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const [tooth, e] of byTooth) {
      if (e.surfaces) map[tooth] = e.surfaces;
    }
    return map;
  }, [byTooth]);

  function apply(tooth: string) {
    onSelect?.(tooth);
    if (tool.id === "select") {
      setSheet(tooth);
      return;
    }
    if (tool.needsSurface && surfaces.length === 0) return;
    onMark?.({
      tooth,
      condition_code: tool.condition_code,
      condition_label: tool.condition_label,
      entry_kind: tool.entry_kind,
      surfaces: tool.needsSurface ? surfaces.join("") : "",
    });
  }

  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-brand-900">Interactive odontogram</h3>
          <p className="text-sm text-muted">
            Pick a procedure, then click a tooth — surface-true charting · FDI
            {tool.id !== "select" ? ` · armed: ${tool.label}` : " · select a tooth for department actions"}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {CHART_TOOLS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setTool(c)}
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

      <div className="grid gap-4 lg:grid-cols-[1fr_140px]">
        <ArchChart
          dentition={dentition}
          colors={colors}
          badges={badges}
          selected={selected}
          onSelect={apply}
          height={320}
        />
        <div className="flex flex-col items-center justify-center gap-2">
          <ToothSurfaceDiagram
            fdi={selected}
            value={surfaces}
            onChange={setSurfaces}
            size={128}
          />
          <p className="text-center text-[10px] text-muted">
            {tool.needsSurface
              ? "Click zones, then the tooth"
              : "Whole-tooth procedure — surfaces optional"}
          </p>
        </div>
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

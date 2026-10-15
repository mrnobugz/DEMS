/**
 * Chairside horizontal odontogram for clinical departments.
 * Selection, surface picking, quick actions, and double-click automation
 * feed the department forms without leaving the page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArchChart, type ArchToothMark } from "@/components/viz/ArchChart";
import { ToothSurfaceDiagram } from "@/components/viz/ToothSurfaceDiagram";
import { CHART_TOOLS, type ChartTool } from "@/components/viz/chartActions";
import { isPosterior, type Dentition } from "@/components/viz/teeth";

export type DeptOdontogramMode = "restorative" | "surgical" | "ortho" | "paediatric";

export type DeptOdontogramActionMeta = {
  surfaces?: string;
  source?: "click" | "double-click" | "action" | "tool";
};

type QuickAction = {
  id: string;
  label: string;
  hint: string;
  primary?: boolean;
};

const QUICK_ACTIONS: Record<DeptOdontogramMode, QuickAction[]> = {
  restorative: [
    { id: "case", label: "Open case", hint: "Fill the restorative case form", primary: true },
    { id: "crown", label: "Crown case", hint: "Set case type to crown" },
    { id: "endo", label: "Endo / RCT", hint: "Mark this tooth for endodontics" },
  ],
  surgical: [
    { id: "extract", label: "Extraction", hint: "Fill procedure as extraction", primary: true },
    { id: "implant", label: "Implant", hint: "Fill procedure as implant placement" },
    { id: "followup", label: "Follow-up", hint: "Open post-op follow-up for this site" },
  ],
  ortho: [
    { id: "arch", label: "Set arch", hint: "Assign upper/lower from this tooth", primary: true },
    { id: "tad", label: "TAD / anchorage", hint: "Note anchorage at this tooth" },
    { id: "adjust", label: "Adjustment note", hint: "Prefill the next adjustment" },
  ],
  paediatric: [
    { id: "fluoride", label: "Fluoride", hint: "Set treatment to fluoride varnish", primary: true },
    { id: "sealant", label: "Sealant", hint: "Set treatment to fissure sealant" },
    { id: "ssc", label: "SSC", hint: "Set treatment to stainless steel crown" },
  ],
};

const TOOLS_BY_MODE: Record<DeptOdontogramMode, string[]> = {
  restorative: ["select", "caries", "filling", "crown", "rct", "planned"],
  surgical: ["select", "extract", "implant", "missing"],
  ortho: ["select", "ortho", "planned"],
  paediatric: ["select", "sealant", "caries", "filling", "crown"],
};

type Props = {
  mode: DeptOdontogramMode;
  dentition?: Dentition;
  selected?: string | null;
  colors?: Record<string, string | undefined>;
  missing?: string[];
  endo?: string[];
  implants?: string[];
  wire?: ("upper" | "lower")[];
  patientId?: string;
  onSelect: (fdi: string) => void;
  onAction?: (actionId: string, tooth: string, meta?: DeptOdontogramActionMeta) => void;
  onSurfacesChange?: (surfaces: string) => void;
};

function buildMarks(
  colors: Record<string, string | undefined>,
  missing: string[],
  endo: string[],
  implants: string[],
): Record<string, ArchToothMark> {
  const marks: Record<string, ArchToothMark> = {};
  for (const [fdi, fill] of Object.entries(colors)) {
    if (!fill) continue;
    marks[fdi] = { ...(marks[fdi] || {}), fill };
  }
  for (const fdi of missing) {
    marks[fdi] = { ...(marks[fdi] || {}), missing: true, fill: marks[fdi]?.fill || "#94a3b8" };
  }
  for (const fdi of endo) {
    marks[fdi] = { ...(marks[fdi] || {}), rct: true, fill: marks[fdi]?.fill || "#8b5cf6" };
  }
  for (const fdi of implants) {
    marks[fdi] = { ...(marks[fdi] || {}), planned: true, badge: "IMP", fill: marks[fdi]?.fill || "#e11d48" };
  }
  return marks;
}

export function DepartmentOdontogram({
  mode,
  dentition: dentitionProp,
  selected,
  colors = {},
  missing = [],
  endo = [],
  implants = [],
  wire = [],
  patientId,
  onSelect,
  onAction,
  onSurfacesChange,
}: Props) {
  const defaultDentition: Dentition =
    dentitionProp || (mode === "paediatric" ? "primary" : "permanent");
  const [dentition, setDentition] = useState<Dentition>(defaultDentition);
  const [tool, setTool] = useState<ChartTool>(CHART_TOOLS[0]!);
  const [surfaces, setSurfaces] = useState<string[]>(["O"]);
  const [announce, setAnnounce] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const lastClick = useRef<{ fdi: string; at: number } | null>(null);

  useEffect(() => {
    if (dentitionProp) setDentition(dentitionProp);
  }, [dentitionProp]);

  useEffect(() => {
    if (!selected) return;
    const center = isPosterior(selected) ? "O" : "I";
    setSurfaces((prev) => {
      const next = prev.map((s) => (s === "O" || s === "I" ? center : s));
      const joined = next.join("");
      if (joined === prev.join("")) return prev;
      onSurfacesChange?.(joined);
      return next;
    });
  }, [selected, onSurfacesChange]);

  const marks = useMemo(
    () => buildMarks(colors, missing, endo, implants),
    [colors, missing, endo, implants],
  );

  const tools = useMemo(
    () => CHART_TOOLS.filter((t) => TOOLS_BY_MODE[mode].includes(t.id)),
    [mode],
  );

  const actions = QUICK_ACTIONS[mode];
  const primary = actions.find((a) => a.primary) || actions[0]!;

  function react(fdi: string, message: string) {
    setFlash(fdi);
    setAnnounce(message);
    window.setTimeout(() => setFlash((cur) => (cur === fdi ? null : cur)), 450);
  }

  function changeSurfaces(next: string[]) {
    setSurfaces(next);
    onSurfacesChange?.(next.join(""));
  }

  function runAction(actionId: string, tooth: string, source: DeptOdontogramActionMeta["source"]) {
    const surf = surfaces.join("");
    onAction?.(actionId, tooth, { surfaces: surf || undefined, source });
    const action = actions.find((a) => a.id === actionId);
    react(tooth, `${action?.label || actionId} applied to tooth ${tooth}${surf ? ` · ${surf}` : ""}`);
  }

  function handleSelect(fdi: string) {
    const now = Date.now();
    const prev = lastClick.current;
    const isDouble = prev?.fdi === fdi && now - prev.at < 380;
    lastClick.current = { fdi, at: now };

    onSelect(fdi);

    if (isDouble) {
      runAction(primary.id, fdi, "double-click");
      return;
    }

    if (tool.id !== "select") {
      if (tool.needsSurface && surfaces.length === 0) {
        setAnnounce("Pick surfaces on the diagram, then click the tooth again.");
        return;
      }
      // Charting tools auto-drive the matching department action.
      const autoAction =
        tool.id === "crown"
          ? "crown"
          : tool.id === "rct"
            ? "endo"
            : tool.id === "extract" || tool.id === "missing"
              ? "extract"
              : tool.id === "implant"
                ? "implant"
                : tool.id === "sealant"
                  ? "sealant"
                  : tool.id === "ortho"
                    ? "arch"
                    : primary.id;
      runAction(autoAction, fdi, "tool");
      return;
    }

    react(fdi, `Tooth ${fdi} selected. Double-click for ${primary.label.toLowerCase()}.`);
  }

  const highlightArch =
    mode === "ortho" && wire.length === 1 ? wire[0]! : mode === "ortho" && selected
      ? Number(selected[0]) <= 2
        ? "upper"
        : "lower"
      : "both";

  return (
    <section className="glass-panel dept-odontogram space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Odontogram</h3>
          <p className="text-sm text-muted">
            Click a tooth to select. Double-click applies {primary.label.toLowerCase()}.
            {tool.id !== "select" ? ` Armed: ${tool.label}.` : ""}
          </p>
        </div>
        <div className="flex rounded-full border border-border bg-canvas p-0.5 text-sm font-semibold">
          {(["permanent", "primary"] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`min-h-[44px] rounded-full px-3 capitalize ${
                dentition === d ? "bg-brand-600 text-white" : "text-muted"
              }`}
              onClick={() => setDentition(d)}
            >
              {d === "permanent" ? "Adult FDI" : "Primary"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Chart tools">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn-ghost ${tool.id === t.id ? "ring-2 ring-brand-500" : ""}`}
            aria-pressed={tool.id === t.id}
            onClick={() => setTool(t)}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
              style={{ background: t.color }}
              aria-hidden
            />
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_168px]">
        <div className={`dept-odontogram__chart ${flash ? "dept-odontogram__chart--flash" : ""}`}>
          <ArchChart
            dentition={dentition}
            colors={colors}
            marks={marks}
            selected={selected}
            onSelect={handleSelect}
            highlightArch={highlightArch}
            height={mode === "paediatric" ? 360 : 400}
          />
        </div>
        <div className="flex flex-col items-center gap-3">
          <ToothSurfaceDiagram
            fdi={selected}
            value={surfaces}
            onChange={changeSurfaces}
            size={148}
          />
          <p className="text-center text-sm text-muted">
            {selected ? `Tooth ${selected}` : "Select a tooth"}
            {surfaces.length ? ` · ${surfaces.join("")}` : ""}
          </p>
          {!patientId && (
            <p className="text-center text-sm text-muted">Choose a patient to apply actions to a case.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Department actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={action.primary ? "btn-primary" : "btn-ghost"}
            disabled={!selected}
            title={action.hint}
            onClick={() => selected && runAction(action.id, selected, "action")}
          >
            {action.label}
            {selected ? ` · ${selected}` : ""}
          </button>
        ))}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {announce && (
        <p className="text-sm font-semibold text-brand-800" aria-hidden>
          {announce}
        </p>
      )}
    </section>
  );
}

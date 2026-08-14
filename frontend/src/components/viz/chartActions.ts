/**
 * Carestream SoftDent-style charting: pick a procedure, then click a tooth
 * (and surfaces when required). Actions also deep-link into DEMS departments.
 */

export type ChartToolId =
  | "select"
  | "caries"
  | "filling"
  | "crown"
  | "rct"
  | "missing"
  | "planned"
  | "extract"
  | "implant"
  | "sealant"
  | "ortho";

export type ChartTool = {
  id: ChartToolId;
  label: string;
  color: string;
  /** SoftDent: surface-specific restorations require pointing at a surface. */
  needsSurface: boolean;
  condition_code: string;
  condition_label: string;
  entry_kind: "existing" | "planned";
};

export const CHART_TOOLS: ChartTool[] = [
  { id: "select", label: "Select", color: "#64748b", needsSurface: false, condition_code: "sound", condition_label: "Select", entry_kind: "existing" },
  { id: "caries", label: "Caries", color: "#ef4444", needsSurface: true, condition_code: "caries", condition_label: "Caries", entry_kind: "existing" },
  { id: "filling", label: "Filling", color: "#3b82f6", needsSurface: true, condition_code: "filling", condition_label: "Filling", entry_kind: "existing" },
  { id: "crown", label: "Crown", color: "#f59e0b", needsSurface: false, condition_code: "crown", condition_label: "Crown", entry_kind: "existing" },
  { id: "rct", label: "RCT", color: "#8b5cf6", needsSurface: false, condition_code: "rct", condition_label: "RCT", entry_kind: "existing" },
  { id: "missing", label: "Extract", color: "#94a3b8", needsSurface: false, condition_code: "missing", condition_label: "Missing", entry_kind: "existing" },
  { id: "planned", label: "Plan", color: "#0ea5e9", needsSurface: true, condition_code: "planned", condition_label: "Planned", entry_kind: "planned" },
  { id: "sealant", label: "Sealant", color: "#22c55e", needsSurface: true, condition_code: "filling", condition_label: "Fissure sealant", entry_kind: "existing" },
  { id: "implant", label: "Implant", color: "#e11d48", needsSurface: false, condition_code: "planned", condition_label: "Implant planned", entry_kind: "planned" },
  { id: "extract", label: "Surgery", color: "#be123c", needsSurface: false, condition_code: "missing", condition_label: "Surgical extraction", entry_kind: "planned" },
  { id: "ortho", label: "Ortho", color: "#06b6d4", needsSurface: false, condition_code: "planned", condition_label: "Ortho review", entry_kind: "planned" },
];

export type ToothAction = {
  id: string;
  label: string;
  hint: string;
  href: (patientId: string, tooth: string) => string;
};

/** Right-click / action sheet — maps a tooth into a department operation. */
export const TOOTH_ACTIONS: ToothAction[] = [
  {
    id: "restorative",
    label: "Open restorative case",
    hint: "Surface-true filling, crown, or warranty case",
    href: (patientId, tooth) => `/clinic/restorative?patient=${patientId}&tooth=${tooth}`,
  },
  {
    id: "endo",
    label: "Open endodontic case",
    hint: "RCT / pulpotomy on this tooth",
    href: (patientId, tooth) => `/patients/${patientId}?tooth=${tooth}&panel=endo`,
  },
  {
    id: "surgery",
    label: "Open surgical case",
    hint: "Extraction, impaction, implant, biopsy",
    href: (patientId, tooth) => `/clinic/maxillofacial?patient=${patientId}&site=${tooth}`,
  },
  {
    id: "ortho",
    label: "Orthodontic arch",
    hint: "Assign this arch to an ortho case",
    href: (patientId, tooth) => `/clinic/orthodontic?patient=${patientId}&tooth=${tooth}`,
  },
  {
    id: "paediatric",
    label: "Paediatric treatment",
    hint: "Fluoride, sealant, SSC on primary teeth",
    href: (patientId, tooth) => `/clinic/paediatric?patient=${patientId}&tooth=${tooth}`,
  },
  {
    id: "imaging",
    label: "Filter imaging",
    hint: "Show radiographs tagged to this tooth",
    href: (patientId, tooth) => `/imaging?patient=${patientId}&tooth=${tooth}`,
  },
];

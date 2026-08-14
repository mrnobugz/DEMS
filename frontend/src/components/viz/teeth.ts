/**
 * Shared dental geometry: FDI numbering, tooth types, and parametric arch
 * positions used by the 2D SVG charts and the 3D mouth (Section 10.2 of the
 * architecture plan: 2D baseline, 3D progressive enhancement).
 */

export type Dentition = "permanent" | "primary";

export type ToothType = "incisor" | "canine" | "premolar" | "molar";

export type ToothDef = {
  fdi: string;
  type: ToothType;
  arch: "upper" | "lower";
  /** 0 → patient's right-most molar … 1 → patient's left-most molar */
  t: number;
};

/** FDI order across an arch, patient's right (viewer left) → patient's left. */
export const PERMANENT_UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
export const PERMANENT_LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];
export const PRIMARY_UPPER = ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"];
export const PRIMARY_LOWER = ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"];

export function toothType(fdi: string): ToothType {
  const pos = Number(fdi[1]);
  const primary = Number(fdi[0]) >= 5;
  if (primary) {
    if (pos <= 2) return "incisor";
    if (pos === 3) return "canine";
    return "molar"; // 4-5 are primary molars
  }
  if (pos <= 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos <= 5) return "premolar";
  return "molar";
}

export function isPosterior(fdi: string): boolean {
  const type = toothType(fdi);
  return type === "premolar" || type === "molar";
}

/** Surfaces applicable to a tooth: posterior get O (occlusal), anterior I (incisal). */
export function surfacesFor(fdi: string): string[] {
  return isPosterior(fdi) ? ["M", "O", "D", "B", "L"] : ["M", "I", "D", "B", "L"];
}

export function archTeeth(dentition: Dentition): { upper: ToothDef[]; lower: ToothDef[] } {
  const upperIds = dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
  const lowerIds = dentition === "primary" ? PRIMARY_LOWER : PERMANENT_LOWER;
  const build = (ids: string[], arch: "upper" | "lower"): ToothDef[] =>
    ids.map((fdi, i) => ({
      fdi,
      type: toothType(fdi),
      arch,
      t: ids.length === 1 ? 0.5 : i / (ids.length - 1),
    }));
  return { upper: build(upperIds, "upper"), lower: build(lowerIds, "lower") };
}

/**
 * Point along a U-shaped arch. t ∈ [0,1] runs right molar → incisors → left
 * molar. Returns a point on a semi-ellipse plus the local tangent angle.
 * `open` = "down" (upper arch, apex up) or "up" (lower arch, apex down).
 */
export function archPoint(
  t: number,
  width: number,
  depth: number,
  open: "down" | "up",
): { x: number; y: number; angle: number } {
  const theta = Math.PI * t; // 0 → π
  const x = -(width / 2) * Math.cos(theta);
  const rise = Math.sin(theta) * depth;
  const y = open === "down" ? -rise : rise;
  // tangent for rotation of tooth glyphs
  const dx = (width / 2) * Math.sin(theta);
  const dy = (open === "down" ? -1 : 1) * depth * Math.cos(theta);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x, y, angle };
}

/** Relative tooth size along the arch (molars widest, incisors narrowest). */
export function toothScale(type: ToothType): number {
  switch (type) {
    case "molar":
      return 1.25;
    case "premolar":
      return 1.0;
    case "canine":
      return 0.9;
    case "incisor":
      return 0.8;
  }
}

/** Default status palette shared across 2D and 3D views. */
export const TOOTH_STATUS_COLORS: Record<string, string> = {
  planned: "#0ea5e9",
  in_progress: "#f59e0b",
  completed: "#22c55e",
  failed: "#ef4444",
  replaced: "#a855f7",
  recorded: "#3b82f6",
  caries: "#ef4444",
  filling: "#3b82f6",
  crown: "#f59e0b",
  missing: "#94a3b8",
  rct: "#8b5cf6",
  fluoride_varnish: "#0ea5e9",
  fissure_sealant: "#22c55e",
  stainless_steel_crown: "#f59e0b",
  pulpotomy: "#8b5cf6",
  pulpectomy: "#7c3aed",
  extraction: "#94a3b8",
  space_maintainer: "#14b8a6",
  restoration: "#3b82f6",
  surgical: "#e11d48",
  ortho: "#0ea5e9",
};

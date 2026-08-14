/**
 * CS 3D Imaging Premium analog: AI-automated virtual crown.
 * Dimensions follow Wheeler's dental anatomy averages (mm). Neighbor contacts,
 * opposing occlusion, and implant emergence refine the proposal. The clinician
 * must review — this is advisory planning, not a milled restoration.
 */

import {
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  PRIMARY_LOWER,
  PRIMARY_UPPER,
  toothType,
  type Dentition,
} from "./teeth";

export type CrownMaterial = "zirconia" | "lithium_disilicate" | "pfm" | "ssc" | "waxup";
export type CrownMode = "ai" | "manual";

export type CrownPlan = {
  fdi: string;
  material: CrownMaterial;
  /** Mesiodistal width (mm). */
  md: number;
  /** Buccolingual width (mm). */
  bl: number;
  /** Occlusal height (mm). */
  height: number;
  /** Extra yaw around the long axis (deg). */
  rotation: number;
  /** Occlusal extrusion (+) / intrusion (−) in mm. */
  extrusion: number;
  tiltMd: number;
  tiltBl: number;
  /** Hide the native tooth (virtual extraction / edentulous site). */
  extract: boolean;
  mode: CrownMode;
  confidence: number;
  reasons: string[];
};

/** Scene units per millimetre — matches Mouth3D tooth scale (molar Ø ≈ 10.5 mm). */
export const MM = 0.08;

type Anatomy = { md: number; bl: number; height: number };

/** Wheeler's average crown dimensions by FDI. */
export function crownAnatomy(fdi: string): Anatomy {
  const q = Number(fdi[0]);
  const p = Number(fdi[1]);
  const upper = q === 1 || q === 2 || q === 5 || q === 6;
  const primary = q >= 5;
  if (primary) {
    const u: Record<number, Anatomy> = {
      1: { md: 6.5, bl: 5.0, height: 6.0 },
      2: { md: 5.1, bl: 4.8, height: 5.6 },
      3: { md: 7.0, bl: 5.4, height: 6.5 },
      4: { md: 7.3, bl: 8.5, height: 6.0 },
      5: { md: 9.0, bl: 10.0, height: 5.6 },
    };
    const l: Record<number, Anatomy> = {
      1: { md: 4.2, bl: 4.0, height: 6.0 },
      2: { md: 4.1, bl: 4.0, height: 5.6 },
      3: { md: 5.0, bl: 4.8, height: 6.0 },
      4: { md: 7.0, bl: 8.0, height: 6.0 },
      5: { md: 9.0, bl: 8.8, height: 5.6 },
    };
    return (upper ? u : l)[p] ?? { md: 6.2, bl: 6.0, height: 5.8 };
  }
  const u: Record<number, Anatomy> = {
    1: { md: 8.5, bl: 7.0, height: 10.5 },
    2: { md: 6.5, bl: 6.0, height: 9.0 },
    3: { md: 7.5, bl: 8.0, height: 10.0 },
    4: { md: 7.0, bl: 9.0, height: 8.5 },
    5: { md: 6.8, bl: 8.8, height: 8.0 },
    6: { md: 10.0, bl: 11.0, height: 7.5 },
    7: { md: 9.0, bl: 10.5, height: 7.0 },
    8: { md: 8.5, bl: 10.0, height: 6.5 },
  };
  const l: Record<number, Anatomy> = {
    1: { md: 5.0, bl: 6.0, height: 9.0 },
    2: { md: 5.5, bl: 6.5, height: 9.5 },
    3: { md: 7.0, bl: 7.5, height: 11.0 },
    4: { md: 7.0, bl: 7.5, height: 8.5 },
    5: { md: 7.0, bl: 8.0, height: 8.0 },
    6: { md: 11.0, bl: 10.5, height: 7.5 },
    7: { md: 10.5, bl: 10.0, height: 7.0 },
    8: { md: 10.0, bl: 9.5, height: 6.5 },
  };
  return (upper ? u : l)[p] ?? { md: 8.0, bl: 8.0, height: 8.0 };
}

export function opposingFdi(fdi: string): string {
  const map: Record<string, string> = { "1": "4", "2": "3", "3": "2", "4": "1", "5": "8", "6": "7", "7": "6", "8": "5" };
  return `${map[fdi[0]] ?? fdi[0]}${fdi[1]}`;
}

function archOf(fdi: string, dentition: Dentition): string[] {
  const q = Number(fdi[0]);
  const upper = q === 1 || q === 2 || q === 5 || q === 6;
  if (dentition === "primary") return upper ? PRIMARY_UPPER : PRIMARY_LOWER;
  return upper ? PERMANENT_UPPER : PERMANENT_LOWER;
}

function present(fdi: string, missing: Set<string>) {
  return !missing.has(fdi);
}

export function defaultMaterial(fdi: string): CrownMaterial {
  const q = Number(fdi[0]);
  if (q >= 5) return "ssc";
  const type = toothType(fdi);
  return type === "incisor" || type === "canine" ? "lithium_disilicate" : "zirconia";
}

export function crownColor(material: CrownMaterial): string {
  switch (material) {
    case "zirconia":
      return "#f3efe6";
    case "lithium_disilicate":
      return "#f7f1e4";
    case "pfm":
      return "#efe6d6";
    case "ssc":
      return "#c5ccd3";
    case "waxup":
      return "#f59e0b";
  }
}

type ProposeOpts = {
  fdi: string;
  dentition?: Dentition;
  missing?: string[];
  implants?: string[];
  implant?: { diameter: number; length: number; angle: number };
  mode?: CrownMode;
};

/**
 * AI Auto Crown: anatomic library + contact/occlusion/emergence constraints.
 * Manual mode returns library size at the FDI site (virtual wax-up).
 */
export function proposeVirtualCrown(opts: ProposeOpts): CrownPlan {
  const dentition = opts.dentition ?? "permanent";
  const missing = new Set(opts.missing ?? []);
  const lib = crownAnatomy(opts.fdi);
  const reasons: string[] = [];
  let { md, bl, height } = lib;
  let confidence = 0.62;
  let extract = missing.has(opts.fdi);
  let tiltBl = 0;
  let extrusion = 0;

  if (opts.mode === "manual") {
    reasons.push("Manual virtual wax-up at library anatomy");
    return {
      fdi: opts.fdi,
      material: opts.dentition === "primary" ? "ssc" : "waxup",
      md,
      bl,
      height,
      rotation: 0,
      extrusion: 0,
      tiltMd: 0,
      tiltBl: 0,
      extract,
      mode: "manual",
      confidence: 1,
      reasons,
    };
  }

  reasons.push(`Wheeler anatomy ${toothType(opts.fdi)} MD ${lib.md} × BL ${lib.bl} × H ${lib.height} mm`);

  const arch = archOf(opts.fdi, dentition);
  const i = arch.indexOf(opts.fdi);
  const mesial = i > 0 ? arch[i - 1] : undefined;
  const distal = i >= 0 && i < arch.length - 1 ? arch[i + 1] : undefined;
  const mesialOk = mesial ? present(mesial, missing) : false;
  const distalOk = distal ? present(distal, missing) : false;
  if (mesialOk && distalOk) {
    md = Number((lib.md * 0.97).toFixed(2));
    confidence += 0.18;
    reasons.push(`Contact-adapted to ${mesial} and ${distal}`);
  } else if (mesialOk || distalOk) {
    md = Number((lib.md * 0.99).toFixed(2));
    confidence += 0.08;
    reasons.push(`One proximal contact (${mesialOk ? mesial : distal})`);
  } else {
    md = Number((lib.md * 1.02).toFixed(2));
    reasons.push("Open contacts — library MD + 2%");
  }

  const opp = opposingFdi(opts.fdi);
  if (present(opp, missing) && opp !== opts.fdi) {
    height = Number((lib.height * 0.98).toFixed(2));
    extrusion = -0.15;
    confidence += 0.08;
    reasons.push(`Occlusal clearance vs ${opp}`);
  } else {
    reasons.push("No antagonist — full anatomic height");
  }

  const onImplant = Boolean(opts.implant) || (opts.implants ?? []).includes(opts.fdi);
  if (onImplant) {
    extract = true;
    const dia = opts.implant?.diameter ?? 4.1;
    const emergence = dia + 1.6;
    if (md < emergence) {
      md = Number(emergence.toFixed(2));
      reasons.push(`Emergence widened to Ø${dia} + 1.6 mm biologic width`);
    } else {
      reasons.push(`Prosthetic-driven on Ø${dia} mm fixture`);
    }
    bl = Number(Math.max(bl, dia + 3).toFixed(2));
    tiltBl = opts.implant?.angle ?? 0;
    confidence += 0.07;
  }

  if (extract) {
    reasons.push("Virtual extraction — native crown hidden");
    confidence += 0.03;
  }

  const material = defaultMaterial(opts.fdi);
  reasons.push(`Material ${material.replace("_", " ")}`);

  return {
    fdi: opts.fdi,
    material,
    md,
    bl,
    height,
    rotation: 0,
    extrusion,
    tiltMd: 0,
    tiltBl,
    extract,
    mode: "ai",
    confidence: Number(Math.min(0.97, confidence).toFixed(2)),
    reasons,
  };
}

/** PDIP: implant sized from the virtual crown (crown first, fixture second). */
export function proposeImplantFromCrown(crown: CrownPlan): {
  diameter: number;
  length: number;
  angle: number;
} {
  const pos = Number(crown.fdi[1]);
  const mandible = crown.fdi[0] === "3" || crown.fdi[0] === "4";
  const diameter = crown.md >= 10 ? 4.8 : crown.md >= 8 ? 4.1 : crown.md >= 6.5 ? 3.5 : 3.3;
  const length = mandible && pos >= 6 ? 10 : pos >= 6 ? 10 : 11.5;
  return { diameter, length, angle: Math.round(crown.tiltBl) };
}

export function crownSummary(plan: CrownPlan): string {
  const pct = Math.round(plan.confidence * 100);
  return `${plan.mode === "ai" ? "AI" : "Manual"} ${plan.material.replace("_", " ")} · ${plan.md}×${plan.bl}×${plan.height} mm · ${pct}%`;
}

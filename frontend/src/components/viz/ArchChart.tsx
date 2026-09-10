/**
 * Anatomical 2D odontogram: upper + lower arches drawn as U-curves in SVG.
 * Type-specific glyphs, per-surface marks, missing/planned overlays.
 */

import { useMemo, useState } from "react";
import {
  archPoint,
  archTeeth,
  isPosterior,
  toothScale,
  type Dentition,
  type ToothDef,
  type ToothType,
} from "./teeth";

export type ArchToothMark = {
  fill?: string;
  surfaces?: string;
  missing?: boolean;
  planned?: boolean;
  crown?: boolean;
  rct?: boolean;
  badge?: string;
};

type Props = {
  dentition?: Dentition;
  colors?: Record<string, string | undefined>;
  selected?: string | null;
  onSelect?: (fdi: string) => void;
  onHover?: (fdi: string | null) => void;
  highlightArch?: "upper" | "lower" | "both";
  badges?: Record<string, string | undefined>;
  marks?: Record<string, ArchToothMark | undefined>;
  height?: number;
};

const W = 540;
const H = 430;
const ARCH_W = 400;
const ARCH_D = 108;
const UPPER_CY = 122;
const LOWER_CY = 298;

function glyphSize(type: ToothType): { rx: number; ry: number } {
  const s = toothScale(type);
  switch (type) {
    case "molar":
      return { rx: 11.5 * s, ry: 13.5 * s };
    case "premolar":
      return { rx: 8.4 * s, ry: 12 * s };
    case "canine":
      return { rx: 7.2 * s, ry: 13.2 * s };
    default:
      return { rx: 6.4 * s, ry: 12.6 * s };
  }
}

function surfaceLetters(tooth: ToothDef, raw?: string): string[] {
  if (!raw) return [];
  const center = isPosterior(tooth.fdi) ? "O" : "I";
  return [...raw.toUpperCase()].map((ch) => (ch === "C" ? center : ch));
}

function ToothBody({
  type,
  rx,
  ry,
  fill,
  stroke,
  strokeWidth,
  dashed,
}: {
  type: ToothType;
  rx: number;
  ry: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
}) {
  const dash = dashed ? "3 2.5" : undefined;
  if (type === "canine") {
    return (
      <path
        d={`M ${-rx * 0.15} ${-ry * 1.08} C ${-rx * 0.85} ${-ry * 0.2} ${-rx} ${ry * 0.15} ${-rx * 0.72} ${ry}
           L ${rx * 0.72} ${ry} C ${rx} ${ry * 0.15} ${rx * 0.85} ${-ry * 0.2} ${rx * 0.15} ${-ry * 1.08} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
    );
  }
  if (type === "incisor") {
    return (
      <rect
        x={-rx}
        y={-ry}
        width={rx * 2}
        height={ry * 2}
        rx={rx * 0.45}
        ry={ry * 0.22}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
      />
    );
  }
  if (type === "molar") {
    return (
      <g>
        <rect
          x={-rx}
          y={-ry}
          width={rx * 2}
          height={ry * 2}
          rx={rx * 0.42}
          ry={ry * 0.28}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
        />
        <ellipse rx={rx * 0.32} ry={ry * 0.28} cy={-ry * 0.12} fill="none" stroke="#94a3b8" strokeWidth={0.7} />
        <ellipse rx={rx * 0.32} ry={ry * 0.28} cy={ry * 0.22} fill="none" stroke="#94a3b8" strokeWidth={0.7} />
      </g>
    );
  }
  return (
    <ellipse
      rx={rx}
      ry={ry}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
    />
  );
}

function SurfaceZones({
  rx,
  ry,
  active,
  color,
  posterior,
}: {
  rx: number;
  ry: number;
  active: string[];
  color: string;
  posterior: boolean;
}) {
  const center = posterior ? "O" : "I";
  const w = rx * 1.55;
  const h = ry * 1.45;
  const insetX = w * 0.38;
  const insetY = h * 0.34;
  const zones: { key: string; d: string }[] = [
    { key: "B", d: `M ${-w} ${-h} L ${w} ${-h} L ${insetX} ${-insetY} L ${-insetX} ${-insetY} Z` },
    { key: "L", d: `M ${-w} ${h} L ${w} ${h} L ${insetX} ${insetY} L ${-insetX} ${insetY} Z` },
    { key: "M", d: `M ${-w} ${-h} L ${-w} ${h} L ${-insetX} ${insetY} L ${-insetX} ${-insetY} Z` },
    { key: "D", d: `M ${w} ${-h} L ${w} ${h} L ${insetX} ${insetY} L ${insetX} ${-insetY} Z` },
    { key: center, d: `M ${-insetX} ${-insetY} L ${insetX} ${-insetY} L ${insetX} ${insetY} L ${-insetX} ${insetY} Z` },
  ];
  return (
    <g pointerEvents="none">
      {zones.map((z) => (
        <path
          key={z.key}
          d={z.d}
          fill={active.includes(z.key) ? color : "rgba(255,255,255,0.55)"}
          stroke="#94a3b8"
          strokeWidth={0.45}
          opacity={active.includes(z.key) ? 0.95 : 0.35}
        />
      ))}
    </g>
  );
}

function ToothGlyph({
  tooth,
  cx,
  cy,
  angle,
  mark,
  fill,
  dimmed,
  selected,
  hovered,
  badge,
  onSelect,
  onHover,
}: {
  tooth: ToothDef;
  cx: number;
  cy: number;
  angle: number;
  mark?: ArchToothMark;
  fill: string;
  dimmed: boolean;
  selected: boolean;
  hovered: boolean;
  badge?: string;
  onSelect?: (fdi: string) => void;
  onHover?: (fdi: string | null) => void;
}) {
  const { rx, ry } = glyphSize(tooth.type);
  const labelOffset = tooth.arch === "upper" ? -(ry + 11) : ry + 14;
  const surfaces = surfaceLetters(tooth, mark?.surfaces);
  const bodyFill = mark?.missing ? "#e2e8f0" : fill;
  const stroke = selected ? "#0b5fff" : hovered ? "#3b82f6" : mark?.planned ? "#0284c7" : "#8aa0c2";
  const strokeWidth = selected ? 2.6 : hovered ? 2 : 1.15;

  return (
    <g
      className="odontogram-tooth"
      transform={`translate(${cx} ${cy})`}
      opacity={dimmed ? 0.22 : 1}
      role="button"
      tabIndex={0}
      aria-label={`Tooth ${tooth.fdi}${mark?.badge ? ` ${mark.badge}` : ""}`}
      aria-pressed={selected}
      style={{ cursor: onSelect ? "pointer" : "default" }}
      onClick={() => onSelect?.(tooth.fdi)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(tooth.fdi);
        }
      }}
      onMouseEnter={() => onHover?.(tooth.fdi)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(tooth.fdi)}
      onBlur={() => onHover?.(null)}
    >
      {hovered || selected ? (
        <ellipse rx={rx + 6} ry={ry + 7} fill={selected ? "rgba(11,95,255,0.12)" : "rgba(11,95,255,0.06)"} />
      ) : null}
      <g transform={`rotate(${angle + 90})`}>
        <ToothBody
          type={tooth.type}
          rx={rx}
          ry={ry}
          fill={bodyFill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dashed={mark?.planned}
        />
        {surfaces.length > 0 && !mark?.missing && (
          <SurfaceZones
            rx={rx}
            ry={ry}
            active={surfaces}
            color={fill}
            posterior={isPosterior(tooth.fdi)}
          />
        )}
        {mark?.crown && !mark?.missing && (
          <ellipse rx={rx * 1.08} ry={ry * 1.08} fill="none" stroke="#d97706" strokeWidth={2} />
        )}
        {mark?.rct && !mark?.missing && (
          <circle r={Math.min(rx, ry) * 0.32} fill="#7c3aed" opacity={0.9} />
        )}
        {mark?.missing && (
          <g stroke="#64748b" strokeWidth={2.1} strokeLinecap="round">
            <line x1={-rx * 0.7} y1={-ry * 0.7} x2={rx * 0.7} y2={ry * 0.7} />
            <line x1={rx * 0.7} y1={-ry * 0.7} x2={-rx * 0.7} y2={ry * 0.7} />
          </g>
        )}
      </g>
      <text
        y={labelOffset}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fill={selected ? "#0b5fff" : "#334155"}
      >
        {tooth.fdi}
      </text>
      {badge && (
        <text
          y={tooth.arch === "upper" ? labelOffset - 10 : labelOffset + 10}
          textAnchor="middle"
          fontSize={7}
          fontWeight={700}
          fill="#0f766e"
        >
          {badge}
        </text>
      )}
    </g>
  );
}

export function ArchChart({
  dentition = "permanent",
  colors = {},
  selected,
  onSelect,
  onHover,
  highlightArch = "both",
  badges = {},
  marks = {},
  height = 380,
}: Props) {
  const { upper, lower } = useMemo(() => archTeeth(dentition), [dentition]);
  const [hovered, setHovered] = useState<string | null>(null);

  function hover(fdi: string | null) {
    setHovered(fdi);
    onHover?.(fdi);
  }

  function render(teeth: ToothDef[], open: "down" | "up", cy: number) {
    return teeth.map((tooth) => {
      const p = archPoint(tooth.t, ARCH_W, ARCH_D, open);
      const mark = marks[tooth.fdi];
      return (
        <ToothGlyph
          key={tooth.fdi}
          tooth={tooth}
          cx={W / 2 + p.x}
          cy={cy + p.y}
          angle={p.angle}
          mark={mark}
          fill={mark?.fill || colors[tooth.fdi] || "#ffffff"}
          dimmed={highlightArch !== "both" && highlightArch !== tooth.arch}
          selected={selected === tooth.fdi}
          hovered={hovered === tooth.fdi}
          badge={mark?.badge || badges[tooth.fdi]}
          onSelect={onSelect}
          onHover={hover}
        />
      );
    });
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${dentition} dental arch chart, patient's right on the left`}
      className="odontogram-arch"
      style={{ width: "100%", height, maxHeight: height }}
    >
      <text x={W / 2} y={16} textAnchor="middle" fontSize={10} fontWeight={800} fill="#64748b">
        MAXILLA
      </text>
      <text x={18} y={H / 2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#94a3b8" transform={`rotate(-90 18 ${H / 2})`}>
        Patient's RIGHT
      </text>
      <text x={W - 18} y={H / 2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#94a3b8" transform={`rotate(90 ${W - 18} ${H / 2})`}>
        Patient's LEFT
      </text>
      <line x1={W / 2} y1={24} x2={W / 2} y2={H - 24} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 4" />
      <text x={W / 2 - 28} y={36} textAnchor="middle" fontSize={8} fontWeight={700} fill="#94a3b8">
        UR
      </text>
      <text x={W / 2 + 28} y={36} textAnchor="middle" fontSize={8} fontWeight={700} fill="#94a3b8">
        UL
      </text>
      {render(upper, "down", UPPER_CY)}
      {render(lower, "up", LOWER_CY)}
      <text x={W / 2 - 28} y={H - 14} textAnchor="middle" fontSize={8} fontWeight={700} fill="#94a3b8">
        LR
      </text>
      <text x={W / 2 + 28} y={H - 14} textAnchor="middle" fontSize={8} fontWeight={700} fill="#94a3b8">
        LL
      </text>
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#64748b">
        MANDIBLE
      </text>
    </svg>
  );
}

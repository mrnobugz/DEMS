/**
 * Anatomical 2D odontogram: upper + lower arches drawn as U-curves in SVG.
 * Baseline visualization per architecture Section 10.2 — supports permanent
 * and primary (paediatric) dentition, per-tooth color coding and selection.
 */

import { useMemo } from "react";
import {
  archPoint,
  archTeeth,
  toothScale,
  type Dentition,
  type ToothDef,
} from "./teeth";

type Props = {
  dentition?: Dentition;
  /** fill color per FDI tooth (missing entries render as sound/white) */
  colors?: Record<string, string | undefined>;
  selected?: string | null;
  onSelect?: (fdi: string) => void;
  /** dim one arch, e.g. ortho case limited to "upper" */
  highlightArch?: "upper" | "lower" | "both";
  /** small annotation under the tooth number, e.g. surfaces */
  badges?: Record<string, string | undefined>;
  height?: number;
};

const W = 460;
const ARCH_W = 360;
const ARCH_D = 118;

function ToothGlyph({
  tooth,
  cx,
  cy,
  angle,
  fill,
  dimmed,
  selected,
  badge,
  onSelect,
}: {
  tooth: ToothDef;
  cx: number;
  cy: number;
  angle: number;
  fill: string;
  dimmed: boolean;
  selected: boolean;
  badge?: string;
  onSelect?: (fdi: string) => void;
}) {
  const scale = toothScale(tooth.type);
  const rx = 9.5 * scale;
  const ry = 12 * scale;
  const labelOffset = tooth.arch === "upper" ? -(ry + 8) : ry + 13;
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      opacity={dimmed ? 0.25 : 1}
      style={{ cursor: onSelect ? "pointer" : "default" }}
      onClick={() => onSelect?.(tooth.fdi)}
    >
      <ellipse
        transform={`rotate(${angle + 90})`}
        rx={rx}
        ry={ry}
        fill={fill}
        stroke={selected ? "#0b5fff" : "#b6c8e6"}
        strokeWidth={selected ? 3 : 1.2}
      />
      {tooth.type === "molar" && (
        <ellipse
          transform={`rotate(${angle + 90})`}
          rx={rx * 0.45}
          ry={ry * 0.45}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={0.8}
        />
      )}
      <text
        y={labelOffset}
        textAnchor="middle"
        fontSize={9}
        fontWeight={700}
        fill={selected ? "#0b5fff" : "#51617a"}
      >
        {tooth.fdi}
      </text>
      {badge && (
        <text
          y={tooth.arch === "upper" ? labelOffset - 9 : labelOffset + 9}
          textAnchor="middle"
          fontSize={7}
          fontWeight={600}
          fill="#51617a"
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
  highlightArch = "both",
  badges = {},
  height = 340,
}: Props) {
  const { upper, lower } = useMemo(() => archTeeth(dentition), [dentition]);

  const upperCy = 148;
  const lowerCy = 192;

  function render(teeth: ToothDef[], open: "down" | "up", cy: number) {
    return teeth.map((tooth) => {
      const p = archPoint(tooth.t, ARCH_W, ARCH_D, open);
      return (
        <ToothGlyph
          key={tooth.fdi}
          tooth={tooth}
          cx={W / 2 + p.x}
          cy={cy + p.y}
          angle={p.angle}
          fill={colors[tooth.fdi] ?? "#ffffff"}
          dimmed={highlightArch !== "both" && highlightArch !== tooth.arch}
          selected={selected === tooth.fdi}
          badge={badges[tooth.fdi]}
          onSelect={onSelect}
        />
      );
    });
  }

  return (
    <svg
      viewBox={`0 0 ${W} 340`}
      role="img"
      aria-label="Dental arch chart"
      style={{ width: "100%", height, maxHeight: height }}
    >
      <text x={W / 2} y={14} textAnchor="middle" fontSize={9} fontWeight={700} fill="#8195b3">
        UPPER (MAXILLA) — patient's right on the left
      </text>
      <text x={W / 2} y={334} textAnchor="middle" fontSize={9} fontWeight={700} fill="#8195b3">
        LOWER (MANDIBLE)
      </text>
      {render(upper, "down", upperCy)}
      {render(lower, "up", lowerCy)}
    </svg>
  );
}

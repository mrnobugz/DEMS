/**
 * Classic 5-zone per-surface tooth diagram (Mesial / Distal / Buccal / Lingual
 * around Occlusal-or-Incisal center). Click zones to toggle surfaces —
 * surface-true charting per architecture Section 4.3.
 */

import { isPosterior } from "./teeth";

type Props = {
  fdi?: string | null;
  /** selected surface letters, e.g. ["M","O"] */
  value: string[];
  onChange?: (surfaces: string[]) => void;
  /** static fill per surface letter (view mode) */
  colors?: Record<string, string | undefined>;
  size?: number;
};

const ZONES: {
  key: "B" | "M" | "D" | "L" | "C";
  path: string;
  labelX: number;
  labelY: number;
}[] = [
  // Square split into 4 trapezoids around a center square (100x100 viewBox)
  { key: "B", path: "M8 8 L92 8 L68 32 L32 32 Z", labelX: 50, labelY: 22 },
  { key: "D", path: "M92 8 L92 92 L68 68 L68 32 Z", labelX: 80, labelY: 53 },
  { key: "L", path: "M8 92 L92 92 L68 68 L32 68 Z", labelX: 50, labelY: 84 },
  { key: "M", path: "M8 8 L8 92 L32 68 L32 32 Z", labelX: 20, labelY: 53 },
  { key: "C", path: "M32 32 L68 32 L68 68 L32 68 Z", labelX: 50, labelY: 53 },
];

export function ToothSurfaceDiagram({ fdi, value, onChange, colors = {}, size = 120 }: Props) {
  const centerLetter = !fdi || isPosterior(fdi) ? "O" : "I";

  function letterFor(zone: string): string {
    return zone === "C" ? centerLetter : zone;
  }

  function toggle(zone: string) {
    if (!onChange) return;
    const letter = letterFor(zone);
    onChange(
      value.includes(letter) ? value.filter((s) => s !== letter) : [...value, letter],
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="group"
        aria-label={`Tooth ${fdi ?? ""} surface selector`}
      >
        <rect x={4} y={4} width={92} height={92} rx={18} fill="#f4f7fc" stroke="#b6c8e6" />
        {ZONES.map((z) => {
          const letter = letterFor(z.key);
          const active = value.includes(letter);
          const fill = colors[letter] ?? (active ? "#0b5fff" : "#ffffff");
          return (
            <g
              key={z.key}
              onClick={() => toggle(z.key)}
              style={{ cursor: onChange ? "pointer" : "default" }}
            >
              <path d={z.path} fill={fill} stroke="#b6c8e6" strokeWidth={1} />
              <text
                x={z.labelX}
                y={z.labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={13}
                fontWeight={700}
                fill={active && !colors[letter] ? "#ffffff" : "#51617a"}
                pointerEvents="none"
              >
                {letter}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="text-[10px] font-semibold text-muted">
        {fdi ? `Tooth ${fdi}` : "Select a tooth"}
        {value.length > 0 ? ` · ${[...value].sort().join("")}` : ""}
      </span>
    </div>
  );
}

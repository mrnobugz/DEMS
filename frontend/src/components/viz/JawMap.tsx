/**
 * 2D maxillofacial region map: frontal skull/jaw diagram with clickable
 * anatomical regions for surgical site selection (maxilla, zygoma, mandible
 * body/angle/ramus, condyle/TMJ, symphysis, palate).
 */

export type JawRegion = {
  id: string;
  label: string;
  path: string;
  labelX: number;
  labelY: number;
};

/** Viewer's left = patient's right (clinical convention). */
export const JAW_REGIONS: JawRegion[] = [
  {
    id: "right_condyle_tmj",
    label: "R condyle / TMJ",
    path: "M52 118 q-10 -18 2 -30 q14 -8 20 6 q4 12 -6 22 Z",
    labelX: 30,
    labelY: 84,
  },
  {
    id: "left_condyle_tmj",
    label: "L condyle / TMJ",
    path: "M268 118 q10 -18 -2 -30 q-14 -8 -20 6 q-4 12 6 22 Z",
    labelX: 290,
    labelY: 84,
  },
  {
    id: "right_zygoma",
    label: "R zygoma",
    path: "M62 74 q18 -26 52 -24 l-6 20 q-26 0 -38 14 Z",
    labelX: 52,
    labelY: 52,
  },
  {
    id: "left_zygoma",
    label: "L zygoma",
    path: "M258 74 q-18 -26 -52 -24 l6 20 q26 0 38 14 Z",
    labelX: 268,
    labelY: 52,
  },
  {
    id: "right_maxilla",
    label: "R maxilla",
    path: "M92 78 L160 70 L160 128 L104 122 Q92 100 92 78 Z",
    labelX: 122,
    labelY: 100,
  },
  {
    id: "left_maxilla",
    label: "L maxilla",
    path: "M228 78 L160 70 L160 128 L216 122 Q228 100 228 78 Z",
    labelX: 198,
    labelY: 100,
  },
  {
    id: "palate",
    label: "Palate",
    path: "M124 132 Q160 118 196 132 Q160 146 124 132 Z",
    labelX: 160,
    labelY: 134,
  },
  {
    id: "right_ramus",
    label: "R ramus",
    path: "M56 122 L82 126 L86 176 L62 168 Q54 144 56 122 Z",
    labelX: 66,
    labelY: 150,
  },
  {
    id: "left_ramus",
    label: "L ramus",
    path: "M264 122 L238 126 L234 176 L258 168 Q266 144 264 122 Z",
    labelX: 254,
    labelY: 150,
  },
  {
    id: "right_angle",
    label: "R angle",
    path: "M62 172 L88 178 L100 204 L74 196 Q64 184 62 172 Z",
    labelX: 72,
    labelY: 192,
  },
  {
    id: "left_angle",
    label: "L angle",
    path: "M258 172 L232 178 L220 204 L246 196 Q256 184 258 172 Z",
    labelX: 248,
    labelY: 192,
  },
  {
    id: "right_mandible_body",
    label: "R body",
    path: "M96 182 L160 192 L160 226 L112 212 Q100 198 96 182 Z",
    labelX: 128,
    labelY: 206,
  },
  {
    id: "left_mandible_body",
    label: "L body",
    path: "M224 182 L160 192 L160 226 L208 212 Q220 198 224 182 Z",
    labelX: 192,
    labelY: 206,
  },
  {
    id: "symphysis",
    label: "Symphysis",
    path: "M138 216 Q160 232 182 216 L176 240 Q160 250 144 240 Z",
    labelX: 160,
    labelY: 236,
  },
];

export function jawRegionLabel(id: string): string {
  return JAW_REGIONS.find((r) => r.id === id)?.label ?? id.replaceAll("_", " ");
}

type Props = {
  selected?: string | null;
  onSelect?: (regionId: string) => void;
  /** highlight color per region id, e.g. sites of open surgical cases */
  marks?: Record<string, string | undefined>;
  height?: number;
};

export function JawMap({ selected, onSelect, marks = {}, height = 280 }: Props) {
  return (
    <svg
      viewBox="0 0 320 260"
      role="img"
      aria-label="Maxillofacial region map"
      style={{ width: "100%", height, maxHeight: height }}
    >
      {/* skull silhouette */}
      <path
        d="M160 8 Q64 8 56 92 Q52 140 76 172 Q92 210 130 234 Q160 252 190 234 Q228 210 244 172 Q268 140 264 92 Q256 8 160 8 Z"
        fill="#f4f7fc"
        stroke="#b6c8e6"
        strokeWidth={1.5}
      />
      {/* orbits + nasal hint */}
      <ellipse cx={118} cy={56} rx={18} ry={12} fill="#e4ebf7" stroke="#b6c8e6" />
      <ellipse cx={202} cy={56} rx={18} ry={12} fill="#e4ebf7" stroke="#b6c8e6" />
      <path d="M160 60 L152 96 Q160 104 168 96 Z" fill="#e4ebf7" stroke="#b6c8e6" />
      {/* occlusal line */}
      <path d="M104 148 Q160 162 216 148" fill="none" stroke="#b6c8e6" strokeDasharray="4 3" />

      {JAW_REGIONS.map((r) => {
        const isSelected = selected === r.id;
        const mark = marks[r.id];
        return (
          <g
            key={r.id}
            onClick={() => onSelect?.(r.id)}
            style={{ cursor: onSelect ? "pointer" : "default" }}
          >
            <path
              d={r.path}
              fill={isSelected ? "#0b5fff" : mark ?? "#ffffff"}
              fillOpacity={isSelected ? 0.85 : mark ? 0.75 : 0.5}
              stroke={isSelected ? "#0b5fff" : "#8ba7d4"}
              strokeWidth={isSelected ? 2 : 1}
            />
            <text
              x={r.labelX}
              y={r.labelY}
              textAnchor="middle"
              fontSize={7.5}
              fontWeight={700}
              fill={isSelected ? "#0b2c78" : "#51617a"}
              pointerEvents="none"
            >
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

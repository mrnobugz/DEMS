/** CS 3D Imaging-style Objects toolbox: show/hide mapped anatomy. */

export type ObjectLayerKey =
  | "teeth"
  | "maxilla"
  | "mandible"
  | "canalArch"
  | "nerves"
  | "implants"
  | "crowns"
  | "endo"
  | "wire";

export const DEFAULT_OBJECT_LAYERS: Record<ObjectLayerKey, boolean> = {
  teeth: true,
  maxilla: false,
  mandible: false,
  canalArch: false,
  nerves: false,
  implants: false,
  crowns: false,
  endo: false,
  wire: false,
};

const LABELS: { key: ObjectLayerKey; label: string; swatch: string }[] = [
  { key: "teeth", label: "Teeth", swatch: "#f5f2e9" },
  { key: "maxilla", label: "Maxilla arch", swatch: "#ef4444" },
  { key: "mandible", label: "Mandible arch", swatch: "#f97316" },
  { key: "canalArch", label: "Canal arch", swatch: "#eab308" },
  { key: "nerves", label: "Nerve canals", swatch: "#facc15" },
  { key: "implants", label: "Implants", swatch: "#9ca3af" },
  { key: "crowns", label: "Virtual crowns", swatch: "#f59e0b" },
  { key: "endo", label: "Endo canals", swatch: "#7c3aed" },
  { key: "wire", label: "Archwire", swatch: "#c9ced6" },
];

export function ObjectsPanel({
  layers,
  onToggle,
}: {
  layers: Record<ObjectLayerKey, boolean>;
  onToggle: (key: ObjectLayerKey) => void;
}) {
  return (
    <div className="rounded-2xl border border-brand-100 bg-white/80 p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Objects</p>
      <ul className="space-y-1">
        {LABELS.map((row) => (
          <li key={row.key}>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={layers[row.key]}
                onChange={() => onToggle(row.key)}
              />
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
                style={{ background: row.swatch }}
              />
              {row.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

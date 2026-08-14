/** CS 3D Imaging-style Objects toolbox: show/hide mapped anatomy. */

export type ObjectLayerKey = "teeth" | "nerves" | "implants" | "endo" | "wire";

const LABELS: { key: ObjectLayerKey; label: string; swatch: string }[] = [
  { key: "teeth", label: "Teeth", swatch: "#f5f2e9" },
  { key: "nerves", label: "Nerve canals", swatch: "#facc15" },
  { key: "implants", label: "Implants", swatch: "#9ca3af" },
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

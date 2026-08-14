/**
 * CS Imaging 8 Dental Arch Filter — click teeth that have studies to filter
 * the patient history gallery. Light = images available, dark = none, blue = active.
 */

import { PERMANENT_LOWER, PERMANENT_UPPER, PRIMARY_LOWER, PRIMARY_UPPER, type Dentition } from "./teeth";

type Props = {
  dentition?: Dentition;
  /** FDI numbers that have at least one study */
  available: Set<string> | string[];
  selected: string[];
  onChange: (teeth: string[]) => void;
};

export function DentalArchFilter({ dentition = "permanent", available, selected, onChange }: Props) {
  const have = available instanceof Set ? available : new Set(available);
  const active = new Set(selected);
  const upper = dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
  const lower = dentition === "primary" ? PRIMARY_LOWER : PERMANENT_LOWER;

  function toggle(fdi: string) {
    if (!have.has(fdi)) return;
    onChange(active.has(fdi) ? selected.filter((t) => t !== fdi) : [...selected, fdi]);
  }

  function Row({ ids }: { ids: string[] }) {
    return (
      <div className="flex justify-center gap-0.5">
        {ids.map((fdi) => {
          const on = have.has(fdi);
          const isActive = active.has(fdi);
          return (
            <button
              key={fdi}
              type="button"
              disabled={!on}
              title={on ? `Filter tooth ${fdi}` : `No images for ${fdi}`}
              onClick={() => toggle(fdi)}
              className={`h-7 w-6 rounded text-[9px] font-bold ${
                isActive
                  ? "bg-brand-500 text-white"
                  : on
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "bg-slate-100 text-slate-300"
              }`}
            >
              {fdi}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Dental arch filter</p>
        {selected.length > 0 && (
          <button type="button" className="text-[10px] font-semibold text-brand-700" onClick={() => onChange([])}>
            Clear teeth
          </button>
        )}
      </div>
      <Row ids={upper} />
      <div className="mx-auto h-px max-w-md bg-brand-100" />
      <Row ids={lower} />
      <p className="text-center text-[10px] text-muted">
        Grey = images tagged · blue = active filter · click to isolate
      </p>
    </div>
  );
}

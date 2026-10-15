/**
 * Tooth filter for the imaging gallery.
 * Enabled teeth have studies. A pressed tooth is part of the active filter.
 * Patient's right is on the viewer's left.
 */

import { useId } from "react";
import { PERMANENT_LOWER, PERMANENT_UPPER, PRIMARY_LOWER, PRIMARY_UPPER, type Dentition } from "./teeth";

type Props = {
  dentition?: Dentition;
  /** FDI numbers that have at least one study */
  available: Set<string> | string[];
  selected: string[];
  onChange: (teeth: string[]) => void;
};

function Quadrant({
  ids,
  label,
  labelId,
  have,
  active,
  onToggle,
}: {
  ids: string[];
  label: string;
  labelId: string;
  have: Set<string>;
  active: Set<string>;
  onToggle: (fdi: string) => void;
}) {
  return (
    <div>
      <p id={labelId} className="mb-2 text-center text-xs font-semibold text-muted">
        {label}
      </p>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-labelledby={labelId}>
        {ids.map((fdi) => {
          const on = have.has(fdi);
          const isActive = active.has(fdi);
          return (
            <button
              key={fdi}
              type="button"
              disabled={!on}
              title={on ? `Filter studies for tooth ${fdi}` : `No images for tooth ${fdi}`}
              aria-pressed={isActive}
              aria-label={
                on
                  ? `Tooth ${fdi}, images on file${isActive ? ", included in filter" : ""}`
                  : `Tooth ${fdi}, no images`
              }
              onClick={() => onToggle(fdi)}
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-xs font-bold ${
                isActive
                  ? "bg-brand-600 text-white underline"
                  : on
                    ? "border border-brand-100 bg-canvas text-ink"
                    : "border border-brand-100 bg-canvas text-muted"
              }`}
            >
              {fdi}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DentalArchFilter({ dentition = "permanent", available, selected, onChange }: Props) {
  const have = available instanceof Set ? available : new Set(available);
  const active = new Set(selected);
  const upper = dentition === "primary" ? PRIMARY_UPPER : PERMANENT_UPPER;
  const lower = dentition === "primary" ? PRIMARY_LOWER : PERMANENT_LOWER;
  const upperMid = Math.ceil(upper.length / 2);
  const lowerMid = Math.ceil(lower.length / 2);
  const baseId = useId();

  function toggle(fdi: string) {
    if (!have.has(fdi)) return;
    onChange(active.has(fdi) ? selected.filter((t) => t !== fdi) : [...selected, fdi]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Tooth filter</h3>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
        >
          Clear teeth
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Quadrant ids={upper.slice(0, upperMid)} label="Upper right" labelId={`${baseId}-ur`} have={have} active={active} onToggle={toggle} />
        <Quadrant ids={upper.slice(upperMid)} label="Upper left" labelId={`${baseId}-ul`} have={have} active={active} onToggle={toggle} />
        <Quadrant ids={lower.slice(0, lowerMid)} label="Lower right" labelId={`${baseId}-lr`} have={have} active={active} onToggle={toggle} />
        <Quadrant ids={lower.slice(lowerMid)} label="Lower left" labelId={`${baseId}-ll`} have={have} active={active} onToggle={toggle} />
      </div>
      <p className="text-sm text-muted">
        Enabled teeth have images. A pressed, underlined tooth is in the filter. Patient&apos;s right is on the left.
      </p>
    </div>
  );
}

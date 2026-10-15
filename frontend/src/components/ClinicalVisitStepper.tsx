/**
 * Progressive clinical visit stepper — numbered progress + one open step body.
 * Used by chairside department clerkship flows (not a new design language).
 */

import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type VisitStepDef = {
  id: string;
  title: string;
  hint: string;
};

type Props = {
  steps: VisitStepDef[];
  current: number;
  completed: ReadonlySet<number> | number[];
  onSelect: (index: number) => void;
  children: ReactNode;
  /** Optional patient line under the progress bar */
  eyebrow?: ReactNode;
};

function asSet(completed: ReadonlySet<number> | number[]): ReadonlySet<number> {
  return completed instanceof Set ? completed : new Set(completed);
}

export function ClinicalVisitStepper({
  steps,
  current,
  completed,
  onSelect,
  children,
  eyebrow,
}: Props) {
  const done = asSet(completed);
  const pct = steps.length <= 1 ? 100 : Math.round((Math.min(current, steps.length - 1) / (steps.length - 1)) * 100);

  return (
    <div className="visit-stepper glass-panel">
      <div className="visit-stepper__head">
        {eyebrow}
        <ol className="visit-stepper__track" aria-label="Visit progress">
          {steps.map((step, index) => {
            const isDone = done.has(index);
            const isCurrent = index === current;
            const isNext = index === current + 1;
            const canOpen = isDone || index <= current || isNext;
            return (
              <li key={step.id} className="visit-stepper__item">
                {index > 0 && (
                  <span
                    className={`visit-stepper__connector${isDone || index <= current ? " is-on" : ""}`}
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  className={`visit-stepper__node${isCurrent ? " is-current" : ""}${isDone ? " is-done" : ""}${isNext ? " is-next" : ""}`}
                  onClick={() => canOpen && onSelect(index)}
                  disabled={!canOpen}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-label={`${step.title}${isDone ? ", completed" : isCurrent ? ", current" : ""}`}
                >
                  <span className="visit-stepper__bubble" aria-hidden>
                    {isDone && !isCurrent ? <Check size={16} strokeWidth={2.5} /> : index + 1}
                  </span>
                  <span className="visit-stepper__label">
                    <span className="visit-stepper__title">{step.title}</span>
                    {isCurrent && <span className="visit-stepper__hint">{step.hint}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div
          className="visit-stepper__bar"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
          aria-label={`Step ${current + 1} of ${steps.length}`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="visit-stepper__body" key={steps[current]?.id ?? current}>
        <header className="visit-stepper__stage">
          <div>
            <h3 className="font-display text-base font-bold text-brand-900">
              {steps[current]?.title}
            </h3>
            <p className="text-sm text-muted">{steps[current]?.hint}</p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted">
            {current + 1}/{steps.length}
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}

type DropProps = {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

/** Collapsed review strip for a completed (or past) step. */
export function VisitStepDrop({ index, title, hint, done, open, onToggle, children }: DropProps) {
  return (
    <section className={`visit-drop${open ? " is-open" : ""}${done ? " is-done" : ""}`}>
      <button
        type="button"
        className="visit-drop__toggle min-h-[var(--touch-min)]"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={`visit-drop__num${done ? " is-done" : ""}`} aria-hidden>
          {done ? <Check size={14} strokeWidth={2.5} /> : index + 1}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold text-brand-900">{title}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
        <span className="text-xs font-bold uppercase tracking-wide text-brand-700">
          {open ? "Hide" : done ? "Review" : "Open"}
        </span>
      </button>
      {open ? <div className="visit-drop__body">{children}</div> : null}
    </section>
  );
}

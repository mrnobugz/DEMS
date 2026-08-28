import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

export function RevealSection({
  title,
  hint,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  preview,
  children,
  className = "glass-panel",
  showLabel = "Show",
  collapsible = true,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  preview?: ReactNode;
  children?: ReactNode;
  className?: string;
  showLabel?: string;
  collapsible?: boolean;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = !collapsible || (openProp ?? internal);

  function toggle() {
    if (!collapsible) return;
    const next = !open;
    if (openProp === undefined) setInternal(next);
    onOpenChange?.(next);
  }

  if (!collapsible) {
    return <div className={className || undefined}>{children}</div>;
  }

  return (
    <section className={className}>
      <button type="button" className="reveal-toggle" onClick={toggle} aria-expanded={open}>
        <span className="reveal-toggle__icon" aria-hidden>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="reveal-toggle__text">
          <span className="reveal-toggle__title">{title}</span>
          {hint && <span className="reveal-toggle__hint">{hint}</span>}
        </span>
        <span className="reveal-toggle__action">{open ? "Hide" : showLabel}</span>
      </button>
      {preview ? <div className="reveal-toggle__preview">{preview}</div> : null}
      {open ? <div className="reveal-toggle__body">{children}</div> : null}
    </section>
  );
}

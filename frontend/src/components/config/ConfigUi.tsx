import { KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from "react";

export function onTabListKeyDown<T extends string>(
  e: KeyboardEvent,
  ids: readonly T[],
  current: T,
  setCurrent: (id: T) => void,
) {
  const i = ids.indexOf(current);
  if (i < 0) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    setCurrent(ids[(i + 1) % ids.length]!);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    setCurrent(ids[(i - 1 + ids.length) % ids.length]!);
  } else if (e.key === "Home") {
    e.preventDefault();
    setCurrent(ids[0]!);
  } else if (e.key === "End") {
    e.preventDefault();
    setCurrent(ids[ids.length - 1]!);
  }
}

export function ConfigStatus({
  loading,
  error,
  ok,
}: {
  loading?: boolean;
  error?: string;
  ok?: string;
}) {
  if (!loading && !error && !ok) return null;
  return (
    <div className="config-status" role="status" aria-live="polite">
      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm font-semibold text-red-700" role="alert">{error}</p>}
      {ok && !error && <p className="text-sm font-semibold text-brand-800">{ok}</p>}
    </div>
  );
}

export function ConfigField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="config-field text-sm">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="config-field__hint">{hint}</span>}
    </label>
  );
}

export function ConfirmAction({
  label,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  message,
  destructive = false,
  onConfirm,
  variant = "ghost",
  className = "",
  disabled = false,
}: {
  label: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Consequence shown while armed, e.g. what is removed and whether it can be undone. */
  message?: string;
  /** Styles the confirm button as destructive instead of primary. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const messageId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (armed) cancelRef.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [armed]);

  function disarm() {
    restoreFocus.current = true;
    setArmed(false);
  }

  if (!armed) {
    const baseClass =
      variant === "primary"
        ? "btn-primary min-h-[var(--touch-min)]"
        : variant === "danger"
          ? "btn-ghost text-danger hover:bg-danger/10"
          : "btn-ghost text-sm";
    return (
      <button
        ref={triggerRef}
        type="button"
        className={`${baseClass} ${className}`.trim()}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }
  const describedBy = message ? messageId : undefined;
  return (
    <span
      className={`config-confirm ${className}`.trim()}
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          disarm();
        }
      }}
    >
      {message && (
        <span id={messageId} className="basis-full text-sm text-text">
          {message}
        </span>
      )}
      <button
        type="button"
        className={destructive ? "btn-ghost text-sm font-semibold text-danger" : "btn-primary text-sm"}
        aria-describedby={describedBy}
        onClick={() => {
          disarm();
          void onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button ref={cancelRef} type="button" className="btn-ghost text-sm" aria-describedby={describedBy} onClick={disarm}>
        {cancelLabel}
      </button>
    </span>
  );
}
